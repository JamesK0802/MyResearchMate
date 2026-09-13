import os
import json
import uuid
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from auth.dependencies import get_current_user
import yaml
from PIL import Image
from pathlib import Path
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import User, Lab, LabMember, WorkflowPresetTransfer, WorkflowShare
from storage.file_store import DATA_ROOT, PERSONAL_ROOT, personal_tool_dir, safe_segment, user_uid


# Paths
BASE_DIR = DATA_ROOT
NOTES_DIR = Path("notes")
EXP_ACTIVE_DIR = Path("experiments") / "active"
EXP_ARCHIVE_DIR = Path("experiments") / "archive"
PRESETS_DIR = Path("workflow-presets")
ASSETS_DIR = Path("assets")
print(f"[LAB_NOTEBOOK] Using owner-oriented data directory: {PERSONAL_ROOT}")

router = APIRouter(prefix="/lab-notebook", tags=["lab-notebook"])

# --- Models ---
class NoteCreate(BaseModel):
    title: str
    body: str
    tags: List[str] = Field(default_factory=list)

class PresetCreate(BaseModel):
    title: str
    description: str = ""
    steps: List[Dict[str, Any]] = Field(default_factory=list)

class ExperimentCreate(BaseModel):
    title: str
    description: str = ""
    samples: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    work_type: str = "" # Legacy preset ID or name
    protocol_tree_id: Optional[str] = None
    protocol_title: str = ""
    protocol_root_id: Optional[str] = None
    protocol_root_name: str = ""
    protocol_snapshot_updated_at: Optional[str] = None
    run_notes: str = ""
    steps: List[Dict[str, Any]] = Field(default_factory=list)

class ExperimentStepUpdate(BaseModel):
    title: str
    description: str = ""
    status: str = "pending" # pending, active, completed
    comments: List[str] = Field(default_factory=list)
    images: List[str] = Field(default_factory=list)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    updated_at: Optional[str] = None

class ExperimentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    samples: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    steps: Optional[List[Dict[str, Any]]] = None
    protocol_tree_id: Optional[str] = None
    protocol_title: Optional[str] = None
    protocol_root_id: Optional[str] = None
    protocol_root_name: Optional[str] = None
    protocol_snapshot_updated_at: Optional[str] = None
    run_notes: Optional[str] = None

class ArchiveRequest(BaseModel):
    success_score: int

class CommentCreate(BaseModel):
    text: str

class PresetTransferRequest(BaseModel):
    preset_id: str
    to_user_id: int

class WorkflowShareUpdate(BaseModel):
    workflow_type: str  # "active" or "archive"
    lab_ids: List[str] = Field(default_factory=list)
    user_ids: List[str] = Field(default_factory=list)


import re

ASSET_URL_PATTERN = re.compile(r"/api/lab-notebook/assets/([^/]+)/(\d{4})/(\d{2})/([^)\"\s>]+)")

# --- Helper Functions ---
def get_user_id(current_user: dict):
    return current_user.get("uid") or current_user.get("id")

def get_storage_keys(*values):
    keys = []
    for value in values:
        if value is None:
            continue
        key = str(value)
        if key and key not in keys:
            keys.append(key)
    return keys

def get_user_storage_keys(current_user: dict):
    return get_storage_keys(current_user.get("uid"), current_user.get("id"))

def get_primary_user_storage_key(current_user: dict):
    keys = get_user_storage_keys(current_user)
    if not keys:
        raise HTTPException(status_code=400, detail="User storage key is missing")
    return keys[0]

def get_existing_user_dirs(base_dir: Path, current_user: dict):
    directory = personal_tool_dir(current_user, "lab-note", create=False) / base_dir
    return [directory] if directory.exists() and directory.is_dir() else []

def get_user_dir(base_dir: Path, current_user: dict, create: bool = False):
    existing_dirs = get_existing_user_dirs(base_dir, current_user)
    if existing_dirs:
        return existing_dirs[0]

    dir_path = personal_tool_dir(current_user, "lab-note", create=create) / base_dir
    if create:
        dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path

def find_user_file(base_dir: Path, current_user: dict, filename: str):
    key = user_uid(current_user)
    file_path = personal_tool_dir(current_user, "lab-note", create=False) / base_dir / filename
    if file_path.exists():
        return file_path, key
    return None, None

