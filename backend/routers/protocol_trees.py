from fastapi import APIRouter, Depends, HTTPException
from typing import List
from uuid import UUID
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import ProtocolTree, ProtocolTreeShare, Lab, LabMember, User
from models.protocol_trees import ProtocolTreeCreate, ProtocolTreeUpdate, ProtocolTreeInDB
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import or_
from routers.shared_access import shared_entities_query
from storage.file_store import document_path, read_json, relative_data_path, resolve_data_path, write_json

router = APIRouter(prefix="/protocol-trees", tags=["protocol-trees"])


def hydrate_tree(tree: ProtocolTree):
    payload = read_json(tree.storage_path, None) if tree.storage_path else None
    if isinstance(payload, dict):
        set_committed_value(tree, "document_json", payload.get("document", {}))
        if payload.get("title"):
            set_committed_value(tree, "title", payload["title"])
    return tree


def access_for_tree(tree: ProtocolTree, db: Session, current_user: dict) -> str | None:
    if tree.owner_user_id == current_user["id"]:
        return "owner"
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    levels = [row[0] for row in db.query(ProtocolTreeShare.access_level).filter(
        ProtocolTreeShare.protocol_tree_id == tree.id,
        or_(ProtocolTreeShare.lab_id.in_(lab_ids) if lab_ids else False, ProtocolTreeShare.shared_with_user_id == current_user["id"]),
    ).all()]
    if "edit" in levels:
        return "edit"
    return "read" if levels else None


def attach_share_metadata(tree: ProtocolTree, db: Session, current_user: dict):
    shares = db.query(ProtocolTreeShare, Lab).join(
        Lab, ProtocolTreeShare.lab_id == Lab.id
    ).filter(ProtocolTreeShare.protocol_tree_id == tree.id).all()
    hydrate_tree(tree)
    tree.shared_with_labs = [item.Lab.lab_name for item in shares]
    user_shares = db.query(ProtocolTreeShare, User).join(User, ProtocolTreeShare.shared_with_user_id == User.id).filter(ProtocolTreeShare.protocol_tree_id == tree.id).all()
    tree.shared_with_users = [item.User.name or item.User.email for item in user_shares]
    tree.is_shared = bool(shares or user_shares)
    tree.share_access = access_for_tree(tree, db, current_user)
    tree.can_edit = tree.share_access in ("owner", "edit")
    return tree


