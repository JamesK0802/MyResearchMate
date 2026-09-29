from datetime import datetime, timezone
import base64
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.db import get_db
from database.models import Lab, LabMember, PdfDocumentShare, User
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


def _share_access(document_id: UUID, current_user: dict, db: Session) -> tuple[str | None, User | None]:
    own_path = _folder(current_user, "document", create=False) / f"{document_id}.json"
    if own_path.is_file():
        return "owner", None
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    if not lab_ids:
        return None, None
    shares = db.query(PdfDocumentShare).filter(
        PdfDocumentShare.document_id == document_id,
        PdfDocumentShare.lab_id.in_(lab_ids),
    ).all()
    if not shares:
        return None, None
    owner = db.query(User).filter(User.id == shares[0].owner_user_id).first()
    return ("edit" if any(share.access_level == "edit" for share in shares) else "read"), owner


def _decorate(record: dict, document_id: UUID, owner_id: int, db: Session, access: str, current_user: dict) -> dict:
    shares = db.query(PdfDocumentShare, Lab).join(Lab, PdfDocumentShare.lab_id == Lab.id).filter(
        PdfDocumentShare.document_id == document_id,
        PdfDocumentShare.owner_user_id == owner_id,
    ).all()
    owner = db.query(User).filter(User.id == owner_id).first()
    record.update({
        "owner_user_id": owner_id,
        "is_shared": bool(shares),
        "shared_with_labs": [item.Lab.lab_name for item in shares],
        "shared_by_name": None if owner_id == current_user["id"] else (owner.name or owner.email if owner else None),
        "share_access": access,
        "can_edit": access in ("owner", "edit"),
    })
    return record


def _write_pdf(folder: Path, record_id: str, document: dict) -> None:
    encoded = document.pop("pdf_base64", None)
    if not encoded:
        return
    try:
        (folder / f"{record_id}.pdf").write_bytes(base64.b64decode(encoded, validate=True))
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail="The generated PDF could not be saved")


@router.get("")
async def list_pdf_documents(scope: str = Query("all"), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if scope not in ("all", "my", "shared"):
        raise HTTPException(status_code=400, detail="Unknown data scope")
    folder = _folder(current_user, "document")
    records = []
    if scope in ("all", "my"):
        for path in folder.glob("*.json"):
            record = _record(path)
            if record:
                records.append(_decorate(record, UUID(record["id"]), current_user["id"], db, "owner", current_user))
    if scope in ("all", "shared"):
        lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
        incoming = db.query(PdfDocumentShare).filter(
            PdfDocumentShare.lab_id.in_(lab_ids),
            PdfDocumentShare.owner_user_id != current_user["id"],
        ).all() if lab_ids else []
        grouped: dict[UUID, list[PdfDocumentShare]] = {}
        for share in incoming:
            grouped.setdefault(share.document_id, []).append(share)
        for document_id, shares in grouped.items():
            owner = db.query(User).filter(User.id == shares[0].owner_user_id).first()
            if not owner:
                continue
            path = _folder(owner, "document", create=False) / f"{document_id}.json"
            record = _record(path) if path.is_file() else None
            if record:
                access = "edit" if any(share.access_level == "edit" for share in shares) else "read"
                records.append(_decorate(record, document_id, owner.id, db, access, current_user))
    return sorted(records, key=lambda item: item.get("updated_at") or "", reverse=True)


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
async def get_pdf_document(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    access, owner = _share_access(document_id, current_user, db)
    if not access:
        raise HTTPException(status_code=404, detail="PDF document not found")
    path = _folder(current_user if access == "owner" else owner, "document", create=False) / f"{document_id}.json"
    record = _record(path, include_document=True) if path.is_file() else None
    if not record:
        raise HTTPException(status_code=404, detail="PDF document not found")
    return _decorate(record, document_id, current_user["id"] if access == "owner" else owner.id, db, access, current_user)


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
async def update_pdf_document(document_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    access, owner = _share_access(document_id, current_user, db)
    if access not in ("owner", "edit"):
        raise HTTPException(status_code=403, detail="This PDF document is read-only")
    owner_user = current_user if access == "owner" else owner
    path = _folder(owner_user, "document", create=False) / f"{document_id}.json"
    existing = _record(path, include_document=True) if path.is_file() else None
    if not existing:
        raise HTTPException(status_code=404, detail="PDF document not found")
    existing["title"] = str(payload.get("title") or existing.get("title") or "Untitled PDF").strip()[:180]
    if isinstance(payload.get("document_json"), dict):
        document = dict(payload["document_json"])
        _write_pdf(_folder(owner_user, "document"), str(document_id), document)
        existing["document_json"] = document
    existing["updated_at"] = _now()
    write_json(path, existing)
    owner_id = current_user["id"] if access == "owner" else owner.id
    return _decorate(existing, document_id, owner_id, db, access, current_user)


@router.get("/{document_id}/shares")
async def get_pdf_document_shares(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document", create=False) / f"{document_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=403, detail="Not authorized")
    shares = db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).all()
    return {
        "read_only_lab_ids": [str(share.lab_id) for share in shares if share.access_level != "edit"],
        "edit_lab_ids": [str(share.lab_id) for share in shares if share.access_level == "edit"],
    }


@router.put("/{document_id}/shares")
async def update_pdf_document_shares(document_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document", create=False) / f"{document_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).delete()
    read_ids = payload.get("read_only_lab_ids", [])
    edit_ids = payload.get("edit_lab_ids", [])
    for access_level, lab_ids in (("read", read_ids), ("edit", edit_ids)):
        for lab_id in lab_ids:
            if access_level == "read" and lab_id in edit_ids:
                continue
            try:
                db.add(PdfDocumentShare(document_id=document_id, owner_user_id=current_user["id"], lab_id=UUID(lab_id), shared_by_user_id=current_user["id"], access_level=access_level))
            except (ValueError, TypeError):
                continue
    db.commit()
    return {"message": "Shares updated successfully"}


@router.delete("/{document_id}")
async def delete_pdf_document(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    path = _folder(current_user, "document") / f"{document_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF document not found")
    path.unlink()
    (_folder(current_user, "document") / f"{document_id}.pdf").unlink(missing_ok=True)
    db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).delete()
    db.commit()
    return {"message": "Deleted"}