def iter_user_files(base_dir: Path, current_user: dict, pattern: str):
    seen = set()
    for dir_path in get_existing_user_dirs(base_dir, current_user):
        for file_path in dir_path.glob(pattern):
            if file_path in seen:
                continue
            seen.add(file_path)
            yield file_path

def iter_asset_matches(content: str):
    return ASSET_URL_PATTERN.findall(content)

def generate_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now().isoformat()

def get_experiment_file_and_owner(exp_id: str, current_user: dict, db: Session, directory: Path):
    # 1. Direct ownership
    personal_file = personal_tool_dir(current_user, "lab-note", create=False) / directory / f"{exp_id}.json"
    if personal_file.exists():
        return personal_file, user_uid(current_user)
        
    # 2. Shared access
    lab_memberships = db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()
    lab_ids = [m[0] for m in lab_memberships]
    
    from sqlalchemy import or_
    share = db.query(WorkflowShare).filter(
        WorkflowShare.workflow_id == exp_id,
        or_(
            WorkflowShare.lab_id.in_(lab_ids) if lab_ids else False,
            WorkflowShare.shared_with_user_id == current_user["id"],
            WorkflowShare.shared_by_user_id == current_user["id"]
        )
    ).first()
    
    if share:
        owner = db.query(User).filter(User.id == share.shared_by_user_id).first()
        if owner:
            shared_file = personal_tool_dir(owner, "lab-note", create=False) / directory / f"{exp_id}.json"
            if shared_file.exists():
                return shared_file, user_uid(owner)
                
    return None, None

def delete_asset_file(owner_key: Any, year: str, month: str, filename: str):
    file_path = PERSONAL_ROOT / safe_segment(owner_key) / "lab-note" / ASSETS_DIR / year / month / filename
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as e:
            print(f"Error deleting asset file {file_path}: {e}")

def delete_assets_from_content(content: str, user_id: Any = None):
    for owner_key, year, month, filename in iter_asset_matches(content):
        base_name = filename
        if "_thumb" in filename:
            base_name = filename.replace("_thumb", "")
        else:
            thumb_name = filename
            if "." in filename:
                parts = filename.rsplit(".", 1)
                thumb_name = f"{parts[0]}_thumb.{parts[1]}"
            delete_asset_file(owner_key, year, month, thumb_name)
        delete_asset_file(owner_key, year, month, base_name)

def delete_assets_from_experiment(data: dict, user_id: Any = None):
    for step in data.get("steps", []):
        for img_url in step.get("images", []):
            for owner_key, year, month, filename in iter_asset_matches(img_url):
                base_name = filename
                if "_thumb" in filename:
                    base_name = filename.replace("_thumb", "")
                else:
                    thumb_name = filename
                    if "." in filename:
                        parts = filename.rsplit(".", 1)
                        thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                    delete_asset_file(owner_key, year, month, thumb_name)
                delete_asset_file(owner_key, year, month, base_name)

# --- Notes ---
@router.get("/notes")
async def list_notes(current_user: dict = Depends(get_current_user)):
    user_note_dirs = get_existing_user_dirs(NOTES_DIR, current_user)
    if not user_note_dirs:
        return []
    
    notes_by_id = {}
    for f in iter_user_files(NOTES_DIR, current_user, "*.md"):
        try:
            content = f.read_text()
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    meta = yaml.safe_load(parts[1])
                    if meta:
                        note_id = meta.get("id") or f.stem
                        previous = notes_by_id.get(note_id)
                        if not previous or meta.get("updated_at", "") >= previous.get("updated_at", ""):
                            notes_by_id[note_id] = meta
        except Exception as e:
            print(f"Error reading note {f}: {e}")
    
    notes = list(notes_by_id.values())
    # Sort by updated_at descending
    notes.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return notes

