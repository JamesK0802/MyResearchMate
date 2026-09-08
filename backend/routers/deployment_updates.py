import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user


router = APIRouter(prefix="/deployment", tags=["deployment"])


async def require_deployment_admin(user: dict = Depends(get_current_user)):
    if user.get("role") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only the system owner can update the server")
    return user


def _state_dir() -> Path:
    data_root = Path(os.getenv("LAB_NOTEBOOK_DATA_DIR", "/app/data"))
    return data_root / "deployment-update"


def _read_json(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _atomic_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_name, 0o664)
        os.replace(temporary_name, path)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


@router.post("/update", status_code=202)
async def request_update(current_user: dict = Depends(require_deployment_admin)):
    state_dir = _state_dir()
    if not (state_dir / "installed.json").is_file():
        raise HTTPException(
            status_code=503,
            detail="Server update service is not installed. Run sudo ./deploy/install-managed-update.sh once on the host server.",
        )

    current = _read_json(state_dir / "status.json")
    if current and current.get("state") in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="A server update is already in progress")

    job_id = str(uuid.uuid4())
    requested_at = datetime.now(timezone.utc).isoformat()
    status_payload = {
        "job_id": job_id,
        "state": "queued",
        "stage": "queued",
        "message": "Update queued",
        "requested_at": requested_at,
        "requested_by": current_user.get("email", "manager"),
        "commits": [],
        "changed_files": [],
    }
    _atomic_write(state_dir / "status.json", status_payload)
    _atomic_write(
        state_dir / "request.json",
        {"job_id": job_id, "requested_at": requested_at, "requested_by": current_user.get("email", "manager")},
    )
    return status_payload


@router.get("/update/{job_id}")
async def update_status(job_id: str, _current_user: dict = Depends(require_deployment_admin)):
    current = _read_json(_state_dir() / "status.json")
    if not current or current.get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="Update status not found")
    return current
