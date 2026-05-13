from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import CrisprResult, CrisprResultShare, Lab, LabMember, User
from models.results import CrisprResultCreate, CrisprResultUpdate, CrisprResultInDB

router = APIRouter(prefix="/crispr-results", tags=["results"])

def attach_share_metadata(result: CrisprResult, db: Session):
    """Helper to attach shared_with_labs and is_shared status to a result object."""
    shares = db.query(CrisprResultShare, Lab).join(Lab, CrisprResultShare.lab_id == Lab.id).filter(
        CrisprResultShare.result_id == result.id
    ).all()
    
    result.shared_with_labs = [s.Lab.lab_name for s in shares]
    result.is_shared = len(shares) > 0
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
            metadata_json=result_data.metadata_json,
            result_json=result_data.result_json
        )
        db.add(new_result)
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
    if not lab_ids: return []
    
    # Results shared with my labs but NOT owned by me
    shared_results = db.query(CrisprResult).join(CrisprResultShare).filter(
        CrisprResultShare.lab_id.in_(lab_ids),
        CrisprResult.owner_user_id != current_user["id"]
    ).all()
    
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
    shares = db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id).all()
    return [str(s.lab_id) for s in shares]

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
    
    lab_ids = payload.get("lab_ids", [])
    db.query(CrisprResultShare).filter(CrisprResultShare.result_id == result_id).delete()
    
    for lid in lab_ids:
        try:
            db.add(CrisprResultShare(
                result_id=result_id,
                lab_id=UUID(lid),
                shared_by_user_id=current_user["id"]
            ))
        except: continue
        
    db.commit()
    return {"message": "Shares updated successfully"}

@router.get("/{result_id}", response_model=CrisprResultInDB)
async def get_result(
    result_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = db.query(CrisprResult).filter(CrisprResult.id == result_id).first()
    if not result: raise HTTPException(status_code=404, detail="Result not found")
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
    db.delete(result)
    db.commit()
    return {"message": "Deleted"}
