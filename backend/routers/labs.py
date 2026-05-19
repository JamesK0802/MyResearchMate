from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user, require_admin
from database.db import get_db
from database.models import Lab, LabMember, User, LabRegistrationRequest, LabJoinRequest
from pydantic import BaseModel

# IMPORTANT: We use a clean prefix to avoid confusion
router = APIRouter(prefix="", tags=["labs"])

class LabCreate(BaseModel):
    lab_name: Optional[str] = None
    lab_leader_name: Optional[str] = ""
    lab_leader_email: Optional[str] = ""
    lab_leader_uid: Optional[str] = ""
    lab_tagline: Optional[str] = ""
    lab_description: Optional[str] = ""
    members: Optional[List[dict]] = []

# =============================================================================
# 1. SPECIFIC FIXED ROUTES (Put these FIRST)
# =============================================================================

@router.get("/admin/lab-requests")
async def get_all_lab_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    requests = db.query(LabRegistrationRequest).all()
    return [
        {
            "id": str(r.id),
            "lab_name": r.lab_name,
            "lab_leader_name": r.lab_leader_name,
            "lab_leader_email": r.lab_leader_email,
            "lab_leader_uid": r.lab_leader_uid,
            "lab_tagline": r.lab_tagline,
            "lab_description": r.lab_description,
            "members_json": r.members_json,
            "status": r.status,
            "created_at": r.created_at
        } for r in requests
    ]

@router.get("/labs/my")
async def get_my_labs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    results = db.query(Lab, LabMember).join(LabMember, Lab.id == LabMember.lab_id).filter(
        LabMember.user_id == current_user["id"]
    ).all()
    out = []
    for l, m in results:
        out.append({
            "id": str(l.id), 
            "lab_name": l.lab_name, 
            "lab_tagline": l.lab_tagline,
            "lab_description": l.lab_description,
            "is_leader": (m.role_in_lab == "leader" or m.role_in_lab == "admin"),
            "role": m.role_in_lab,
            "created_at": m.created_at
        })
    return out

@router.get("/labs/all")
@router.get("/labs") # Fallback
async def list_all_labs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    labs = db.query(Lab).all()
    user_memberships = db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()
    my_lab_ids = {str(m[0]) for m in user_memberships}
    
    user_requests = db.query(LabJoinRequest).filter(LabJoinRequest.user_id == current_user["id"]).all()
    request_statuses = {str(r.lab_id): r.status for r in user_requests}
    
    out = []
    for l in labs:
        lab_id_str = str(l.id)
        status = "none"
        if lab_id_str in my_lab_ids: status = "member"
        elif lab_id_str in request_statuses: status = request_statuses[lab_id_str]
        
        out.append({
            "id": lab_id_str, 
            "lab_name": l.lab_name, 
            "lab_tagline": l.lab_tagline, 
            "lab_description": l.lab_description,
            "status": status,
            "created_at": l.created_at
        })
    return out

@router.get("/labs/join-requests/my")
async def get_my_join_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    rows = db.query(LabJoinRequest, Lab).join(Lab, LabJoinRequest.lab_id == Lab.id).filter(
        LabJoinRequest.user_id == current_user["id"],
        LabJoinRequest.status == "pending"
    ).all()
    
    return [
        {
            "id": str(r[0].id),
            "lab_id": str(r[0].lab_id),
            "lab_name": r[1].lab_name,
            "status": r[0].status,
            "created_at": r[0].created_at
        } for r in rows
    ]

