from datetime import datetime, timezone
import base64
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user
from storage.file_store import personal_tool_dir, read_json, relative_data_path, resolve_data_path, write_json


router = APIRouter(prefix="/pdf-documents", tags=["pdf-documents"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _folder(user: dict, kind: str, create: bool = True) -> Path:
    # These names intentionally match the folders exposed in Server Data.
    return personal_tool_dir(user, "document" if kind == "document" else "sign", create=create)


def _record(path: Path, include_document: bool = False):
    payload = read_json(relative_data_path(path), {})
    if not isinstance(payload, dict):
        return None
    result = {key: payload.get(key) for key in ("id", "title", "created_at", "updated_at")}
    if include_document:
        result["document_json"] = payload.get("document_json", {})
    return result


def _write_pdf(folder: Path, record_id: str, document: dict) -> None:
    encoded = document.pop("pdf_base64", None)
    if not encoded:
        return
    try:
        (folder / f"{record_id}.pdf").write_bytes(base64.b64decode(encoded, validate=True))
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="The generated PDF could not be saved")


@router.get("")
async def list_pdf_documents(current_user: dict = Depends(get_current_user)):
    folder = _folder(current_user, "document")
    records = [_record(path) for path in folder.glob("*.json")]
    return sorted([item for item in records if item], key=lambda item: item.get("updated_at") or "", reverse=True)


@router.get("/signatures")
async def list_signatures(current_user: dict = Depends(get_current_user)):
    folder = _folder(current_user, "sign")
    records = [_record(path, include_document=True) for path in folder.glob("*.json")]
    return sorted([item for item in records if item], key=lambda item: item.get("updated_at") or "", reverse=True)


@router.post("/signatures")
async def save_signature(payload: dict, current_user: dict = Depends(get_current_user)):
    image_url = str(payload.get("image_url") or "")
    if not image_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="A signature image is required")
    record_id = str(uuid4())
    now = _now()
    record = {
        "id": record_id,
        "title": str(payload.get("title") or "My signature")[:120],
        "created_at": now,
        "updated_at": now,
        "document_json": {"image_url": image_url},
    }
    write_json(_folder(current_user, "sign") / f"{record_id}.json", record)
    return record


@router.delete("/signatures/{signature_id}")
async def delete_signature(signature_id: str, current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "sign") / f"{signature_id}.json"
    path.unlink(missing_ok=True)
    return {"message": "Deleted"}


@router.get("/{document_id}")
async def get_pdf_document(document_id: str, current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document") / f"{document_id}.json"
    record = _record(path, include_document=True) if path.is_file() else None
    if not record:
        raise HTTPException(status_code=404, detail="PDF document not found")
    return record


@router.post("")
async def create_pdf_document(payload: dict, current_user: dict = Depends(get_current_user)):
    title = str(payload.get("title") or "Untitled PDF").strip()[:180]
    document = payload.get("document_json")
    if not isinstance(document, dict):
        raise HTTPException(status_code=400, detail="Document data is required")
    record_id = str(uuid4())
    now = _now()
    document = dict(document)
    _write_pdf(_folder(current_user, "document"), record_id, document)
    record = {"id": record_id, "title": title, "created_at": now, "updated_at": now, "document_json": document}
    write_json(_folder(current_user, "document") / f"{record_id}.json", record)
    return record


@router.put("/{document_id}")
async def update_pdf_document(document_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document") / f"{document_id}.json"
    existing = _record(path, include_document=True) if path.is_file() else None
    if not existing:
        raise HTTPException(status_code=404, detail="PDF document not found")
    existing["title"] = str(payload.get("title") or existing.get("title") or "Untitled PDF").strip()[:180]
    if isinstance(payload.get("document_json"), dict):
        document = dict(payload["document_json"])
        _write_pdf(_folder(current_user, "document"), document_id, document)
        existing["document_json"] = document
    existing["updated_at"] = _now()
    write_json(path, existing)
    return existing


@router.delete("/{document_id}")
async def delete_pdf_document(document_id: str, current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document") / f"{document_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF document not found")
    path.unlink()
    (_folder(current_user, "document") / f"{document_id}.pdf").unlink(missing_ok=True)
    return {"message": "Deleted"}
