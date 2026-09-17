import os
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user, require_admin
from database.db import get_db
from database.models import Lab, LabMember, StorageQuota, StorageQuotaRequest, User
from storage.file_store import PERSONAL_ROOT, lab_root_dir, user_uid

router = APIRouter(prefix="/storage", tags=["storage"])
PERSONAL_DEFAULT = 5 * 1024 ** 3
LAB_DEFAULT = 20 * 1024 ** 3

def directory_size(path: Path) -> int:
    return sum(entry.stat().st_size for entry in path.rglob("*") if entry.is_file()) if path.exists() else 0

def quota_row(db, scope, user_id=None, lab_id=None):
    q = db.query(StorageQuota).filter(StorageQuota.scope == scope)
    return (q.filter(StorageQuota.user_id == user_id).first() if scope == "personal" else q.filter(StorageQuota.lab_id == lab_id).first())

def latest_request_payload(db, scope, user_id=None, lab_id=None):
    q = db.query(StorageQuotaRequest).filter(StorageQuotaRequest.scope == scope)
    request = (q.filter(StorageQuotaRequest.user_id == user_id).order_by(StorageQuotaRequest.created_at.desc()).first()
               if scope == "personal" else q.filter(StorageQuotaRequest.lab_id == lab_id).order_by(StorageQuotaRequest.created_at.desc()).first())
    if not request:
        return None
    return {"id": str(request.id), "status": request.status, "review_reason": request.review_reason or "", "requested_bytes": request.requested_bytes}

def usage_payload(db, scope, user=None, lab=None):
    row = quota_row(db, scope, user.id if user else None, lab.id if lab else None)
    root = PERSONAL_ROOT / user_uid(user) if scope == "personal" else lab_root_dir(lab.lab_name, create=False)
    return {"scope": scope, "used_bytes": directory_size(root), "quota_bytes": row.quota_bytes if row else (PERSONAL_DEFAULT if scope == "personal" else LAB_DEFAULT), "lab_id": str(lab.id) if lab else None, "latest_request": latest_request_payload(db, scope, user.id if user else None, lab.id if lab else None)}

def require_lab_member(db, user, lab_id):
    lab = db.query(Lab).filter(Lab.id == lab_id).first()
    if not lab or not db.query(LabMember).filter(LabMember.lab_id == lab.id, LabMember.user_id == user["id"]).first():
        raise HTTPException(403, "Not authorized for this lab")
    return lab

def require_lab_leader(db, user, lab_id):
    lab = require_lab_member(db, user, lab_id)
    member = db.query(LabMember).filter(LabMember.lab_id == lab.id, LabMember.user_id == user["id"]).one()
    if member.role_in_lab not in ("leader", "admin"):
        raise HTTPException(403, "Only the lab leader can request a storage increase")
    return lab

class RequestBody(BaseModel):
    requested_bytes: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=2000)
class ReviewBody(BaseModel):
    approved_bytes: int | None = Field(default=None, gt=0)
    reason: str = Field(default="", max_length=2000)
class QuotaBody(BaseModel): quota_bytes: int = Field(gt=0)