@router.get("/lab-requests/my")
async def list_my_lab_requests(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    requests = db.query(LabRegistrationRequest).filter(
        LabRegistrationRequest.requested_by == current_user["id"]
    ).all()
    return [
        {
            "id": str(r.id), 
            "lab_name": r.lab_name, 
            "status": r.status, 
            "created_at": r.created_at,
            "lab_tagline": r.lab_tagline,
            "lab_description": r.lab_description
        } for r in requests
    ]

# =============================================================================
# 2. PARAMETERIZED ROUTES
# =============================================================================

@router.post("/labs/{lab_id}/join")
async def request_to_join_lab(
    lab_id: str,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    message = payload.get("message") if payload else None
    existing_member = db.query(LabMember).filter(LabMember.lab_id == lab_id, LabMember.user_id == current_user["id"]).first()
    if existing_member: raise HTTPException(status_code=400, detail="Already a member")
    
    existing_request = db.query(LabJoinRequest).filter(
        LabJoinRequest.lab_id == lab_id,
        LabJoinRequest.user_id == current_user["id"],
        LabJoinRequest.status == "pending"
    ).first()
    if existing_request: return {"message": "Request already pending"}
    
    new_request = LabJoinRequest(
        lab_id=lab_id, user_id=current_user["id"], uid=current_user.get("uid"),
        message=message, status="pending"
    )
    db.add(new_request)
    db.commit()
    return {"message": "Join request submitted"}

@router.get("/labs/{lab_id}/join-requests")
async def list_lab_join_requests(
    lab_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    is_leader = db.query(LabMember).filter(
        LabMember.lab_id == lab_id, LabMember.user_id == current_user["id"], LabMember.role_in_lab.in_(["leader", "admin"])
    ).first()
    if not is_leader: raise HTTPException(status_code=403, detail="Not authorized")
    
    rows = db.query(LabJoinRequest, User).join(User, LabJoinRequest.user_id == User.id).filter(
        LabJoinRequest.lab_id == lab_id,
        LabJoinRequest.status == "pending"
    ).all()
    
    return [
        {
            "id": str(r[0].id),
            "status": r[0].status,
            "created_at": r[0].created_at,
            "uid": r[1].uid if r[1].uid else r[0].uid,
            "name": r[1].name if r[1].name else "No Name",
            "email": r[1].email,
            "message": r[0].message
        } for r in rows
    ]

@router.get("/labs/{lab_id}/members")
async def get_lab_members(lab_id: str, db: Session = Depends(get_db)):
    members = db.query(LabMember).filter(LabMember.lab_id == lab_id).all()
    return [{"uid": m.uid, "name": m.name, "email": m.email, "role_in_lab": m.role_in_lab} for m in members]

@router.delete("/labs/{lab_id}/members/{target_uid}")
async def remove_lab_member(
    lab_id: str,
    target_uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    is_leader = db.query(LabMember).filter(
        LabMember.lab_id == lab_id, LabMember.user_id == current_user["id"], LabMember.role_in_lab.in_(["leader", "admin"])
    ).first()
    if not is_leader: raise HTTPException(status_code=403, detail="Not authorized")
    if target_uid == current_user["uid"]: raise HTTPException(status_code=400, detail="Cannot remove yourself")
    
    db.query(LabMember).filter(LabMember.lab_id == lab_id, LabMember.uid == target_uid).delete()
    db.query(LabJoinRequest).filter(LabJoinRequest.lab_id == lab_id, LabJoinRequest.uid == target_uid).delete()
    db.commit()
    return {"message": "Member removed"}

# =============================================================================
# 3. GLOBAL ACTIONS
# =============================================================================

@router.post("/lab-requests")
async def create_lab_request(
    lab_data: LabCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    new_request = LabRegistrationRequest(
        lab_name=lab_data.lab_name,
        lab_tagline=lab_data.lab_tagline,
        lab_description=lab_data.lab_description,
        lab_leader_name=lab_data.lab_leader_name or current_user.get("name"),
        lab_leader_email=lab_data.lab_leader_email or current_user.get("email"),
        lab_leader_uid=lab_data.lab_leader_uid or current_user.get("uid"),
        members_json=lab_data.members, # Map frontend 'members' to DB 'members_json'
        status="pending",
        requested_by=current_user["id"]
    )
    db.add(new_request)
    db.commit()
    return {"message": "Request submitted"}

@router.post("/admin/lab-requests/{request_id}/approve")
async def admin_approve_lab(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    req = db.query(LabRegistrationRequest).filter(LabRegistrationRequest.id == request_id).first()
    if not req: raise HTTPException(status_code=404, detail="Request not found")
    
    new_lab = Lab(lab_name=req.lab_name, lab_leader_uid=req.lab_leader_uid, lab_tagline=req.lab_tagline, lab_description=req.lab_description)
    db.add(new_lab)
    db.flush()
    
    leader_user = db.query(User).filter(User.uid == req.lab_leader_uid).first()
    if leader_user:
        db.add(LabMember(lab_id=new_lab.id, user_id=leader_user.id, uid=leader_user.uid, name=leader_user.name, email=leader_user.email, role_in_lab="leader"))
        
    if req.members_json:
        for m in req.members_json:
            m_user = db.query(User).filter(User.uid == m.get("uid")).first()
            if m_user:
                db.add(LabMember(lab_id=new_lab.id, user_id=m_user.id, uid=m_user.uid, name=m_user.name, email=m_user.email, role_in_lab="member"))
                
    req.status = "approved"
    db.commit()
    return {"message": "Lab created and approved"}

@router.post("/admin/lab-requests/{request_id}/reject")
async def admin_reject_lab(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    req = db.query(LabRegistrationRequest).filter(LabRegistrationRequest.id == request_id).first()
    if not req: raise HTTPException(status_code=404, detail="Request not found")
    req.status = "rejected"
    db.commit()
    return {"message": "Request rejected"}

# =============================================================================
# 4. JOIN REQUEST APPROVAL & LAB DELETION
# =============================================================================

@router.post("/labs/join-requests/{request_id}/approve")
async def approve_join_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    req = db.query(LabJoinRequest).filter(LabJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check authorization (must be leader or admin of this lab)
    is_leader = db.query(LabMember).filter(
        LabMember.lab_id == req.lab_id,
        LabMember.user_id == current_user["id"],
        LabMember.role_in_lab.in_(["leader", "admin"])
    ).first()
    if not is_leader:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Add target user as a member if not already added
    existing = db.query(LabMember).filter(
        LabMember.lab_id == req.lab_id,
        LabMember.user_id == req.user_id
    ).first()
    
    if not existing:
        u = db.query(User).filter(User.id == req.user_id).first()
        if u:
            db.add(LabMember(
                lab_id=req.lab_id,
                user_id=req.user_id,
                uid=u.uid,
                name=u.name,
                email=u.email,
                role_in_lab="member"
            ))
            
    req.status = "approved"
    db.commit()
    return {"message": "Join request approved"}

@router.post("/labs/join-requests/{request_id}/reject")
async def reject_join_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    req = db.query(LabJoinRequest).filter(LabJoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    is_leader = db.query(LabMember).filter(
        LabMember.lab_id == req.lab_id,
        LabMember.user_id == current_user["id"],
        LabMember.role_in_lab.in_(["leader", "admin"])
    ).first()
    if not is_leader:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    req.status = "rejected"
    db.commit()
    return {"message": "Join request rejected"}

@router.delete("/labs/{lab_id}")
async def delete_lab(
    lab_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    lab = db.query(Lab).filter(Lab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
        
    # Must be leader of the lab or system admin to delete
    is_leader = db.query(LabMember).filter(
        LabMember.lab_id == lab_id,
        LabMember.user_id == current_user["id"],
        LabMember.role_in_lab == "leader"
    ).first()
    is_admin = current_user.get("role") == "admin"
    
    if not is_leader and not is_admin:
        raise HTTPException(status_code=403, detail="Only lab leaders or system administrators can delete labs")
        
    # Delete members, requests and finally the lab
    db.query(LabMember).filter(LabMember.lab_id == lab_id).delete()
    db.query(LabJoinRequest).filter(LabJoinRequest.lab_id == lab_id).delete()
    db.query(Lab).filter(Lab.id == lab_id).delete()
    
    db.commit()
    return {"message": "Lab deleted successfully"}