@router.post("/notes")
async def create_note(note: NoteCreate, current_user: dict = Depends(get_current_user)):
    user_notes_dir = get_user_dir(NOTES_DIR, current_user, create=True)
    
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
    note_file, _ = find_user_file(NOTES_DIR, current_user, f"{note_id}.md")
    if not note_file:
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
    note_file, _ = find_user_file(NOTES_DIR, current_user, f"{note_id}.md")
    if not note_file:
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
                old_imgs = set(iter_asset_matches(old_body))
                new_imgs = set(iter_asset_matches(note.body))
                deleted_imgs = old_imgs - new_imgs
                for owner_key, year, month, filename in deleted_imgs:
                    base_name = filename
                    if "_thumb" in filename:
                        base_name = filename.replace("_thumb", "")
                    else:
                        thumb_name = filename
                        if "." in filename:
                            parts = filename.rsplit(".", 1)
                            thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                        delete_asset_file(owner_key, year, month, thumb_name)
                    delete_asset_file(owner_key, year, month, base_name)
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
    note_file, _ = find_user_file(NOTES_DIR, current_user, f"{note_id}.md")
    if note_file and note_file.exists():
        try:
            content = note_file.read_text()
            delete_assets_from_content(content)
        except Exception as e:
            print(f"Error scanning deleted note assets: {e}")
        note_file.unlink()
    return {"status": "success"}

# --- Workflow Presets ---
@router.get("/presets")
async def list_presets(current_user: dict = Depends(get_current_user)):
    user_presets_dirs = get_existing_user_dirs(PRESETS_DIR, current_user)
    if not user_presets_dirs:
        # Create some default presets if empty
        user_presets_dir = get_user_dir(PRESETS_DIR, current_user, create=True)
        default_presets = [
            {
                "id": generate_id(),
                "title": "Plant CRISPR Editing Full Workflow",
                "description": "Full plant CRISPR workflow from target selection and cloning, through E. coli plasmid amplification, Agrobacterium transformation, plant infection, plant DNA extraction, sequencing, and CRISPR editing analysis.",
                "steps": [
                    {"id": generate_id(), "title": "Target Selection", "description": "Choose the gene or genomic region to edit. Confirm the editing goal such as knockout, insertion, or mutation."},
                    {"id": generate_id(), "title": "gRNA Design", "description": "Design the guide RNA sequence for the selected target. Check PAM site, specificity, and possible off-targets."},
                    {"id": generate_id(), "title": "Cloning Setup", "description": "Prepare vector and insert. Assemble the gRNA or target insert into the CRISPR plasmid by ligation or assembly."},
                    {"id": generate_id(), "title": "E. coli Transformation", "description": "Introduce the assembled plasmid into competent E. coli using heat shock or electroporation."},
                    {"id": generate_id(), "title": "Antibiotic Plate Selection", "description": "Plate transformed E. coli on LB agar with the correct antibiotic such as Amp, Kan, or Cm."},
                    {"id": generate_id(), "title": "Colony Picking & Overnight Culture", "description": "Pick a single colony, streak a backup plate, and inoculate LB liquid culture with the correct antibiotic for overnight shaking incubation."},
                    {"id": generate_id(), "title": "Miniprep", "description": "Extract plasmid DNA from overnight E. coli culture using centrifugation, lysis buffer, purification column, wash, and elution."},
                    {"id": generate_id(), "title": "Nanodrop", "description": "Measure plasmid DNA concentration and purity. Record concentration, 260/280, and 260/230 values."},
                    {"id": generate_id(), "title": "PCR Setup", "description": "Prepare PCR reaction using plasmid DNA template, primers, mastermix, and nuclease-free water."},
                    {"id": generate_id(), "title": "PCR Amplification", "description": "Run thermocycler to amplify the target region or insert using denaturation, annealing, and extension cycles."},
                    {"id": generate_id(), "title": "Gel Electrophoresis", "description": "Run agarose gel to check PCR success and confirm expected DNA fragment size."},
                    {"id": generate_id(), "title": "PCR Cleanup", "description": "Purify PCR product to remove primers, enzymes, salts, and buffer components before sequencing."},
                    {"id": generate_id(), "title": "Plasmid Sequencing Verification", "description": "Submit cleaned PCR product or plasmid sample for sequencing to confirm correct gRNA or insert sequence."},
                    {"id": generate_id(), "title": "Agrobacterium Transformation", "description": "Introduce verified CRISPR plasmid into Agrobacterium for plant delivery."},
                    {"id": generate_id(), "title": "Agrobacterium Selection & Culture", "description": "Select transformed Agrobacterium on antibiotic plate, pick colony, and prepare liquid Agro culture."},
                    {"id": generate_id(), "title": "Plant Infection / Transformation", "description": "Infect plant tissue using Agrobacterium-mediated transformation. Tissue may be leaf, root, callus, or other protocol-specific material."},
                    {"id": generate_id(), "title": "T-DNA Transfer", "description": "Allow Agrobacterium to transfer T-DNA carrying the CRISPR construct into plant cells."},
                    {"id": generate_id(), "title": "Genome Editing", "description": "Cas9 and gRNA are expressed in plant cells. Target DNA is cut and repaired, creating possible indels or mutations."},
                    {"id": generate_id(), "title": "Plant Tissue Collection", "description": "Collect infected or transformed plant tissue for downstream DNA extraction."},
                    {"id": generate_id(), "title": "Plant DNA Extraction", "description": "Extract genomic DNA from plant tissue using grinding, lysis buffer, debris removal, and DNA purification."},
                    {"id": generate_id(), "title": "Plant PCR Setup", "description": "Prepare PCR reaction using plant genomic DNA as template and primers targeting the edited region."},
                    {"id": generate_id(), "title": "Plant PCR Amplification", "description": "Amplify the edited target region from plant genomic DNA."},
                    {"id": generate_id(), "title": "Plant Gel Electrophoresis", "description": "Run gel to confirm plant PCR product size and amplification success."},
                    {"id": generate_id(), "title": "Plant PCR Cleanup", "description": "Purify plant PCR product for sequencing by removing contaminants, primers, enzymes, and salts."},
                    {"id": generate_id(), "title": "Plant Sequencing", "description": "Submit purified plant PCR product for Nanopore, Sanger, or NGS sequencing."},
                    {"id": generate_id(), "title": "CRISPR Analysis", "description": "Analyze sequencing reads against WT/reference sequence. Detect indels or mutations and calculate editing efficiency."}
                ]
            }
        ]
        for preset in default_presets:
            (user_presets_dir / f"{preset['id']}.json").write_text(json.dumps(preset, indent=2))
            
    presets_by_id = {}
    for f in iter_user_files(PRESETS_DIR, current_user, "*.json"):
        try:
            preset_data = json.loads(f.read_text())
            presets_by_id[preset_data["id"]] = preset_data
        except:
            pass
    return list(presets_by_id.values())