@router.get("/personal")
async def personal_usage(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return usage_payload(db, "personal", user=db.query(User).filter(User.id == current_user["id"]).one())

@router.get("/labs/{lab_id}")
async def lab_usage(lab_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    lab = require_lab_member(db, current_user, lab_id)
    member = db.query(LabMember).filter(LabMember.lab_id == lab.id, LabMember.user_id == current_user["id"]).one()
    return {**usage_payload(db, "lab", lab=lab), "can_request": member.role_in_lab in ("leader", "admin")}

@router.post("/personal/request")
async def request_personal(body: RequestBody, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if db.query(StorageQuotaRequest).filter(StorageQuotaRequest.scope == "personal", StorageQuotaRequest.user_id == current_user["id"], StorageQuotaRequest.status == "pending").first():
        raise HTTPException(409, "A storage increase request is already pending")
    db.add(StorageQuotaRequest(scope="personal", user_id=current_user["id"], requested_bytes=body.requested_bytes, reason=body.reason)); db.commit(); return {"ok": True}

@router.post("/labs/{lab_id}/request")
async def request_lab(lab_id: str, body: RequestBody, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    lab = require_lab_leader(db, current_user, lab_id)
    if db.query(StorageQuotaRequest).filter(StorageQuotaRequest.scope == "lab", StorageQuotaRequest.lab_id == lab.id, StorageQuotaRequest.status == "pending").first():
        raise HTTPException(409, "A storage increase request is already pending")
    db.add(StorageQuotaRequest(scope="lab", lab_id=lab.id, user_id=current_user["id"], requested_bytes=body.requested_bytes, reason=body.reason)); db.commit(); return {"ok": True}

@router.get("/admin/overview")
async def overview(db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    users = [{"scope":"personal","id":str(u.id),"name":u.name or u.email,"uid":u.uid, **usage_payload(db,"personal",user=u)} for u in db.query(User).all()]
    labs = [{"scope":"lab","id":str(l.id),"name":l.lab_name, **usage_payload(db,"lab",lab=l)} for l in db.query(Lab).all()]
    reqs=[]
    for r in db.query(StorageQuotaRequest).order_by(StorageQuotaRequest.created_at.desc()).all():
        target = db.query(Lab).filter(Lab.id==r.lab_id).first() if r.scope=="lab" else db.query(User).filter(User.id==r.user_id).first()
        reqs.append({"id":str(r.id),"scope":r.scope,"target":target.lab_name if r.scope=="lab" and target else (target.name or target.email if target else "Unknown"),"requested_bytes":r.requested_bytes,"reason":r.reason,"status":r.status,"created_at":r.created_at,"approved_bytes":r.approved_bytes,"review_reason":r.review_reason})
    return {"requests":reqs,"targets":users+labs}

@router.post("/admin/requests/{request_id}/approve")
async def approve(request_id: str, body: ReviewBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    r=db.query(StorageQuotaRequest).filter(StorageQuotaRequest.id==request_id,StorageQuotaRequest.status=="pending").first()
    if not r: raise HTTPException(404,"Pending request not found")
    value=body.approved_bytes or r.requested_bytes; q=quota_row(db,r.scope,r.user_id,r.lab_id)
    if q: q.quota_bytes=value; q.updated_by=current_user["id"]
    else: db.add(StorageQuota(scope=r.scope,user_id=r.user_id,lab_id=r.lab_id,quota_bytes=value,updated_by=current_user["id"]))
    r.status="approved"; r.approved_bytes=value; r.review_reason=body.reason; r.reviewed_by=current_user["id"]; r.reviewed_at=datetime.utcnow(); db.commit(); return {"ok":True}

@router.post("/admin/requests/{request_id}/reject")
async def reject(request_id: str, body: ReviewBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    r=db.query(StorageQuotaRequest).filter(StorageQuotaRequest.id==request_id,StorageQuotaRequest.status=="pending").first()
    if not r: raise HTTPException(404,"Pending request not found")
    if not body.reason.strip(): raise HTTPException(400,"A rejection reason is required")
    r.status="rejected"; r.review_reason=body.reason; r.reviewed_by=current_user["id"]; r.reviewed_at=datetime.utcnow(); db.commit(); return {"ok":True}

@router.put("/admin/{scope}/{target_id}")
async def set_quota(scope: str, target_id: str, body: QuotaBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    if scope not in ("personal","lab"): raise HTTPException(404,"Unknown storage scope")
    target=(db.query(User).filter(User.id==target_id).first() if scope=="personal" else db.query(Lab).filter(Lab.id==target_id).first())
    if not target: raise HTTPException(404,"Target not found")
    q=quota_row(db,scope,target.id if scope=="personal" else None,target.id if scope=="lab" else None)
    if q: q.quota_bytes=body.quota_bytes; q.updated_by=current_user["id"]
    else: db.add(StorageQuota(scope=scope,user_id=target.id if scope=="personal" else None,lab_id=target.id if scope=="lab" else None,quota_bytes=body.quota_bytes,updated_by=current_user["id"]))
    db.commit(); return {"ok":True}
