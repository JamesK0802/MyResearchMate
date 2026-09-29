from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import CrisprResult, CrisprResultShare, Lab, LabMember, User
from models.results import CrisprResultCreate, CrisprResultUpdate, CrisprResultInDB
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import or_
from routers.shared_access import shared_entities_query
from storage.file_store import document_path, read_json, relative_data_path, resolve_data_path, write_json

router = APIRouter(prefix="/crispr-results", tags=["results"])


def shared_results_query(db: Session, user_id: int, lab_ids):
    return shared_entities_query(
        db, CrisprResult, CrisprResultShare,
        CrisprResultShare.result_id, user_id, lab_ids,
    )

def hydrate_result(result: CrisprResult):
    payload = read_json(result.storage_path, None) if result.storage_path else None
    if isinstance(payload, dict):
        set_committed_value(result, "metadata_json", payload.get("metadata", {}))
        set_committed_value(result, "result_json", payload.get("result", {}))
        if payload.get("title"):
            set_committed_value(result, "title", payload["title"])
    return result

def attach_share_metadata(result: CrisprResult, db: Session):
    """Helper to attach shared_with_labs and is_shared status to a result object."""
    shares = db.query(CrisprResultShare, Lab).join(Lab, CrisprResultShare.lab_id == Lab.id).filter(
        CrisprResultShare.result_id == result.id
    ).distinct().all()
    
    hydrate_result(result)
    result.shared_with_labs = [s.Lab.lab_name for s in shares]
    user_shares = db.query(CrisprResultShare, User).join(User, CrisprResultShare.shared_with_user_id == User.id).filter(CrisprResultShare.result_id == result.id).all()
    result.shared_with_users = [s.User.name or s.User.email for s in user_shares]
    result.is_shared = bool(shares or user_shares)
    return result

@router.post("", response_model=CrisprResultInDB)
async def create_result(
    result_data: CrisprResultCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        new_result = CrisprResult(
            owner_user_id=current_user["id"],
            title=result_data.title,
            metadata_json={},
            result_json={}
        )
        db.add(new_result)
        db.flush()
        path = document_path(current_user, "crispr-analysis", new_result.id)
        write_json(path, {
            "version": 1, "type": "crispr-analysis", "id": str(new_result.id),
            "title": result_data.title, "metadata": result_data.metadata_json,
            "result": result_data.result_json,
        })
        new_result.storage_path = relative_data_path(path)
        db.commit()
        db.refresh(new_result)
        return attach_share_metadata(new_result, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/my", response_model=List[CrisprResultInDB])
@router.get("", response_model=List[CrisprResultInDB])
async def list_my_results(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    results = db.query(CrisprResult).filter(
        CrisprResult.owner_user_id == current_user["id"]
    ).order_by(CrisprResult.created_at.desc()).all()
    
    for r in results:
        attach_share_metadata(r, db)
    return results

@router.get("/shared", response_model=List[CrisprResultInDB])
async def list_shared_results(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    lab_ids = db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()
    lab_ids = [l[0] for l in lab_ids]
    shared_results = shared_results_query(
        db,
        current_user["id"],
        lab_ids,
    ).order_by(CrisprResult.created_at.desc()).all()
    
    for r in shared_results:
        attach_share_metadata(r, db)
        # Also find WHO shared it (owner name)
        owner = db.query(User).filter(User.id == r.owner_user_id).first()
        if owner: r.shared_by_name = owner.name
    return shared_results

@router.get("/all", response_model=List[CrisprResultInDB])
async def list_all_results(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    my = await list_my_results(db, current_user)
    shared = await list_shared_results(db, current_user)
    combined = my + shared
    combined.sort(key=lambda x: x.created_at, reverse=True)
    return combined

@router.get("/{result_id}/shares")
async def get_result_shares(
    result_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = db.query(CrisprResult).filter(CrisprResult.id == result_id, CrisprResult.owner_user_id == current_user["id"]).first()
    if not result:
        raise HTTPException(status_code=403, detail="Not authorized")
    shares = db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id).all()
    return {"view_lab_ids": [str(s.lab_id) for s in shares if s.lab_id], "view_user_ids": [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]}

@router.put("/{result_id}/shares")
async def update_result_shares(
    result_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = db.query(CrisprResult).filter(
        CrisprResult.id == result_id,
        CrisprResult.owner_user_id == current_user["id"]
    ).first()
    if not result: raise HTTPException(status_code=403, detail="Not authorized")
    
    lab_ids = payload.get("view_lab_ids", payload.get("lab_ids", []))
    scheduled_labs = []
    for lab_id in lab_ids:
        try:
            lab = db.query(Lab).filter(Lab.id == UUID(lab_id)).first()
            if lab and lab.archive_deletion_at:
                scheduled_labs.append(lab.lab_name)
        except (ValueError, TypeError):
            continue
    if scheduled_labs:
        raise HTTPException(status_code=409, detail=f"Sharing is unavailable because deletion is scheduled for: {', '.join(scheduled_labs)}")
    db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id).delete()
    
    for lid in lab_ids:
        try:
            db.add(CrisprResultShare(
                result_id=result_id,
                lab_id=UUID(lid),
                shared_by_user_id=current_user["id"]
            ))
        except: continue
    for user_id in payload.get("view_user_ids", []):
        try:
            target_id = int(user_id)
            if target_id != current_user["id"]:
                db.add(CrisprResultShare(result_id=result_id, shared_with_user_id=target_id, shared_by_user_id=current_user["id"]))
        except (ValueError, TypeError):
            continue
        
    db.commit()
    return {"message": "Shares updated successfully"}

@router.get("/{result_id}", response_model=CrisprResultInDB)
async def get_result(
    result_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    result = db.query(CrisprResult).filter(CrisprResult.id == result_id).first()
    if not result: raise HTTPException(status_code=404, detail="Result not found")
    if result.owner_user_id != current_user["id"]:
        share = db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id, or_(CrisprResultShare.lab_id.in_(lab_ids) if lab_ids else False, CrisprResultShare.shared_with_user_id == current_user["id"])).first()
        if not share:
            raise HTTPException(status_code=404, detail="Result not found")
    return attach_share_metadata(result, db)

@router.delete("/{result_id}")
async def delete_result(
    result_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = db.query(CrisprResult).filter(
        CrisprResult.id == result_id,
        CrisprResult.owner_user_id == current_user["id"]
    ).first()
    if not result: raise HTTPException(status_code=403, detail="Not authorized")
    
    # 1. Manually clean up shares first to be safe
    db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id).delete()
    
    # 2. Delete the result
    if result.storage_path:
        resolve_data_path(result.storage_path).unlink(missing_ok=True)
    db.delete(result)
    db.commit()
    return {"message": "Deleted"}