@router.post("/presets")
async def create_preset(preset: PresetCreate, current_user: dict = Depends(get_current_user)):
    user_presets_dir = get_user_dir(PRESETS_DIR, current_user, create=True)
    
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
    preset_file, _ = find_user_file(PRESETS_DIR, current_user, f"{preset_id}.json")
    if not preset_file:
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
    preset_file, _ = find_user_file(PRESETS_DIR, current_user, f"{preset_id}.json")
    if preset_file and preset_file.exists():
        preset_file.unlink()
    return {"status": "success"}

# --- Experiments ---
@router.get("/experiments/shared")
async def get_shared_workflows(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    from sqlalchemy import or_
    # Find all labs that current_user is member of
    lab_memberships = db.query(LabMember.lab_id).filter(LabMember.user_id == current_user["id"]).all()
    lab_ids = [m[0] for m in lab_memberships]
    
    # Query database shares (matching lab memberships, direct user shares, or shared by the user)
    shares = db.query(WorkflowShare).filter(
        or_(
            WorkflowShare.lab_id.in_(lab_ids) if lab_ids else False,
            WorkflowShare.shared_with_user_id == current_user["id"],
            WorkflowShare.shared_by_user_id == current_user["id"]
        )
    ).all()
    
    shared_workflows = []
    processed_workflow_ids = set()
    
    for share in shares:
        if share.workflow_id in processed_workflow_ids:
            continue
            
        # Get the owner details
        owner = db.query(User).filter(User.id == share.shared_by_user_id).first()
        if not owner:
            continue
            
        filepath = None
        workflow_type = "active"
        owner_root = personal_tool_dir(owner, "lab-note", create=False)
        candidate = owner_root / EXP_ACTIVE_DIR / f"{share.workflow_id}.json"
        if candidate.exists():
            filepath = candidate
            workflow_type = "active"
        else:
            candidate = owner_root / EXP_ARCHIVE_DIR / f"{share.workflow_id}.json"
            if candidate.exists():
                filepath = candidate
                workflow_type = "archive"

        if not filepath or not filepath.exists():
            continue
            
        try:
            data = json.loads(filepath.read_text())
            if owner.id == current_user["id"]:
                data["shared_by_name"] = "You"
            else:
                data["shared_by_name"] = owner.name or owner.email or "Unknown Researcher"
            data["workflow_type"] = workflow_type
            
            # Fetch all lab names this workflow is shared with
            lab_shares_query = db.query(Lab.lab_name).join(
                WorkflowShare, Lab.id == WorkflowShare.lab_id
            ).filter(
                WorkflowShare.workflow_id == share.workflow_id
            )
            # If not owner, filter lab names to only ones the current user is member of
            if owner.id != current_user["id"]:
                lab_shares_query = lab_shares_query.filter(WorkflowShare.lab_id.in_(lab_ids))
            data["shared_with_labs"] = [l[0] for l in lab_shares_query.all()]
            data["shared_labs"] = data["shared_with_labs"]
            
            # Fetch all individual user names/emails this workflow is shared with
            user_shares_query = db.query(User.name, User.email).join(
                WorkflowShare, User.id == WorkflowShare.shared_with_user_id
            ).filter(
                WorkflowShare.workflow_id == share.workflow_id
            ).all()
            data["shared_with_users"] = [u[0] or u[1] for u in user_shares_query]
            data["shared_users"] = data["shared_with_users"]
            
            shared_workflows.append(data)
            processed_workflow_ids.add(share.workflow_id)
        except Exception as e:
            continue
            
    shared_workflows.sort(key=lambda x: x.get("updated_at", x.get("created_at", "")), reverse=True)
    return shared_workflows



@router.get("/experiments/active")
async def list_active_experiments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not get_existing_user_dirs(EXP_ACTIVE_DIR, current_user):
        return []
    
    exps = []
    seen_exp_ids = set()
    for f in iter_user_files(EXP_ACTIVE_DIR, current_user, "*.json"):
        try:
            exp_data = json.loads(f.read_text())
            if exp_data["id"] in seen_exp_ids:
                continue
            seen_exp_ids.add(exp_data["id"])
            shares = db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_data["id"]).all()
            exp_data["shared_lab_ids"] = [str(s.lab_id) for s in shares if s.lab_id]
            exp_data["shared_user_ids"] = [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]
            
            # Fetch lab names
            shared_lab_ids = [s.lab_id for s in shares if s.lab_id]
            if shared_lab_ids:
                labs = db.query(Lab.lab_name).filter(Lab.id.in_(shared_lab_ids)).all()
                exp_data["shared_labs"] = [l[0] for l in labs]
            else:
                exp_data["shared_labs"] = []
                
            # Fetch user names/emails
            shared_user_ids = [s.shared_with_user_id for s in shares if s.shared_with_user_id]
            if shared_user_ids:
                users = db.query(User.name, User.email).filter(User.id.in_(shared_user_ids)).all()
                exp_data["shared_users"] = [u[0] or u[1] for u in users]
            else:
                exp_data["shared_users"] = []
                
            exps.append(exp_data)
        except Exception as e:
            print(f"Error loading active experiment: {e}")
            pass
    
    exps.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return exps

