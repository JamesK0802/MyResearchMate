import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.db import get_db
from database.models import SequenceWorkspaceFile
from storage.file_store import personal_tool_dir, read_json, relative_data_path, resolve_data_path, write_json
from storage.quota import personal_usage, personal_quota


router = APIRouter(prefix="/sequence-workspace", tags=["sequence-workspace"])

CHUNK_SIZE = 1024 * 1024
def user_storage_dir(current_user: dict) -> Path:
    directory = personal_tool_dir(current_user, "sequence-viewer") / "files"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


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


@router.get("/usage")
async def get_usage(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return {"used_bytes": current_usage(db, current_user["id"]), "quota_bytes": personal_quota(db, current_user["id"])}


@router.get("/files")
async def list_files(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rows = db.query(SequenceWorkspaceFile).filter(
        SequenceWorkspaceFile.owner_user_id == current_user["id"]
    ).order_by(SequenceWorkspaceFile.updated_at.desc(), SequenceWorkspaceFile.created_at.desc()).all()
    return [serialize(row) for row in rows]


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
    return {"ok": True}
