from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database.db import get_db
from database.models import PlotProject, PlotProjectShare, Lab, LabMember, User
from models.plot_projects import PlotProjectCreate, PlotProjectInDB, PlotProjectUpdate
from sqlalchemy.orm.attributes import set_committed_value
from sqlalchemy import or_
from storage.file_store import document_path, read_json, relative_data_path, resolve_data_path, write_json


router = APIRouter(prefix="/plot-projects", tags=["plot-projects"])


def hydrate_project(project: PlotProject):
    payload = read_json(project.storage_path, None) if project.storage_path else None
    if isinstance(payload, dict):
        set_committed_value(project, "project_json", payload.get("project", {}))
        if payload.get("title"):
            set_committed_value(project, "title", payload["title"])
    return project


def access_for_project(project: PlotProject, db: Session, current_user: dict) -> str | None:
    if project.owner_user_id == current_user["id"]:
        return "owner"
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    levels = [row[0] for row in db.query(PlotProjectShare.access_level).filter(
        PlotProjectShare.plot_project_id == project.id,
        or_(PlotProjectShare.lab_id.in_(lab_ids) if lab_ids else False, PlotProjectShare.shared_with_user_id == current_user["id"]),
    ).all()]
    if "edit" in levels:
        return "edit"
    return "read" if levels else None


def attach_share_metadata(project: PlotProject, db: Session, current_user: dict):
    shares = db.query(PlotProjectShare, Lab).join(Lab, PlotProjectShare.lab_id == Lab.id).filter(
        PlotProjectShare.plot_project_id == project.id
    ).all()
    hydrate_project(project)
    project.shared_with_labs = [item.Lab.lab_name for item in shares]
    user_shares = db.query(PlotProjectShare, User).join(User, PlotProjectShare.shared_with_user_id == User.id).filter(PlotProjectShare.plot_project_id == project.id).all()
    project.shared_with_users = [item.User.name or item.User.email for item in user_shares]
    project.is_shared = bool(shares or user_shares)
    project.share_access = access_for_project(project, db, current_user)
    project.can_edit = project.share_access in ("owner", "edit")
    return project


def owner_projects(db: Session, current_user: dict):
    return db.query(PlotProject).filter(PlotProject.owner_user_id == current_user["id"]).order_by(
        PlotProject.updated_at.desc(), PlotProject.created_at.desc()
    ).all()


def shared_projects(db: Session, current_user: dict):
    lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()]
    return db.query(PlotProject).join(PlotProjectShare).filter(
        or_(PlotProjectShare.lab_id.in_(lab_ids) if lab_ids else False, PlotProjectShare.shared_with_user_id == current_user["id"]), PlotProject.owner_user_id != current_user["id"]
    ).distinct().order_by(PlotProject.updated_at.desc(), PlotProject.created_at.desc()).all()