@router.get("/experiments/archive")
async def list_archived_experiments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not get_existing_user_dirs(EXP_ARCHIVE_DIR, current_user):
        return []
    
    exps = []
    seen_exp_ids = set()
    for f in iter_user_files(EXP_ARCHIVE_DIR, current_user, "*.json"):
        try:
            exp_data = json.loads(f.read_text())
            if exp_data["id"] in seen_exp_ids:
                continue
            seen_exp_ids.add(exp_data["id"])
            shares = db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_data["id"]).all()
            exp_data["shared_lab_ids"] = [str(s.lab_id) for s in shares if s.lab_id]
            exp_data["shared_user_ids"] = [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]
            
            # Fetch lab names
            shared_lab_ids = [s.lab_id for s in shares if s.lab_id]
            if shared_lab_ids:
                labs = db.query(Lab.lab_name).filter(Lab.id.in_(shared_lab_ids)).all()
                exp_data["shared_labs"] = [l[0] for l in labs]
            else:
                exp_data["shared_labs"] = []
                
            # Fetch user names/emails
            shared_user_ids = [s.shared_with_user_id for s in shares if s.shared_with_user_id]
            if shared_user_ids:
                users = db.query(User.name, User.email).filter(User.id.in_(shared_user_ids)).all()
                exp_data["shared_users"] = [u[0] or u[1] for u in users]
            else:
                exp_data["shared_users"] = []
                
            exps.append(exp_data)
        except Exception as e:
            print(f"Error loading archived experiment: {e}")
            pass
            
    exps.sort(key=lambda x: x.get("archived_at", ""), reverse=True)
    return exps


