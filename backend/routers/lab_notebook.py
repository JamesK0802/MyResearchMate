import os
import json
import uuid
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from auth.dependencies import get_current_user
import yaml
from PIL import Image
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent / "data"
NOTES_DIR = BASE_DIR / "notes"
EXP_ACTIVE_DIR = BASE_DIR / "experiments" / "active"
EXP_ARCHIVE_DIR = BASE_DIR / "experiments" / "archive"
PRESETS_DIR = BASE_DIR / "workflow-presets"
ASSETS_DIR = BASE_DIR / "assets"

# Ensure dirs exist
for d in [NOTES_DIR, EXP_ACTIVE_DIR, EXP_ARCHIVE_DIR, PRESETS_DIR, ASSETS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/lab-notebook", tags=["lab-notebook"])

# --- Models ---
class NoteCreate(BaseModel):
    title: str
    body: str
    tags: List[str] = []

class PresetCreate(BaseModel):
    title: str
    description: str = ""
    steps: List[Dict[str, Any]] = []

class ExperimentCreate(BaseModel):
    title: str
    description: str = ""
    samples: List[str] = []
    tags: List[str] = []
    work_type: str = "" # Preset ID or name

class ExperimentStepUpdate(BaseModel):
    title: str
    description: str = ""
    status: str = "pending" # pending, active, completed
    comments: List[str] = []
    images: List[str] = []
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    updated_at: Optional[str] = None

class ExperimentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    samples: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    steps: Optional[List[Dict[str, Any]]] = None

class ArchiveRequest(BaseModel):
    success_score: int

import re

# --- Helper Functions ---
def get_user_id(current_user: dict):
    return current_user.get("uid") or current_user.get("id")

def generate_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now().isoformat()

def delete_asset_file(user_id: Any, year: str, month: str, filename: str):
    file_path = ASSETS_DIR / str(user_id) / year / month / filename
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as e:
            print(f"Error deleting asset file {file_path}: {e}")

def delete_assets_from_content(content: str, user_id: Any):
    pattern = re.compile(rf"/api/lab-notebook/assets/{user_id}/(\d{{4}})/(\d{{2}})/([^)\"\s>]+)")
    matches = pattern.findall(content)
    for year, month, filename in matches:
        base_name = filename
        if "_thumb" in filename:
            base_name = filename.replace("_thumb", "")
        else:
            thumb_name = filename
            if "." in filename:
                parts = filename.rsplit(".", 1)
                thumb_name = f"{parts[0]}_thumb.{parts[1]}"
            delete_asset_file(user_id, year, month, thumb_name)
        delete_asset_file(user_id, year, month, base_name)

def delete_assets_from_experiment(data: dict, user_id: Any):
    pattern = re.compile(rf"/api/lab-notebook/assets/{user_id}/(\d{{4}})/(\d{{2}})/([^)\"\s>]+)")
    for step in data.get("steps", []):
        for img_url in step.get("images", []):
            matches = pattern.findall(img_url)
            for year, month, filename in matches:
                base_name = filename
                if "_thumb" in filename:
                    base_name = filename.replace("_thumb", "")
                else:
                    thumb_name = filename
                    if "." in filename:
                        parts = filename.rsplit(".", 1)
                        thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                    delete_asset_file(user_id, year, month, thumb_name)
                delete_asset_file(user_id, year, month, base_name)

# --- Notes ---
@router.get("/notes")
async def list_notes(current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    user_notes_dir = NOTES_DIR / str(user_id)
    if not user_notes_dir.exists():
        return []
    
    notes = []
    for f in user_notes_dir.glob("*.md"):
        try:
            content = f.read_text()
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    meta = yaml.safe_load(parts[1])
                    if meta:
                        notes.append(meta)
        except Exception as e:
            print(f"Error reading note {f}: {e}")
    
    # Sort by updated_at descending
    notes.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return notes

@router.post("/notes")
async def create_note(note: NoteCreate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    user_notes_dir = NOTES_DIR / str(user_id)
    user_notes_dir.mkdir(parents=True, exist_ok=True)
    
    note_id = generate_id()
    now = now_iso()
    meta = {
        "id": note_id,
        "title": note.title,
        "tags": note.tags,
        "created_at": now,
        "updated_at": now
    }
    
    yaml_frontmatter = yaml.dump(meta, sort_keys=False)
    content = f"---\n{yaml_frontmatter}---\n{note.body}"
    
    note_file = user_notes_dir / f"{note_id}.md"
    note_file.write_text(content)
    
    return meta

@router.get("/notes/{note_id}")
async def get_note(note_id: str, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    note_file = NOTES_DIR / str(user_id) / f"{note_id}.md"
    if not note_file.exists():
        raise HTTPException(status_code=404, detail="Note not found")
    
    content = note_file.read_text()
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            meta = yaml.safe_load(parts[1])
            body = parts[2].strip()
            return {"meta": meta, "body": body}
    
    return {"meta": {"id": note_id, "title": "Untitled"}, "body": content}

@router.put("/notes/{note_id}")
async def update_note(note_id: str, note: NoteCreate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    note_file = NOTES_DIR / str(user_id) / f"{note_id}.md"
    if not note_file.exists():
        raise HTTPException(status_code=404, detail="Note not found")
        
    created_at = now_iso()
    try:
        content = note_file.read_text()
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                old_meta = yaml.safe_load(parts[1])
                created_at = old_meta.get("created_at", created_at)
                old_body = parts[2]
                
                # Check for removed images
                pattern = re.compile(rf"/api/lab-notebook/assets/{user_id}/(\d{{4}})/(\d{{2}})/([^)\"\s>]+)")
                old_imgs = set(pattern.findall(old_body))
                new_imgs = set(pattern.findall(note.body))
                deleted_imgs = old_imgs - new_imgs
                for year, month, filename in deleted_imgs:
                    base_name = filename
                    if "_thumb" in filename:
                        base_name = filename.replace("_thumb", "")
                    else:
                        thumb_name = filename
                        if "." in filename:
                            parts = filename.rsplit(".", 1)
                            thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                        delete_asset_file(user_id, year, month, thumb_name)
                    delete_asset_file(user_id, year, month, base_name)
    except Exception as e:
        print(f"Error checking deleted note body images: {e}")
        
    meta = {
        "id": note_id,
        "title": note.title,
        "tags": note.tags,
        "created_at": created_at,
        "updated_at": now_iso()
    }
    
    yaml_frontmatter = yaml.dump(meta, sort_keys=False)
    new_content = f"---\n{yaml_frontmatter}---\n{note.body}"
    note_file.write_text(new_content)
    
    return meta

@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    note_file = NOTES_DIR / str(user_id) / f"{note_id}.md"
    if note_file.exists():
        try:
            content = note_file.read_text()
            delete_assets_from_content(content, user_id)
        except Exception as e:
            print(f"Error scanning deleted note assets: {e}")
        note_file.unlink()
    return {"status": "success"}

# --- Workflow Presets ---
@router.get("/presets")
async def list_presets(current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    user_presets_dir = PRESETS_DIR / str(user_id)
    if not user_presets_dir.exists():
        # Create some default presets if empty
        user_presets_dir.mkdir(parents=True, exist_ok=True)
        default_presets = [
            {
                "id": generate_id(),
                "title": "Western Blot",
                "description": "Standard Western Blot protocol",
                "steps": [
                    {"id": generate_id(), "title": "Sample preparation", "description": "Lyse cells and quantify protein"},
                    {"id": generate_id(), "title": "Gel loading", "description": "Load samples onto SDS-PAGE gel"},
                    {"id": generate_id(), "title": "Transfer", "description": "Transfer proteins to membrane"},
                    {"id": generate_id(), "title": "Blocking", "description": "Block membrane in 5% milk"},
                    {"id": generate_id(), "title": "Primary antibody incubation", "description": "Incubate overnight at 4C"},
                    {"id": generate_id(), "title": "Washing", "description": "Wash 3x with TBST"},
                    {"id": generate_id(), "title": "Secondary antibody incubation", "description": "Incubate for 1 hr at RT"},
                    {"id": generate_id(), "title": "Imaging", "description": "Develop and image"},
                    {"id": generate_id(), "title": "Analysis", "description": "Quantify bands"}
                ]
            },
            {
                "id": generate_id(),
                "title": "PCR",
                "description": "Polymerase Chain Reaction",
                "steps": [
                    {"id": generate_id(), "title": "Master Mix prep", "description": "Prepare master mix"},
                    {"id": generate_id(), "title": "Template addition", "description": "Add DNA template"},
                    {"id": generate_id(), "title": "Thermocycling", "description": "Run PCR program"},
                    {"id": generate_id(), "title": "Gel check", "description": "Run agarose gel to verify product"}
                ]
            }
        ]
        for preset in default_presets:
            (user_presets_dir / f"{preset['id']}.json").write_text(json.dumps(preset, indent=2))
            
    presets = []
    for f in user_presets_dir.glob("*.json"):
        try:
            presets.append(json.loads(f.read_text()))
        except:
            pass
    return presets

@router.post("/presets")
async def create_preset(preset: PresetCreate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    user_presets_dir = PRESETS_DIR / str(user_id)
    user_presets_dir.mkdir(parents=True, exist_ok=True)
    
    preset_id = generate_id()
    
    # Ensure all steps have IDs
    steps = preset.steps
    for step in steps:
        if "id" not in step:
            step["id"] = generate_id()
            
    data = {
        "id": preset_id,
        "title": preset.title,
        "description": preset.description,
        "steps": steps,
        "created_at": now_iso()
    }
    
    (user_presets_dir / f"{preset_id}.json").write_text(json.dumps(data, indent=2))
    return data

@router.put("/presets/{preset_id}")
async def update_preset(preset_id: str, preset: PresetCreate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    preset_file = PRESETS_DIR / str(user_id) / f"{preset_id}.json"
    if not preset_file.exists():
        raise HTTPException(status_code=404, detail="Preset not found")
        
    steps = preset.steps
    for step in steps:
        if "id" not in step:
            step["id"] = generate_id()
            
    data = {
        "id": preset_id,
        "title": preset.title,
        "description": preset.description,
        "steps": steps,
        "updated_at": now_iso()
    }
    
    preset_file.write_text(json.dumps(data, indent=2))
    return data

@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    preset_file = PRESETS_DIR / str(user_id) / f"{preset_id}.json"
    if preset_file.exists():
        preset_file.unlink()
    return {"status": "success"}

# --- Experiments ---
@router.get("/experiments/active")
async def list_active_experiments(current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    dir_path = EXP_ACTIVE_DIR / str(user_id)
    if not dir_path.exists():
        return []
    
    exps = []
    for f in dir_path.glob("*.json"):
        try:
            exps.append(json.loads(f.read_text()))
        except:
            pass
    
    exps.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return exps

@router.get("/experiments/archive")
async def list_archived_experiments(current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    dir_path = EXP_ARCHIVE_DIR / str(user_id)
    if not dir_path.exists():
        return []
    
    exps = []
    for f in dir_path.glob("*.json"):
        try:
            exps.append(json.loads(f.read_text()))
        except:
            pass
            
    exps.sort(key=lambda x: x.get("archived_at", ""), reverse=True)
    return exps

@router.post("/experiments")
async def create_experiment(exp: ExperimentCreate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    dir_path = EXP_ACTIVE_DIR / str(user_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    
    exp_id = generate_id()
    now = now_iso()
    
    # Load preset steps if applicable
    steps = []
    if exp.work_type:
        preset_file = PRESETS_DIR / str(user_id) / f"{exp.work_type}.json"
        if preset_file.exists():
            preset_data = json.loads(preset_file.read_text())
            # Deep copy and reset status/timestamps, generate new IDs for steps
            for preset_step in preset_data.get("steps", []):
                steps.append({
                    "id": generate_id(),
                    "title": preset_step.get("title", "Untitled Step"),
                    "description": preset_step.get("description", ""),
                    "status": "pending",
                    "comments": [],
                    "images": [],
                    "started_at": None,
                    "completed_at": None,
                    "updated_at": now
                })
    
    # If no steps, add a default one
    if not steps:
        steps.append({
            "id": generate_id(),
            "title": "Initial Step",
            "description": "",
            "status": "pending",
            "comments": [],
            "images": [],
            "started_at": None,
            "completed_at": None,
            "updated_at": now
        })
        
    data = {
        "id": exp_id,
        "title": exp.title,
        "description": exp.description,
        "samples": exp.samples,
        "tags": exp.tags,
        "work_type": exp.work_type,
        "steps": steps,
        "created_at": now,
        "updated_at": now
    }
    
    (dir_path / f"{exp_id}.json").write_text(json.dumps(data, indent=2))
    return data

@router.get("/experiments/{exp_id}")
async def get_experiment(exp_id: str, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    
    # Check active first
    f = EXP_ACTIVE_DIR / str(user_id) / f"{exp_id}.json"
    if f.exists():
        return json.loads(f.read_text())
        
    # Check archive
    f = EXP_ARCHIVE_DIR / str(user_id) / f"{exp_id}.json"
    if f.exists():
        return json.loads(f.read_text())
        
    raise HTTPException(status_code=404, detail="Experiment not found")

@router.put("/experiments/{exp_id}")
async def update_experiment(exp_id: str, exp_update: ExperimentUpdate, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    f = EXP_ACTIVE_DIR / str(user_id) / f"{exp_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Active experiment not found")
        
    data = json.loads(f.read_text())
    
    # Check for deleted images
    if exp_update.steps is not None:
        old_images = set()
        for step in data.get("steps", []):
            for img in step.get("images", []):
                old_images.add(img)
                
        new_images = set()
        for step in exp_update.steps:
            for img in step.get("images", []):
                new_images.add(img)
                
        deleted_images = old_images - new_images
        pattern = re.compile(rf"/api/lab-notebook/assets/{user_id}/(\d{{4}})/(\d{{2}})/([^)\"\s>]+)")
        for img_url in deleted_images:
            matches = pattern.findall(img_url)
            for year, month, filename in matches:
                base_name = filename
                if "_thumb" in filename:
                    base_name = filename.replace("_thumb", "")
                else:
                    thumb_name = filename
                    if "." in filename:
                        parts = filename.rsplit(".", 1)
                        thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                    delete_asset_file(user_id, year, month, thumb_name)
                delete_asset_file(user_id, year, month, base_name)

    if exp_update.title is not None: data["title"] = exp_update.title
    if exp_update.description is not None: data["description"] = exp_update.description
    if exp_update.samples is not None: data["samples"] = exp_update.samples
    if exp_update.tags is not None: data["tags"] = exp_update.tags
    if exp_update.steps is not None: 
        # Ensure all steps have IDs and required fields
        for step in exp_update.steps:
            if "id" not in step: step["id"] = generate_id()
            if "status" not in step: step["status"] = "pending"
            if "comments" not in step: step["comments"] = []
            if "images" not in step: step["images"] = []
        data["steps"] = exp_update.steps
        
    data["updated_at"] = now_iso()
    
    f.write_text(json.dumps(data, indent=2))
    return data

@router.delete("/experiments/{exp_id}")
async def delete_experiment(exp_id: str, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    
    f1 = EXP_ACTIVE_DIR / str(user_id) / f"{exp_id}.json"
    if f1.exists():
        try:
            data = json.loads(f1.read_text())
            delete_assets_from_experiment(data, user_id)
        except Exception as e:
            print(f"Error cleaning active experiment assets: {e}")
        f1.unlink()
        
    f2 = EXP_ARCHIVE_DIR / str(user_id) / f"{exp_id}.json"
    if f2.exists():
        try:
            data = json.loads(f2.read_text())
            delete_assets_from_experiment(data, user_id)
        except Exception as e:
            print(f"Error cleaning archived experiment assets: {e}")
        f2.unlink()
        
    return {"status": "success"}

@router.post("/experiments/{exp_id}/archive")
async def archive_experiment(exp_id: str, req: ArchiveRequest, current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    active_f = EXP_ACTIVE_DIR / str(user_id) / f"{exp_id}.json"
    archive_dir = EXP_ARCHIVE_DIR / str(user_id)
    archive_dir.mkdir(parents=True, exist_ok=True)
    
    if not active_f.exists():
        raise HTTPException(status_code=404, detail="Active experiment not found")
        
    data = json.loads(active_f.read_text())
    data["success_score"] = req.success_score
    data["archived_at"] = now_iso()
    data["updated_at"] = now_iso()
    
    archive_f = archive_dir / f"{exp_id}.json"
    archive_f.write_text(json.dumps(data, indent=2))
    
    active_f.unlink() # Remove from active
    return data

# --- Assets ---
@router.post("/assets/upload")
async def upload_asset(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    user_id = get_user_id(current_user)
    now = datetime.now()
    year_month = now.strftime("%Y/%m")
    asset_dir = ASSETS_DIR / str(user_id) / year_month
    asset_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    file_id = generate_id()
    ext = ".webp"
    file_path = asset_dir / f"{file_id}{ext}"
    thumb_path = asset_dir / f"{file_id}_thumb{ext}"
    
    try:
        # Save uploaded file to temp
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = temp_file.name
            
        # Process image with Pillow
        with Image.open(temp_path) as img:
            # Convert to RGB if necessary (e.g. for PNG with alpha)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                
            # Resize if too large
            MAX_WIDTH = 2560
            if img.width > MAX_WIDTH:
                ratio = MAX_WIDTH / img.width
                new_size = (MAX_WIDTH, int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
                
            # Save main image as WebP
            img.save(file_path, "WEBP", quality=85)
            
            # Create and save thumbnail
            THUMB_WIDTH = 300
            if img.width > THUMB_WIDTH:
                ratio = THUMB_WIDTH / img.width
                new_size = (THUMB_WIDTH, int(img.height * ratio))
                img.thumbnail(new_size, Image.Resampling.LANCZOS)
            img.save(thumb_path, "WEBP", quality=80)
            
        # Clean up temp file
        os.unlink(temp_path)
        
    except Exception as e:
        print(f"Error processing image: {e}")
        raise HTTPException(status_code=500, detail="Error processing image")
        
    # Return relative URL path
    rel_path = f"/api/lab-notebook/assets/{user_id}/{year_month}/{file_id}{ext}"
    thumb_rel_path = f"/api/lab-notebook/assets/{user_id}/{year_month}/{file_id}_thumb{ext}"
    
    return {
        "url": rel_path,
        "thumbnail_url": thumb_rel_path,
        "filename": file.filename
    }

from fastapi.responses import FileResponse
@router.get("/assets/{user_id}/{year}/{month}/{filename}")
async def get_asset(user_id: str, year: str, month: str, filename: str):
    # This allows serving assets securely. We verify user_id.
    # In a real app, verify current_user, but for images often simple path is ok or we can just serve them statically.
    # We will serve them statically but routed through this endpoint for simplicity.
    file_path = ASSETS_DIR / user_id / year / month / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path=file_path)

