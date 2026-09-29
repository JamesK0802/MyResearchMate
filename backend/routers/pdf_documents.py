from datetime import datetime, timezone
import base64
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from auth.dependencies import get_current_user
from database.db import get_db
from database.models import Lab, LabMember, PdfDocument, PdfDocumentShare, PdfSignature, User
from storage.file_store import personal_tool_dir, read_json, relative_data_path, resolve_data_path, write_json


router = APIRouter(prefix="/pdf-documents", tags=["pdf-documents"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _folder(user: dict, kind: str, create: bool = True) -> Path:
    # These names intentionally match the folders exposed in Server Data.
    return personal_tool_dir(user, "document" if kind == "document" else "sign", create=create)


def _document_record(row: PdfDocument, include_document: bool = False):
    result = {"id": str(row.id), "title": row.title, "created_at": row.created_at.isoformat() if row.created_at else None, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    if include_document:
        result["document_json"] = row.document_json or {}
    return result


def _migrate_legacy_files(db: Session, current_user: dict) -> None:
    """Move legacy JSON metadata into PostgreSQL and leave only binary assets in /data."""
    changed = False
    migrated_paths: list[Path] = []
    for path in _folder(current_user, "document").glob("*.json"):
        payload = read_json(relative_data_path(path), {})
        try:
            record_id = UUID(str(payload.get("id") or path.stem))
        except (ValueError, TypeError):
            continue
        if not db.query(PdfDocument).filter(PdfDocument.id == record_id).first():
            pdf_path = path.with_suffix(".pdf")
            db.add(PdfDocument(id=record_id, owner_user_id=current_user["id"], title=str(payload.get("title") or "Untitled PDF"), document_json=payload.get("document_json") or {}, storage_path=relative_data_path(pdf_path)))
        migrated_paths.append(path)
        changed = True
    for path in _folder(current_user, "sign").glob("*.json"):
        payload = read_json(relative_data_path(path), {})
        image_url = ((payload.get("document_json") or {}).get("image_url") or "")
        try:
            record_id = UUID(str(payload.get("id") or path.stem))
            header, encoded = image_url.split(",", 1)
            mime_type = header.split(";")[0].replace("data:", "")
            suffix = ".jpg" if mime_type in ("image/jpeg", "image/jpg") else ".png"
            image_path = path.with_suffix(suffix)
            image_path.write_bytes(base64.b64decode(encoded))
        except (ValueError, TypeError, OSError):
            continue
        if not db.query(PdfSignature).filter(PdfSignature.id == record_id).first():
            db.add(PdfSignature(id=record_id, owner_user_id=current_user["id"], title=str(payload.get("title") or "My signature"), storage_path=relative_data_path(image_path), mime_type=mime_type))
        migrated_paths.append(path)
        changed = True
    if changed:
        db.commit()
        for path in migrated_paths:
            path.unlink(missing_ok=True)


def _share_access(document_id: UUID, current_user: dict, db: Session) -> tuple[str | None, User | None]:
    _migrate_legacy_files(db, current_user)
    if db.query(PdfDocument).filter(PdfDocument.id == document_id, PdfDocument.owner_user_id == current_user["id"]).first():
        return "owner", None
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    shares = db.query(PdfDocumentShare).filter(
        PdfDocumentShare.document_id == document_id,
        or_(PdfDocumentShare.lab_id.in_(lab_ids) if lab_ids else False, PdfDocumentShare.shared_with_user_id == current_user["id"]),
    ).all()
    if not shares:
        return None, None
    owner = db.query(User).filter(User.id == shares[0].owner_user_id).first()
    if owner:
        _migrate_legacy_files(db, owner)
    return ("edit" if any(share.access_level == "edit" for share in shares) else "read"), owner


def _decorate(record: dict, document_id: UUID, owner_id: int, db: Session, access: str, current_user: dict) -> dict:
    shares = db.query(PdfDocumentShare, Lab).join(Lab, PdfDocumentShare.lab_id == Lab.id).filter(
        PdfDocumentShare.document_id == document_id,
        PdfDocumentShare.owner_user_id == owner_id,
    ).all()
    owner = db.query(User).filter(User.id == owner_id).first()
    user_shares = db.query(PdfDocumentShare, User).join(User, PdfDocumentShare.shared_with_user_id == User.id).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == owner_id).all()
    record.update({
        "owner_user_id": owner_id,
        "is_shared": bool(shares or user_shares),
        "shared_with_labs": [item.Lab.lab_name for item in shares],
        "shared_with_users": [item.User.name or item.User.email for item in user_shares],
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
    _migrate_legacy_files(db, current_user)
    records = []
    if scope in ("all", "my"):
        for row in db.query(PdfDocument).filter(PdfDocument.owner_user_id == current_user["id"]).all():
            records.append(_decorate(_document_record(row), row.id, current_user["id"], db, "owner", current_user))
    if scope in ("all", "shared"):
        lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
        incoming = db.query(PdfDocumentShare).filter(
            or_(PdfDocumentShare.lab_id.in_(lab_ids) if lab_ids else False, PdfDocumentShare.shared_with_user_id == current_user["id"]),
            PdfDocumentShare.owner_user_id != current_user["id"],
        ).all()
        grouped: dict[UUID, list[PdfDocumentShare]] = {}
        for share in incoming:
            grouped.setdefault(share.document_id, []).append(share)
        for document_id, shares in grouped.items():
            owner = db.query(User).filter(User.id == shares[0].owner_user_id).first()
            if not owner:
                continue
            _migrate_legacy_files(db, owner)
            row = db.query(PdfDocument).filter(PdfDocument.id == document_id, PdfDocument.owner_user_id == owner.id).first()
            if row:
                access = "edit" if any(share.access_level == "edit" for share in shares) else "read"
                records.append(_decorate(_document_record(row), document_id, owner.id, db, access, current_user))
    return sorted(records, key=lambda item: item.get("updated_at") or "", reverse=True)


@router.get("/signatures")
async def list_signatures(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _migrate_legacy_files(db, current_user)
    records = []
    for row in db.query(PdfSignature).filter(PdfSignature.owner_user_id == current_user["id"]).order_by(PdfSignature.updated_at.desc(), PdfSignature.created_at.desc()).all():
        try:
            encoded = base64.b64encode(resolve_data_path(row.storage_path).read_bytes()).decode()
        except OSError:
            continue
        records.append({"id": str(row.id), "title": row.title, "created_at": row.created_at, "updated_at": row.updated_at, "document_json": {"image_url": f"data:{row.mime_type};base64,{encoded}"}})
    return records


@router.post("/signatures")
async def save_signature(payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    image_url = str(payload.get("image_url") or "")
    if not image_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="A signature image is required")
    try:
        header, encoded = image_url.split(",", 1)
        mime_type = header.split(";")[0].replace("data:", "")
        suffix = ".jpg" if mime_type in ("image/jpeg", "image/jpg") else ".png"
        raw = base64.b64decode(encoded)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="The signature image could not be saved")
    record_id = uuid4()
    path = _folder(current_user, "sign") / f"{record_id}{suffix}"
    path.write_bytes(raw)
    row = PdfSignature(id=record_id, owner_user_id=current_user["id"], title=str(payload.get("title") or "My signature")[:120], storage_path=relative_data_path(path), mime_type=mime_type)
    db.add(row); db.commit(); db.refresh(row)
    return {"id": str(row.id), "title": row.title, "created_at": row.created_at, "updated_at": row.updated_at, "document_json": {"image_url": image_url}}


@router.delete("/signatures/{signature_id}")
async def delete_signature(signature_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    row = db.query(PdfSignature).filter(PdfSignature.id == signature_id, PdfSignature.owner_user_id == current_user["id"]).first()
    if row:
        resolve_data_path(row.storage_path).unlink(missing_ok=True)
        db.delete(row); db.commit()
    return {"message": "Deleted"}


@router.get("/{document_id}")
async def get_pdf_document(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    access, owner = _share_access(document_id, current_user, db)
    if not access:
        raise HTTPException(status_code=404, detail="PDF document not found")
    row = db.query(PdfDocument).filter(PdfDocument.id == document_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDF document not found")
    return _decorate(_document_record(row, True), document_id, current_user["id"] if access == "owner" else owner.id, db, access, current_user)


@router.post("")
async def create_pdf_document(payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    title = str(payload.get("title") or "Untitled PDF").strip()[:180]
    document = payload.get("document_json")
    if not isinstance(document, dict):
        raise HTTPException(status_code=400, detail="Document data is required")
    record_id = uuid4()
    document = dict(document)
    _write_pdf(_folder(current_user, "document"), str(record_id), document)
    path = _folder(current_user, "document") / f"{record_id}.pdf"
    row = PdfDocument(id=record_id, owner_user_id=current_user["id"], title=title, document_json=document, storage_path=relative_data_path(path))
    db.add(row); db.commit(); db.refresh(row)
    return _document_record(row, True)


@router.put("/{document_id}")
async def update_pdf_document(document_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    access, owner = _share_access(document_id, current_user, db)
    if access not in ("owner", "edit"):
        raise HTTPException(status_code=403, detail="This PDF document is read-only")
    owner_user = current_user if access == "owner" else owner
    row = db.query(PdfDocument).filter(PdfDocument.id == document_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDF document not found")
    row.title = str(payload.get("title") or row.title or "Untitled PDF").strip()[:180]
    if isinstance(payload.get("document_json"), dict):
        document = dict(payload["document_json"])
        _write_pdf(_folder(owner_user, "document"), str(document_id), document)
        row.document_json = document
    db.commit(); db.refresh(row)
    owner_id = current_user["id"] if access == "owner" else owner.id
    return _decorate(_document_record(row, True), document_id, owner_id, db, access, current_user)


@router.get("/{document_id}/shares")
async def get_pdf_document_shares(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _migrate_legacy_files(db, current_user)
    if not db.query(PdfDocument).filter(PdfDocument.id == document_id, PdfDocument.owner_user_id == current_user["id"]).first():
        raise HTTPException(status_code=403, detail="Not authorized")
    shares = db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).all()
    return {
        "view_lab_ids": [str(share.lab_id) for share in shares if share.lab_id],
        "edit_lab_ids": [str(share.lab_id) for share in shares if share.access_level == "edit"],
        "view_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id],
        "edit_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id and share.access_level == "edit"],
    }


@router.put("/{document_id}/shares")
async def update_pdf_document_shares(document_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _migrate_legacy_files(db, current_user)
    if not db.query(PdfDocument).filter(PdfDocument.id == document_id, PdfDocument.owner_user_id == current_user["id"]).first():
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).delete()
    read_ids = payload.get("view_lab_ids", payload.get("read_only_lab_ids", []))
    edit_ids = payload.get("edit_lab_ids", [])
    for lab_id in read_ids:
        try:
            db.add(PdfDocumentShare(document_id=document_id, owner_user_id=current_user["id"], lab_id=UUID(lab_id), shared_by_user_id=current_user["id"], access_level="edit" if lab_id in edit_ids else "read"))
        except (ValueError, TypeError):
            continue
    edit_user_ids = {str(item) for item in payload.get("edit_user_ids", [])}
    for user_id in payload.get("view_user_ids", []):
        try:
            target_id = int(user_id)
            if target_id != current_user["id"]:
                db.add(PdfDocumentShare(document_id=document_id, owner_user_id=current_user["id"], shared_with_user_id=target_id, shared_by_user_id=current_user["id"], access_level="edit" if str(user_id) in edit_user_ids else "read"))
        except (ValueError, TypeError):
            continue
    db.commit()
    return {"message": "Shares updated successfully"}


@router.delete("/{document_id}")
async def delete_pdf_document(document_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _migrate_legacy_files(db, current_user)
    row = db.query(PdfDocument).filter(PdfDocument.id == document_id, PdfDocument.owner_user_id == current_user["id"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDF document not found")
    resolve_data_path(row.storage_path).unlink(missing_ok=True)
    db.query(PdfDocumentShare).filter(PdfDocumentShare.document_id == document_id, PdfDocumentShare.owner_user_id == current_user["id"]).delete()
    db.delete(row); db.commit()
    return {"message": "Deleted"}