@router.post("/experiments")
async def create_experiment(exp: ExperimentCreate, current_user: dict = Depends(get_current_user)):
    dir_path = personal_tool_dir(current_user, "lab-note") / EXP_ACTIVE_DIR
    dir_path.mkdir(parents=True, exist_ok=True)
    
    exp_id = generate_id()
    now = now_iso()
    
    # New Experiment Logs provide an immutable step snapshot from Tree Protocol.
    # Legacy preset-based creation remains supported for older clients.
    steps = [dict(step) for step in exp.steps]
    if not steps and exp.work_type:
        preset_file, _ = find_user_file(PRESETS_DIR, current_user, f"{exp.work_type}.json")
        if preset_file and preset_file.exists():
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
    
    for index, step in enumerate(steps):
        step.setdefault("id", generate_id())
        step.setdefault("title", f"Step {index + 1}")
        step.setdefault("description", "")
        step.setdefault("status", "active" if index == 0 else "pending")
        step.setdefault("comments", [])
        step.setdefault("logs", [])
        step.setdefault("images", [])
        step.setdefault("started_at", now if index == 0 else None)
        step.setdefault("completed_at", None)
        step.setdefault("updated_at", now)

    # If no steps, add a default one for legacy clients.
    if not steps:
        steps.append({
            "id": generate_id(),
            "title": "Initial Step",
            "description": "",
            "status": "pending",
            "comments": [],
            "logs": [],
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
        "protocol_tree_id": exp.protocol_tree_id,
        "protocol_title": exp.protocol_title,
        "protocol_root_id": exp.protocol_root_id,
        "protocol_root_name": exp.protocol_root_name,
        "protocol_snapshot_updated_at": exp.protocol_snapshot_updated_at,
        "run_notes": exp.run_notes,
        "steps": steps,
        "created_at": now,
        "updated_at": now
    }
    
    (dir_path / f"{exp_id}.json").write_text(json.dumps(data, indent=2))
    return data

@router.get("/experiments/{exp_id}")
async def get_experiment(
    exp_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Check active first
    f, owner_id = get_experiment_file_and_owner(exp_id, current_user, db, EXP_ACTIVE_DIR)
    if f and f.exists():
        data = json.loads(f.read_text())
        shares = db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_id).all()
        data["shared_lab_ids"] = [str(s.lab_id) for s in shares if s.lab_id]
        data["shared_user_ids"] = [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]
        return data
        
    # Check archive
    f, owner_id = get_experiment_file_and_owner(exp_id, current_user, db, EXP_ARCHIVE_DIR)
    if f and f.exists():
        data = json.loads(f.read_text())
        shares = db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_id).all()
        data["shared_lab_ids"] = [str(s.lab_id) for s in shares if s.lab_id]
        data["shared_user_ids"] = [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]
        return data
        
    raise HTTPException(status_code=404, detail="Experiment not found")