@router.post("", response_model=PlotProjectInDB)
async def create_plot_project(data: PlotProjectCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = PlotProject(owner_user_id=current_user["id"], title=data.title, project_json={})
    db.add(project)
    db.flush()
    path = document_path(current_user, "r-plot-studio", project.id)
    write_json(path, {"version": 1, "type": "r-plot-studio", "id": str(project.id), "title": data.title, "project": data.project_json})
    project.storage_path = relative_data_path(path)
    db.commit()
    db.refresh(project)
    return attach_share_metadata(project, db, current_user)


@router.get("/my", response_model=List[PlotProjectInDB])
async def list_my_plot_projects(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return [attach_share_metadata(project, db, current_user) for project in owner_projects(db, current_user)]


@router.get("/shared", response_model=List[PlotProjectInDB])
async def list_shared_plot_projects(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    projects = shared_projects(db, current_user)
    for project in projects:
        attach_share_metadata(project, db, current_user)
        owner = db.query(User).filter(User.id == project.owner_user_id).first()
        project.shared_by_name = owner.name if owner else None
    return projects


@router.get("/all", response_model=List[PlotProjectInDB])
async def list_all_plot_projects(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    projects = owner_projects(db, current_user) + shared_projects(db, current_user)
    result, seen = [], set()
    for project in sorted(projects, key=lambda item: item.updated_at or item.created_at, reverse=True):
        if project.id in seen:
            continue
        seen.add(project.id)
        attach_share_metadata(project, db, current_user)
        if project.owner_user_id != current_user["id"]:
            owner = db.query(User).filter(User.id == project.owner_user_id).first()
            project.shared_by_name = owner.name if owner else None
        result.append(project)
    return result


@router.get("/{project_id}", response_model=PlotProjectInDB)
async def get_plot_project(project_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(PlotProject).filter(PlotProject.id == project_id).first()
    if not project or not access_for_project(project, db, current_user):
        raise HTTPException(status_code=404, detail="Plot project not found")
    return attach_share_metadata(project, db, current_user)


@router.put("/{project_id}", response_model=PlotProjectInDB)
async def update_plot_project(project_id: UUID, data: PlotProjectUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(PlotProject).filter(PlotProject.id == project_id).first()
    if not project or access_for_project(project, db, current_user) not in ("owner", "edit"):
        raise HTTPException(status_code=403, detail="Not authorized")
    hydrate_project(project)
    title = data.title if data.title is not None else project.title
    document = data.project_json if data.project_json is not None else project.project_json
    path = resolve_data_path(project.storage_path) if project.storage_path else document_path(current_user, "r-plot-studio", project.id)
    write_json(path, {"version": 1, "type": "r-plot-studio", "id": str(project.id), "title": title, "project": document})
    project.title = title
    project.project_json = {}
    project.storage_path = relative_data_path(path)
    db.commit()
    db.refresh(project)
    return attach_share_metadata(project, db, current_user)


@router.get("/{project_id}/shares")
async def get_plot_project_shares(project_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(PlotProject).filter(PlotProject.id == project_id, PlotProject.owner_user_id == current_user["id"]).first()
    if not project:
        raise HTTPException(status_code=403, detail="Not authorized")
    shares = db.query(PlotProjectShare).filter(PlotProjectShare.plot_project_id == project_id).all()
    return {
        "view_lab_ids": [str(share.lab_id) for share in shares if share.lab_id],
        "edit_lab_ids": [str(share.lab_id) for share in shares if share.lab_id and share.access_level == "edit"],
        "view_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id],
        "edit_user_ids": [str(share.shared_with_user_id) for share in shares if share.shared_with_user_id and share.access_level == "edit"],
    }


@router.put("/{project_id}/shares")
async def update_plot_project_shares(project_id: UUID, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(PlotProject).filter(PlotProject.id == project_id, PlotProject.owner_user_id == current_user["id"]).first()
    if not project:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(PlotProjectShare).filter(PlotProjectShare.plot_project_id == project_id).delete()
    read_ids = payload.get("view_lab_ids", list(dict.fromkeys(payload.get("read_only_lab_ids", []) + payload.get("edit_lab_ids", []))))
    edit_ids = payload.get("edit_lab_ids", [])
    for lab_id in read_ids:
        try:
            db.add(PlotProjectShare(plot_project_id=project_id, lab_id=UUID(lab_id), shared_by_user_id=current_user["id"], access_level="edit" if lab_id in edit_ids else "read"))
        except (ValueError, TypeError):
            continue
    view_user_ids = payload.get("view_user_ids", [])
    edit_user_ids = {str(item) for item in payload.get("edit_user_ids", [])}
    for user_id in view_user_ids:
        try:
            target_id = int(user_id)
            if target_id != current_user["id"]:
                db.add(PlotProjectShare(plot_project_id=project_id, shared_with_user_id=target_id, shared_by_user_id=current_user["id"], access_level="edit" if str(user_id) in edit_user_ids else "read"))
        except (ValueError, TypeError):
            continue
    db.commit()
    return {"message": "Shares updated successfully"}


@router.delete("/{project_id}")
async def delete_plot_project(project_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(PlotProject).filter(PlotProject.id == project_id, PlotProject.owner_user_id == current_user["id"]).first()
    if not project:
        raise HTTPException(status_code=404, detail="Plot project not found")
    if project.storage_path:
        resolve_data_path(project.storage_path).unlink(missing_ok=True)
    db.delete(project)
    db.commit()
    return {"message": "Deleted"}
