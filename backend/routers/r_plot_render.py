"""Run a user-supplied R plot script against an uploaded workbook.

The renderer works in a disposable, resource-limited directory and returns only
PNG files produced there. It is deliberately an authenticated endpoint: this is
for a researcher's own R/ggplot workflow, not a public code execution service.
"""
from __future__ import annotations

import base64
import os
import re
import resource
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth.dependencies import get_current_user


router = APIRouter(prefix="/r-plot-render", tags=["r-plot-render"])

MAX_SCRIPT_BYTES = 512 * 1024
MAX_WORKBOOK_BYTES = 25 * 1024 * 1024
MAX_OUTPUT_BYTES = 20 * 1024 * 1024
MAX_OUTPUTS = 12
FORBIDDEN_R_CALLS = re.compile(
    r"\b(?:system|system2|shell|pipe|socketConnection|download\.file|url|"
    r"file\.remove|unlink|source|dyn\.load)\s*\(", re.IGNORECASE
)


def _safe_filename(value: str, fallback: str) -> str:
    name = Path(value or fallback).name
    return name if name and name not in {".", ".."} else fallback


async def _read_limited(upload: UploadFile, maximum: int) -> bytes:
    data = await upload.read(maximum + 1)
    if len(data) > maximum:
        raise HTTPException(status_code=413, detail=f"{upload.filename or 'File'} is too large")
    return data


def _limits() -> None:
    """Apply a small resource envelope to R, then drop root when possible."""
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
    resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT_BYTES, MAX_OUTPUT_BYTES))
    # R opens package metadata, fonts, and graphics devices concurrently.
    # 64 is too low for ordinary ggplot2/cowplot workflows; 512 remains a
    # bounded limit while allowing a normal R Studio-compatible render.
    resource.setrlimit(resource.RLIMIT_NOFILE, (512, 512))
    if os.geteuid() == 0:
        os.setgid(65534)
        os.setuid(65534)


@router.post("/run")
async def run_r_plot(
    script: UploadFile = File(...),
    workbook: UploadFile | None = File(None),
    script_name: str = Form("figure.R"),
    input_name: str = Form(""),
    _current_user: dict = Depends(get_current_user),
):
    if not (script.filename or script_name).lower().endswith(".r"):
        raise HTTPException(status_code=422, detail="Upload an .R script")
    code = (await _read_limited(script, MAX_SCRIPT_BYTES)).decode("utf-8", errors="replace")
    if FORBIDDEN_R_CALLS.search(code):
        raise HTTPException(status_code=422, detail="This R script uses a command that cannot run in the isolated renderer")
    if workbook and not (workbook.filename or "").lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=422, detail="The source data must be .xlsx, .xls, or .csv")

    workdir = Path(tempfile.mkdtemp(prefix="mrm-r-plot-"))
    try:
        # The R subprocess uses nobody when available, so it needs ownership of
        # just this temporary directory and never the application data directory.
        if os.geteuid() == 0:
            os.chown(workdir, 65534, 65534)
        script_path = workdir / _safe_filename(script_name or script.filename or "figure.R", "figure.R")
        script_path.write_text(code, encoding="utf-8")
        if workbook:
            # R scripts commonly contain `input_file <- "name.xlsx"`.  Keep
            # that script untouched and place the selected upload at that name.
            workbook_path = workdir / _safe_filename(input_name or workbook.filename or "data.xlsx", "data.xlsx")
            workbook_path.write_bytes(await _read_limited(workbook, MAX_WORKBOOK_BYTES))

        safe_env = {
            "HOME": str(workdir), "TMPDIR": str(workdir), "PATH": os.environ.get("PATH", ""),
            "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "R_DEFAULT_PACKAGES": "datasets,utils,grDevices,graphics,stats,methods",
            "http_proxy": "", "https_proxy": "", "HTTP_PROXY": "", "HTTPS_PROXY": "", "NO_PROXY": "*",
        }
        # Source the user's code unchanged, then render its final ggplot/cowplot
        # object as SVG. This preserves R's layout instead of recreating it in
        # a browser chart library.
        runner = workdir / "render.R"
        runner.write_text(
            "source(" + repr(script_path.name) + ")\n"
            "target <- if (exists('figure2')) get('figure2') else ggplot2::last_plot()\n"
            "svglite::svglite('figure.svg', width=12.8, height=9.8)\nprint(target)\ndev.off()\n",
            encoding="utf-8",
        )
        result = subprocess.run(
            ["Rscript", "--vanilla", runner.name], cwd=workdir, env=safe_env,
            capture_output=True, text=True, timeout=70, preexec_fn=_limits,
        )
        stdout = (result.stdout or "")[-6000:]
        stderr = (result.stderr or "")[-6000:]
        if result.returncode != 0:
            raise HTTPException(status_code=422, detail=(stderr or stdout or "R could not render this script").strip())

        svg = workdir / "figure.svg"
        if not svg.exists():
            raise HTTPException(status_code=422, detail="R completed but did not produce an editable SVG figure")
        svg_data = "data:image/svg+xml;base64," + base64.b64encode(svg.read_bytes()).decode("ascii")
        images = []
        total = 0
        for image in sorted(workdir.rglob("*.png"), key=lambda item: item.stat().st_mtime):
            if len(images) >= MAX_OUTPUTS:
                break
            payload = image.read_bytes()
            total += len(payload)
            if total > MAX_OUTPUT_BYTES:
                break
            images.append({"name": image.name, "data_url": "data:image/png;base64," + base64.b64encode(payload).decode("ascii")})
        if not images:
            raise HTTPException(status_code=422, detail="R completed but did not create a PNG file. Use ggsave(..., '.png') or png().")
        return {"images": images, "svg": svg_data, "stdout": stdout}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=422, detail="R rendering exceeded the 70-second limit")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