@router.post("", response_model=ProtocolTreeInDB)
async def create_protocol_tree(
    data: ProtocolTreeCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tree = ProtocolTree(owner_user_id=current_user["id"], title=data.title, document_json={})
    db.add(tree)
    db.flush()
    path = document_path(current_user, "tree-protocol", tree.id)
    write_json(path, {"version": 1, "type": "tree-protocol", "id": str(tree.id), "title": data.title, "document": data.document_json})
    tree.storage_path = relative_data_path(path)
    db.commit()
    db.refresh(tree)
    return attach_share_metadata(tree, db, current_user)


def owner_trees(db: Session, current_user: dict):
    return db.query(ProtocolTree).filter(
        ProtocolTree.owner_user_id == current_user["id"]
    ).order_by(ProtocolTree.updated_at.desc(), ProtocolTree.created_at.desc()).all()


def shared_trees(db: Session, current_user: dict):
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    return shared_entities_query(
        db, ProtocolTree, ProtocolTreeShare,
        ProtocolTreeShare.protocol_tree_id, current_user["id"], lab_ids,
    ).order_by(ProtocolTree.updated_at.desc(), ProtocolTree.created_at.desc()).all()


@router.get("/my", response_model=List[ProtocolTreeInDB])
async def list_my_protocol_trees(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    trees = owner_trees(db, current_user)
    return [attach_share_metadata(tree, db, current_user) for tree in trees]


@router.get("/shared", response_model=List[ProtocolTreeInDB])
async def list_shared_protocol_trees(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    trees = shared_trees(db, current_user)
    for tree in trees:
        attach_share_metadata(tree, db, current_user)
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
        attach_share_metadata(tree, db, current_user)
        if tree.owner_user_id != current_user["id"]:
            owner = db.query(User).filter(User.id == tree.owner_user_id).first()
            tree.shared_by_name = owner.name if owner else None
        result.append(tree)
    return result


@router.get("/{tree_id}", response_model=ProtocolTreeInDB)
async def get_protocol_tree(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id).first()
    if not tree or not access_for_tree(tree, db, current_user):
        raise HTTPException(status_code=404, detail="Protocol tree not found")
    return attach_share_metadata(tree, db, current_user)


@router.put("/{tree_id}", response_model=ProtocolTreeInDB)
async def update_protocol_tree(tree_id: UUID, data: ProtocolTreeUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id).first()
    if not tree or access_for_tree(tree, db, current_user) not in ("owner", "edit"):
        raise HTTPException(status_code=403, detail="Not authorized")
    hydrate_tree(tree)
    title = data.title if data.title is not None else tree.title
    document = data.document_json if data.document_json is not None else tree.document_json
    path = resolve_data_path(tree.storage_path) if tree.storage_path else document_path(current_user, "tree-protocol", tree.id)
    write_json(path, {"version": 1, "type": "tree-protocol", "id": str(tree.id), "title": title, "document": document})
    tree.title = title
    tree.document_json = {}
    tree.storage_path = relative_data_path(path)
    db.commit()
    db.refresh(tree)
    return attach_share_metadata(tree, db, current_user)


@router.get("/{tree_id}/shares")
async def get_protocol_tree_shares(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    shares = db.query(ProtocolTreeShare).filter(ProtocolTreeShare.protocol_tree_id == tree_id).all()
    return {
        "view_lab_ids": [str(share.lab_id) for share in shares if share.lab_id],
        "edit_lab_ids": [str(share.lab_id) for share in shares if share.lab_id and share.access_level == "edit"],
        "view_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id],
        "edit_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id and share.access_level == "edit"],
    }


@router.put("/{tree_id}/shares")
async def update_protocol_tree_shares(tree_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(ProtocolTreeShare).filter(ProtocolTreeShare.protocol_tree_id == tree_id).delete()
    read_ids = payload.get("view_lab_ids", list(dict.fromkeys(payload.get("read_only_lab_ids", []) + payload.get("edit_lab_ids", []))))
    edit_ids = payload.get("edit_lab_ids", [])
    for lab_id in read_ids:
        try:
            db.add(ProtocolTreeShare(protocol_tree_id=tree_id, lab_id=UUID(lab_id), shared_by_user_id=current_user["id"], access_level="edit" if lab_id in edit_ids else "read"))
        except (ValueError, TypeError):
            continue
    view_user_ids = payload.get("view_user_ids", [])
    edit_user_ids = {str(item) for item in payload.get("edit_user_ids", [])}
    for user_id in view_user_ids:
        try:
            target_id = int(user_id)
            if target_id != current_user["id"]:
                db.add(ProtocolTreeShare(protocol_tree_id=tree_id, shared_with_user_id=target_id, shared_by_user_id=current_user["id"], access_level="edit" if str(user_id) in edit_user_ids else "read"))
        except (ValueError, TypeError):
            continue
    db.commit()
    return {"message": "Shares updated successfully"}


@router.delete("/{tree_id}")
async def delete_protocol_tree(tree_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    tree = db.query(ProtocolTree).filter(ProtocolTree.id == tree_id, ProtocolTree.owner_user_id == current_user["id"]).first()
    if not tree:
        raise HTTPException(status_code=403, detail="Not authorized")
    if tree.storage_path:
        resolve_data_path(tree.storage_path).unlink(missing_ok=True)
    db.delete(tree)
    db.commit()
    return {"message": "Deleted"}
