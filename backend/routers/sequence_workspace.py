import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.db import get_db
from database.models import SequenceWorkspaceFile
from storage.file_store import personal_tool_dir, read_json, relative_data_path, resolve_data_path, write_json
from storage.quota import personal_usage, personal_quota
from utils.fastq_paging import iter_fastq_reads, read_fastq_page
from utils.alignment_paging import read_alignment_results, read_ordered_alignment_page


router = APIRouter(prefix="/sequence-workspace", tags=["sequence-workspace"])

CHUNK_SIZE = 1024 * 1024
UPLOAD_CHUNK_SIZE = 512 * 1024
UPLOAD_SESSION_MAX_AGE = 24 * 60 * 60
logger = logging.getLogger(__name__)


def user_storage_dir(current_user: dict) -> Path:
    directory = personal_tool_dir(current_user, "sequence-viewer") / "files"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def upload_storage_dir(current_user: dict) -> Path:
    directory = personal_tool_dir(current_user, "sequence-viewer") / "uploads"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def upload_session_paths(current_user: dict, upload_id: uuid.UUID) -> tuple[Path, Path]:
    directory = upload_storage_dir(current_user)
    stem = str(upload_id)
    return directory / f"{stem}.part", directory / f"{stem}.json"


def read_upload_session(state_path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Upload session not found or expired") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid upload session")
    return payload


def cleanup_stale_uploads(current_user: dict) -> None:
    cutoff = time.time() - UPLOAD_SESSION_MAX_AGE
    for state_path in upload_storage_dir(current_user).glob("*.json"):
        try:
            if state_path.stat().st_mtime >= cutoff:
                continue
            part_path = state_path.with_suffix(".part")
            state_path.unlink(missing_ok=True)
            part_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove stale sequence upload %s", state_path, exc_info=True)


def current_usage(db: Session, user_id: int) -> int:
    return personal_usage(db, user_id)