@router.put("/experiments/{exp_id}")
async def update_experiment(
    exp_id: str, 
    exp_update: ExperimentUpdate, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    f, owner_id = get_experiment_file_and_owner(exp_id, current_user, db, EXP_ACTIVE_DIR)
    if not f or not f.exists():
        raise HTTPException(status_code=404, detail="Active experiment not found or unauthorized")
        
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
        for img_url in deleted_images:
            for owner_key, year, month, filename in iter_asset_matches(img_url):
                base_name = filename
                if "_thumb" in filename:
                    base_name = filename.replace("_thumb", "")
                else:
                    thumb_name = filename
                    if "." in filename:
                        parts = filename.rsplit(".", 1)
                        thumb_name = f"{parts[0]}_thumb.{parts[1]}"
                    delete_asset_file(owner_key, year, month, thumb_name)
                delete_asset_file(owner_key, year, month, base_name)

    if exp_update.title is not None: data["title"] = exp_update.title
    if exp_update.description is not None: data["description"] = exp_update.description
    if exp_update.samples is not None: data["samples"] = exp_update.samples
    if exp_update.tags is not None: data["tags"] = exp_update.tags
    if exp_update.protocol_tree_id is not None: data["protocol_tree_id"] = exp_update.protocol_tree_id
    if exp_update.protocol_title is not None: data["protocol_title"] = exp_update.protocol_title
    if exp_update.protocol_root_id is not None: data["protocol_root_id"] = exp_update.protocol_root_id
    if exp_update.protocol_root_name is not None: data["protocol_root_name"] = exp_update.protocol_root_name
    if exp_update.protocol_snapshot_updated_at is not None: data["protocol_snapshot_updated_at"] = exp_update.protocol_snapshot_updated_at
    if exp_update.run_notes is not None: data["run_notes"] = exp_update.run_notes
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
async def delete_experiment(
    exp_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    deleted = False
    f1, _ = find_user_file(EXP_ACTIVE_DIR, current_user, f"{exp_id}.json")
    if f1 and f1.exists():
        try:
            data = json.loads(f1.read_text())
            delete_assets_from_experiment(data)
        except Exception as e:
            print(f"Error cleaning active experiment assets: {e}")
        f1.unlink()
        deleted = True
        
    f2, _ = find_user_file(EXP_ARCHIVE_DIR, current_user, f"{exp_id}.json")
    if f2 and f2.exists():
        try:
            data = json.loads(f2.read_text())
            delete_assets_from_experiment(data)
        except Exception as e:
            print(f"Error cleaning archived experiment assets: {e}")
        f2.unlink()
        deleted = True

    if not deleted:
        raise HTTPException(status_code=404, detail="Experiment not found or unauthorized")

    # The owner is deleting the workflow, so its sharing records must not remain.
    db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_id).delete(synchronize_session=False)
    db.commit()
        
    return {"status": "success"}

@router.post("/experiments/{exp_id}/archive")
async def archive_experiment(
    exp_id: str, 
    req: ArchiveRequest, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    active_f, owner_id = get_experiment_file_and_owner(exp_id, current_user, db, EXP_ACTIVE_DIR)
    if not active_f or not active_f.exists():
        raise HTTPException(status_code=404, detail="Active experiment not found or unauthorized")
        
    owner = db.query(User).filter(User.uid == str(owner_id)).first() or current_user
    archive_dir = personal_tool_dir(owner, "lab-note") / EXP_ARCHIVE_DIR
    archive_dir.mkdir(parents=True, exist_ok=True)
    
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
    user_id = get_primary_user_storage_key(current_user)
    now = datetime.now()
    year_month = now.strftime("%Y/%m")
    asset_dir = personal_tool_dir(current_user, "lab-note") / ASSETS_DIR / year_month
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
    file_path = PERSONAL_ROOT / safe_segment(user_id) / "lab-note" / ASSETS_DIR / year / month / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(path=file_path)

# --- Archived Experiment Comments ---
@router.post("/experiments/{exp_id}/archive/comment")
async def add_archive_comment(
    exp_id: str,
    comment: CommentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Find experiment JSON file in archive
    archive_file = None
    for f in PERSONAL_ROOT.glob(f"*/lab-note/{EXP_ARCHIVE_DIR.as_posix()}/{exp_id}.json"):
        archive_file = f
        break
        
    if not archive_file or not archive_file.exists():
        # Check active directory just in case the experiment is not yet archived
        for f in PERSONAL_ROOT.glob(f"*/lab-note/{EXP_ACTIVE_DIR.as_posix()}/{exp_id}.json"):
            archive_file = f
            break
            
    if not archive_file or not archive_file.exists():
        raise HTTPException(status_code=404, detail="Experiment not found")
        
    try:
        data = json.loads(archive_file.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read experiment: {str(e)}")
        
    # Append the comment
    if "comments" not in data:
        data["comments"] = []
        
    new_comment = {
        "id": str(uuid.uuid4()),
        "text": comment.text,
        "user_id": current_user["id"],
        "user_name": current_user.get("name") or current_user.get("email") or "Unknown",
        "created_at": now_iso()
    }
    data["comments"].append(new_comment)
    data["updated_at"] = now_iso()
    
    # Save back to disk
    try:
        archive_file.write_text(json.dumps(data, indent=2))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save comment: {str(e)}")
        
    return new_comment

# --- Workflow Preset Transfers ---
@router.post("/presets/send")
async def send_workflow_preset(
    req: PresetTransferRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Verify the preset file exists and is owned by current_user
    preset_file, _ = find_user_file(PRESETS_DIR, current_user, f"{req.preset_id}.json")
    if not preset_file:
        raise HTTPException(status_code=404, detail="Preset template not found or unauthorized")
        
    try:
        preset_data = json.loads(preset_file.read_text())
    except:
        raise HTTPException(status_code=500, detail="Failed to parse preset template")
        
    # Create DB entry for transfer
    transfer = WorkflowPresetTransfer(
        preset_id=req.preset_id,
        preset_data=preset_data,
        sender_user_id=current_user["id"],
        receiver_user_id=req.to_user_id,
        status="pending"
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    
    return {"message": "Preset transfer sent successfully", "transfer_id": str(transfer.id)}

@router.get("/presets/transfers/incoming")
async def get_incoming_workflow_transfers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    transfers = db.query(WorkflowPresetTransfer).filter(
        WorkflowPresetTransfer.receiver_user_id == current_user["id"],
        WorkflowPresetTransfer.status == "pending"
    ).all()
    
    result = []
    for t in transfers:
        sender = db.query(User).filter(User.id == t.sender_user_id).first()
        result.append({
            "id": str(t.id),
            "preset_id": t.preset_id,
            "preset_name": t.preset_data.get("title") or "Unnamed Template",
            "sender_name": sender.name if sender else "Unknown",
            "created_at": t.created_at
        })
    return result

@router.post("/presets/transfers/{transfer_id}/accept")
async def accept_workflow_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    transfer = db.query(WorkflowPresetTransfer).filter(
        WorkflowPresetTransfer.id == uuid.UUID(transfer_id),
        WorkflowPresetTransfer.receiver_user_id == current_user["id"],
        WorkflowPresetTransfer.status == "pending"
    ).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found or already processed")
        
    user_presets_dir = get_user_dir(PRESETS_DIR, current_user, create=True)
    
    # Save the preset template to user directory
    new_preset_id = generate_id()
    preset_data = dict(transfer.preset_data)
    preset_data["id"] = new_preset_id
    preset_data["title"] = f"{preset_data.get('title', 'Template')} (Shared)"
    preset_data["created_at"] = now_iso()
    
    preset_file = user_presets_dir / f"{new_preset_id}.json"
    preset_file.write_text(json.dumps(preset_data, indent=2))
    
    # Update transfer status
    transfer.status = "accepted"
    db.commit()
    
    return {"message": "Preset template accepted successfully", "preset_id": new_preset_id}

@router.post("/presets/transfers/{transfer_id}/reject")
async def reject_workflow_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    transfer = db.query(WorkflowPresetTransfer).filter(
        WorkflowPresetTransfer.id == uuid.UUID(transfer_id),
        WorkflowPresetTransfer.receiver_user_id == current_user["id"]
    ).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found")
        
    transfer.status = "rejected"
    db.commit()
    
    return {"message": "Preset template transfer rejected"}

# --- Revocable Lab Workflow Sharing ---
@router.get("/experiments/{exp_id}/shares")
async def get_workflow_shares(
    exp_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    shares = db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_id).all()
    return {
        "lab_ids": [str(s.lab_id) for s in shares if s.lab_id],
        "user_ids": [str(s.shared_with_user_id) for s in shares if s.shared_with_user_id]
    }

@router.put("/experiments/{exp_id}/shares")
async def update_workflow_shares(
    exp_id: str,
    payload: WorkflowShareUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Verify that the user owns the experiment
    active_path, _ = find_user_file(EXP_ACTIVE_DIR, current_user, f"{exp_id}.json")
    archive_path, _ = find_user_file(EXP_ARCHIVE_DIR, current_user, f"{exp_id}.json")
    if not active_path and not archive_path:
        raise HTTPException(status_code=403, detail="Not authorized to share this workflow")
        
    # Delete existing shares
    db.query(WorkflowShare).filter(WorkflowShare.workflow_id == exp_id).delete()
    
    # Create new lab shares
    for lab_id_str in payload.lab_ids:
        try:
            db.add(WorkflowShare(
                workflow_id=exp_id,
                workflow_type=payload.workflow_type,
                lab_id=uuid.UUID(lab_id_str),
                shared_by_user_id=current_user["id"]
            ))
        except Exception as e:
            continue
            
    # Create new individual user shares
    for user_id_str in payload.user_ids:
        try:
            db.add(WorkflowShare(
                workflow_id=exp_id,
                workflow_type=payload.workflow_type,
                shared_with_user_id=int(user_id_str),
                shared_by_user_id=current_user["id"]
            ))
        except Exception as e:
            continue
            
    db.commit()
    return {"message": "Workflow sharing configuration updated successfully"}
