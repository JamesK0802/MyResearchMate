from fastapi import APIRouter, Depends, HTTPException
from typing import List
from uuid import UUID
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import ProtocolTree, ProtocolTreeShare, Lab, LabMember, User
from models.protocol_trees import ProtocolTreeCreate, ProtocolTreeUpdate, ProtocolTreeInDB

router = APIRouter(prefix="/protocol-trees", tags=["protocol-trees"])


def attach_share_metadata(tree: ProtocolTree, db: Session):
    shares = db.query(ProtocolTreeShare, Lab).join(
        Lab, ProtocolTreeShare.lab_id == Lab.id
    ).filter(ProtocolTreeShare.protocol_tree_id == tree.id).all()
    tree.shared_with_labs = [item.Lab.lab_name for item in shares]
    tree.is_shared = bool(shares)
    return tree


@router.post("", response_model=ProtocolTreeInDB)
async def create_protocol_tree(
    data: ProtocolTreeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tree = ProtocolTree(owner_user_id=current_user["id"], title=data.title, document_json=data.document_json)
    db.add(tree)
    db.commit()
    db.refresh(tree)
    return attach_share_metadata(tree, db)


def owner_trees(db: Session, current_user: dict):
    return db.query(ProtocolTree).filter(
        ProtocolTree.owner_user_id == current_user["id"]
    ).order_by(ProtocolTree.updated_at.desc(), ProtocolTree.created_at.desc()).all()


def shared_trees(db: Session, current_user: dict):
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    if not lab_ids:
        return []
    return db.query(ProtocolTree).join(ProtocolTreeShare).filter(
        ProtocolTreeShare.lab_id.in_(lab_ids),
        ProtocolTree.owner_user_id != current_user["id"],
    ).order_by(ProtocolTree.updated_at.desc(), ProtocolTree.created_at.desc()).all()


@router.get("/my", response_model=List[ProtocolTreeInDB])
async def list_my_protocol_trees(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    trees = owner_trees(db, current_user)
    return [attach_share_metadata(tree, db) for tree in trees]


@router.get("/shared", response_model=List[ProtocolTreeInDB])
async def list_shared_protocol_trees(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    trees = shared_trees(db, current_user)
    for tree in trees:
        attach_share_metadata(tree, db)
        owner = db.query(User).filter(User.id == tree.owner_user_id).first()
        tree.shared_by_name = owner.name if owner else None
    return trees


@router.get("/all", response_model=List[ProtocolTreeInDB])
async def list_all_protocol_trees(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    trees = owner_trees(db, current_user) + shared_trees(db, current_user)
    seen = set()
    result = []
    for tree in sorted(trees, key=lambda item: item.updated_at or item.created_at, reverse=True):
        if tree.id in seen:
            continue
        seen.add(tree.id)
        attach_share_metadata(tree, db)
        if tree.owner_user_id != current_user["id"]:
            owner = db.query(User).filter(User.id == tree.owner_user_id).first()
            tree.shared_by_name = owner.name if owner else None
        result.append(tree)
    return result


@router.get("/{tree_id}", response_model=ProtocolTreeInDB)
async def get_protocol_tree(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id).first()
    if not tree:
        raise HTTPException(status_code=404, detail="Protocol tree not found")
    return attach_share_metadata(tree, db)


@router.put("/{tree_id}", response_model=ProtocolTreeInDB)
async def update_protocol_tree(tree_id: UUID, data: ProtocolTreeUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    if data.title is not None:
        tree.title = data.title
    if data.document_json is not None:
        tree.document_json = data.document_json
    db.commit()
    db.refresh(tree)
    return attach_share_metadata(tree, db)


@router.get("/{tree_id}/shares")
async def get_protocol_tree_shares(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    shares = db.query(ProtocolTreeShare).filter(ProtocolTreeShare.protocol_tree_id == tree_id).all()
    return [str(share.lab_id) for share in shares]


@router.put("/{tree_id}/shares")
async def update_protocol_tree_shares(tree_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(ProtocolTreeShare).filter(ProtocolTreeShare.protocol_tree_id == tree_id).delete()
    for lab_id in payload.get("lab_ids", []):
        try:
            db.add(ProtocolTreeShare(protocol_tree_id=tree_id, lab_id=UUID(lab_id), shared_by_user_id=current_user["id"]))
        except (ValueError, TypeError):
            continue
    db.commit()
    return {"message": "Shares updated successfully"}


@router.delete("/{tree_id}")
async def delete_protocol_tree(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(tree)
    db.commit()
    return {"message": "Deleted"}