def serialize(row: SequenceWorkspaceFile) -> dict[str, Any]:
    metadata_path = Path(row.storage_path).parent.parent / "metadata" / f"{row.id}.json" if row.storage_path else None
    metadata = read_json(metadata_path.as_posix(), row.metadata_json or {}) if metadata_path else row.metadata_json or {}
    return {
        "id": str(row.id),
        "original_name": row.original_name,
        "size_bytes": row.size_bytes,
        "metadata_json": metadata,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def get_owned_file(file_id: uuid.UUID, db: Session, current_user: dict) -> SequenceWorkspaceFile:
    row = db.query(SequenceWorkspaceFile).filter(
        SequenceWorkspaceFile.id == file_id,
        SequenceWorkspaceFile.owner_user_id == current_user["id"],
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved sequence file not found")
    return row


class SequenceFileRename(BaseModel):
    name: str
    item_index: int = 0


class SequenceUploadInit(BaseModel):
    filename: str
    size_bytes: int
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class AlignmentPagePayload(BaseModel):
    alignment_id: uuid.UUID
    offset: int = Field(ge=0)
    reads: list[dict[str, Any]] = Field(max_length=5000)
    results: list[dict[str, Any]] = Field(max_length=5000)


@router.get("/usage")
async def get_usage(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return {"used_bytes": current_usage(db, current_user["id"]), "quota_bytes": personal_quota(db, current_user["id"])}


@router.get("/files")
async def list_files(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rows = db.query(SequenceWorkspaceFile).filter(
        SequenceWorkspaceFile.owner_user_id == current_user["id"]
    ).order_by(SequenceWorkspaceFile.updated_at.desc(), SequenceWorkspaceFile.created_at.desc()).all()
    return [serialize(row) for row in rows]


@router.post("/uploads")
async def create_upload_session(
    payload: SequenceUploadInit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    filename = Path(payload.filename).name
    if not filename or filename != payload.filename or filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Enter a valid file name without a folder path")
    if payload.size_bytes < 0:
        raise HTTPException(status_code=400, detail="Invalid file size")

    cleanup_stale_uploads(current_user)
    used_bytes = current_usage(db, current_user["id"])
    quota_bytes = personal_quota(db, current_user["id"])
    if used_bytes + payload.size_bytes > quota_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                "Storage limit exceeded. Your current personal storage allocation is "
                f"{quota_bytes / 1024 ** 3:.2f} GB "
                f"({used_bytes / 1024 ** 3:.2f} GB currently used). "
                "Please use Request increase to ask an administrator for more storage."
            ),
        )

    upload_id = uuid.uuid4()
    part_path, state_path = upload_session_paths(current_user, upload_id)
    part_path.touch(exist_ok=False)
    write_json(state_path, {
        "filename": filename,
        "size_bytes": payload.size_bytes,
        "metadata_json": payload.metadata_json,
        "created_at": time.time(),
    })
    return {"upload_id": str(upload_id), "chunk_size": UPLOAD_CHUNK_SIZE}


@router.put("/uploads/{upload_id}")
async def append_upload_chunk(
    upload_id: uuid.UUID,
    request: Request,
    offset: int = Query(ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    part_path, state_path = upload_session_paths(current_user, upload_id)
    state = read_upload_session(state_path)
    chunk = await request.body()
    if not chunk or len(chunk) > UPLOAD_CHUNK_SIZE:
        raise HTTPException(status_code=400, detail=f"Upload chunks must be 1 to {UPLOAD_CHUNK_SIZE} bytes")

    current_size = part_path.stat().st_size if part_path.is_file() else -1
    # Mobile networks and reverse proxies can lose the response after the server
    # has already appended a chunk, then transparently retry the same PUT. Treat
    # an identical immediately-previous chunk as success so uploads are resumable.
    if current_size == offset + len(chunk) and part_path.is_file():
        with part_path.open("rb") as existing:
            existing.seek(offset)
            if existing.read(len(chunk)) == chunk:
                return {"received_bytes": current_size, "size_bytes": int(state.get("size_bytes", -1))}
    if current_size != offset:
        raise HTTPException(status_code=409, detail=f"Upload offset mismatch; expected {current_size}")
    expected_size = int(state.get("size_bytes", -1))
    if current_size + len(chunk) > expected_size:
        raise HTTPException(status_code=400, detail="Upload exceeds the declared file size")
    if current_usage(db, current_user["id"]) + len(chunk) > personal_quota(db, current_user["id"]):
        raise HTTPException(status_code=413, detail="Storage limit exceeded while uploading this file")

    try:
        with part_path.open("ab") as output:
            output.write(chunk)
    except OSError as exc:
        logger.exception("Could not append Sequence Viewer upload chunk")
        raise HTTPException(status_code=500, detail="Server could not write the uploaded file chunk") from exc
    return {"received_bytes": current_size + len(chunk), "size_bytes": expected_size}


@router.post("/uploads/{upload_id}/complete")
async def complete_upload_session(
    upload_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    part_path, state_path = upload_session_paths(current_user, upload_id)
    state = read_upload_session(state_path)
    expected_size = int(state.get("size_bytes", -1))
    actual_size = part_path.stat().st_size if part_path.is_file() else -1
    if actual_size != expected_size:
        raise HTTPException(status_code=409, detail=f"Upload is incomplete ({actual_size} of {expected_size} bytes)")

    filename = str(state["filename"])
    stored_name = f"{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
    destination = user_storage_dir(current_user) / stored_name
    row_id = uuid.uuid4()
    metadata_path = personal_tool_dir(current_user, "sequence-viewer") / "metadata" / f"{row_id}.json"
    try:
        os.replace(part_path, destination)
        write_json(metadata_path, state.get("metadata_json", {}))
        row = SequenceWorkspaceFile(
            id=row_id,
            owner_user_id=current_user["id"],
            original_name=filename,
            stored_name=stored_name,
            size_bytes=actual_size,
            metadata_json={},
            storage_path=relative_data_path(destination),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception as exc:
        db.rollback()
        destination.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        logger.exception("Could not finalize Sequence Viewer upload")
        raise HTTPException(status_code=500, detail="Server could not finalize the uploaded sequence file") from exc
    finally:
        state_path.unlink(missing_ok=True)
    return serialize(row)


@router.delete("/uploads/{upload_id}")
async def cancel_upload_session(
    upload_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
):
    part_path, state_path = upload_session_paths(current_user, upload_id)
    part_path.unlink(missing_ok=True)
    state_path.unlink(missing_ok=True)
    return {"ok": True}


@router.post("/files")
async def upload_file(
    file: UploadFile = File(...),
    metadata_json: str = Form("{}"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="A file is required")
    try:
        metadata = json.loads(metadata_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid sequence file metadata") from exc

    user_id = current_user["id"]
    used_bytes = current_usage(db, user_id)
    quota_bytes = personal_quota(db, user_id)
    suffix = Path(file.filename).suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    destination = user_storage_dir(current_user) / stored_name
    written = 0

    try:
        with destination.open("wb") as output:
            while chunk := await file.read(CHUNK_SIZE):
                written += len(chunk)
                if used_bytes + written > quota_bytes:
                    output.close()
                    destination.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "Storage limit exceeded. Your current personal storage allocation is "
                            f"{quota_bytes / 1024 ** 3:.2f} GB "
                            f"({used_bytes / 1024 ** 3:.2f} GB currently used). "
                            "Please use Request increase to ask an administrator for more storage."
                        ),
                    )
                output.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save the uploaded sequence file") from exc
    finally:
        await file.close()

    row_id = uuid.uuid4()
    metadata_path = personal_tool_dir(current_user, "sequence-viewer") / "metadata" / f"{row_id}.json"
    write_json(metadata_path, metadata if isinstance(metadata, dict) else {})
    row = SequenceWorkspaceFile(
        id=row_id,
        owner_user_id=user_id,
        original_name=Path(file.filename).name,
        stored_name=stored_name,
        size_bytes=written,
        metadata_json={},
        storage_path=relative_data_path(destination),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize(row)


@router.put("/files/{file_id}/metadata")
async def update_file_metadata(
    file_id: uuid.UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    metadata = payload.get("metadata_json")
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata_json must be an object")
    metadata_path = personal_tool_dir(current_user, "sequence-viewer") / "metadata" / f"{row.id}.json"
    write_json(metadata_path, metadata)
    row.metadata_json = {}
    db.commit()
    db.refresh(row)
    return serialize(row)


@router.patch("/files/{file_id}")
async def rename_file(
    file_id: uuid.UUID,
    payload: SequenceFileRename,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    requested_name = payload.name.strip()
    safe_name = Path(requested_name).name
    if not requested_name or requested_name != safe_name or safe_name in (".", ".."):
        raise HTTPException(status_code=400, detail="Enter a valid file name without a folder path")
    if len(safe_name) > 255:
        raise HTTPException(status_code=400, detail="File name must be 255 characters or fewer")

    metadata_path = personal_tool_dir(current_user, "sequence-viewer") / "metadata" / f"{row.id}.json"
    metadata = read_json(relative_data_path(metadata_path), {})
    items = metadata.get("items", []) if isinstance(metadata, dict) else []
    if 0 <= payload.item_index < len(items) and isinstance(items[payload.item_index], dict):
        items[payload.item_index]["name"] = safe_name
        metadata["items"] = items
        write_json(metadata_path, metadata)

    row.original_name = safe_name
    db.commit()
    db.refresh(row)
    return serialize(row)


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    file_path = resolve_data_path(row.storage_path) if row.storage_path else user_storage_dir(current_user) / row.stored_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored sequence file is missing")
    return FileResponse(file_path, filename=row.original_name, media_type="application/octet-stream")


@router.get("/files/{file_id}/reads")
async def read_file_reads(
    file_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=5000),
    alignment_id: Optional[uuid.UUID] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    name = row.original_name.lower()
    if not name.endswith((".fastq", ".fq", ".fastq.gz", ".fq.gz")):
        raise HTTPException(status_code=400, detail="Read paging is only available for FASTQ files")
    file_path = resolve_data_path(row.storage_path) if row.storage_path else user_storage_dir(current_user) / row.stored_name
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored sequence file is missing")
    try:
        reads, has_more = read_fastq_page(file_path, offset, limit)
    except (OSError, EOFError, UnicodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Stored FASTQ file could not be read") from exc
    if alignment_id:
        cache_dir = personal_tool_dir(current_user, "sequence-viewer") / "alignments" / str(row.id) / str(alignment_id)
        results = read_alignment_results(cache_dir, offset, len(reads))
        for read, result in zip(reads, results):
            if isinstance(result, dict):
                read["alignment"] = result
    return {
        "reads": reads,
        "offset": offset,
        "next_offset": offset + len(reads),
        "has_more": has_more,
    }


@router.get("/files/{file_id}/reads-stream")
async def stream_file_reads(
    file_id: uuid.UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=500000, ge=1, le=500000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    file_path = resolve_data_path(row.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stored sequence file is missing")

    def stream_records():
        emitted = 0
        for record_index, read in enumerate(iter_fastq_reads(file_path)):
            if record_index < offset:
                if record_index and record_index % 5000 == 0:
                    yield "\n"
                continue
            yield json.dumps(read, ensure_ascii=False, separators=(",", ":")) + "\n"
            emitted += 1
            if emitted >= limit:
                break

    return StreamingResponse(
        stream_records(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.put("/files/{file_id}/alignment-pages")
async def save_alignment_page(
    file_id: uuid.UUID,
    payload: AlignmentPagePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    if len(payload.reads) != len(payload.results):
        raise HTTPException(status_code=422, detail="Alignment reads and results must have the same length")
    cache_dir = personal_tool_dir(current_user, "sequence-viewer") / "alignments" / str(row.id) / str(payload.alignment_id)
    # One result page per client batch. read_alignment_results can slice both
    # these consolidated pages and the legacy 100-read page format.
    write_json(cache_dir / f"{payload.offset}.json", {"results": payload.results})
    grouped = {"aligned": [], "unaligned": []}
    for read, result in zip(payload.reads, payload.results):
        status = "aligned" if result.get("isAligned") else "unaligned"
        grouped[status].append({
            "id": str(read.get("id", "")),
            "seq": str(read.get("seq", "")),
            "qualString": "",
            "alignment": result,
        })
    for status, entries in grouped.items():
        for group_start in range(0, len(entries), 500):
            chunk = entries[group_start:group_start + 500]
            group_path = cache_dir / "groups" / status / f"{payload.offset:012d}-{group_start:06d}-{len(chunk):06d}.json"
            write_json(group_path, {"reads": chunk})
    return {"ok": True, "count": len(payload.results)}


@router.get("/files/{file_id}/alignments/{alignment_id}/reads")
async def read_ordered_alignment_results(
    file_id: uuid.UUID,
    alignment_id: uuid.UUID,
    order: str = Query(default="aligned"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=250),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    if order not in ("aligned", "unaligned"):
        raise HTTPException(status_code=422, detail="Order must be aligned or unaligned")
    cache_dir = personal_tool_dir(current_user, "sequence-viewer") / "alignments" / str(row.id) / str(alignment_id)
    reads, total = read_ordered_alignment_page(cache_dir, order, offset, limit)
    next_offset = offset + len(reads)
    return {"reads": reads, "offset": offset, "next_offset": next_offset, "has_more": next_offset < total, "total": total}


@router.delete("/files/{file_id}/alignments/{alignment_id}")
async def delete_alignment_cache(
    file_id: uuid.UUID,
    alignment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    cache_dir = personal_tool_dir(current_user, "sequence-viewer") / "alignments" / str(row.id) / str(alignment_id)
    shutil.rmtree(cache_dir, ignore_errors=True)
    return {"ok": True}


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    row = get_owned_file(file_id, db, current_user)
    file_path = resolve_data_path(row.storage_path) if row.storage_path else user_storage_dir(current_user) / row.stored_name
    db.delete(row)
    db.commit()
    file_path.unlink(missing_ok=True)
    metadata_path = personal_tool_dir(current_user, "sequence-viewer") / "metadata" / f"{row.id}.json"
    metadata_path.unlink(missing_ok=True)
    alignment_path = personal_tool_dir(current_user, "sequence-viewer") / "alignments" / str(row.id)
    shutil.rmtree(alignment_path, ignore_errors=True)
    return {"ok": True}
