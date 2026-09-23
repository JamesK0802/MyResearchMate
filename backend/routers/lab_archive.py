import os
import json
import re
import shutil
import uuid
from datetime import datetime
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import User, Lab, LabMember
from auth.dependencies import get_current_user
from fastapi.responses import FileResponse
from jose import jwt
from storage.file_store import lab_tool_dir

router = APIRouter(prefix="/lab-archive", tags=["lab-archive"])

def sanitize_name(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def get_lab_dir(db: Session, lab_id: str) -> str:
    lab = db.query(Lab).filter(Lab.id == lab_id).first()
    if not lab:
        raise HTTPException(status_code=404, detail="Lab not found")
    return str(lab_tool_dir(lab.lab_name, "lab-archive"))

def check_lab_membership(db: Session, current_user: dict, lab_id: str):
    member = db.query(LabMember).filter(LabMember.lab_id == lab_id, LabMember.user_id == current_user["id"]).first()
    if not member:
        if current_user.get("role") not in ["admin", "owner"]:
            raise HTTPException(status_code=403, detail="Not a member of this lab")

def now_iso():
    return datetime.now().isoformat()

def read_records(lab_dir: str) -> list:
    records_file = os.path.join(lab_dir, "archive_records.json")
    if not os.path.exists(records_file):
        return []
    try:
        with open(records_file, "r") as f:
            return json.load(f)
    except:
        return []

def write_records(lab_dir: str, records: list):
    records_file = os.path.join(lab_dir, "archive_records.json")
    with open(records_file, "w") as f:
        json.dump(records, f, indent=2)

def read_samples(lab_dir: str) -> list:
    samples_file = os.path.join(lab_dir, "archive_samples.json")
    if not os.path.exists(samples_file):
        return []
    try:
        with open(samples_file, "r") as f:
            return json.load(f)
    except:
        return []

def write_samples(lab_dir: str, samples: list):
    samples_file = os.path.join(lab_dir, "archive_samples.json")
    with open(samples_file, "w") as f:
        json.dump(samples, f, indent=2)

def read_archive_settings(lab_dir: str) -> dict:
    settings_file = os.path.join(lab_dir, "archive_settings.json")
    if not os.path.exists(settings_file):
        return {"storage_location_rules": []}
    try:
        with open(settings_file, "r") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {"storage_location_rules": []}
    except (OSError, json.JSONDecodeError):
        return {"storage_location_rules": []}

def write_archive_settings(lab_dir: str, settings: dict):
    settings_file = os.path.join(lab_dir, "archive_settings.json")
    with open(settings_file, "w") as f:
        json.dump(settings, f, indent=2)

def can_manage_lab(db: Session, current_user: dict, lab_id: str) -> bool:
    if current_user.get("role") in ["admin", "owner"]:
        return True
    return db.query(LabMember).filter(
        LabMember.lab_id == lab_id,
        LabMember.user_id == current_user["id"],
        LabMember.role_in_lab.in_(["leader", "admin"])
    ).first() is not None

def _rule_matches(barcode: str, match: dict) -> bool:
    mode = match.get("type", "starts_with")
    expected = str(match.get("value", ""))
    actual_folded = barcode.casefold()
    expected_folded = expected.casefold()
    if mode == "always":
        return True
    if not expected:
        return False
    if mode == "starts_with":
        return actual_folded.startswith(expected_folded)
    if mode == "contains":
        return expected_folded in actual_folded
    if mode == "ends_with":
        return actual_folded.endswith(expected_folded)
    if mode == "equals":
        return actual_folded == expected_folded
    return False

def _storage_part(barcode: str, part: dict) -> str:
    part_type = part.get("type", "text")
    value = str(part.get("value", ""))
    result = ""
    if part_type == "text":
        result = value
    elif part_type == "barcode":
        result = barcode
    elif part_type == "characters":
        start = max(1, int(part.get("start", 1) or 1)) - 1
        end = max(start + 1, int(part.get("end", start + 1) or start + 1))
        result = barcode[start:end]
    elif part_type == "characters_from_end":
        near = max(1, int(part.get("start", 1) or 1))
        far = max(near, int(part.get("end", near) or near))
        result = barcode[max(0, len(barcode)-far):max(0, len(barcode)-near+1)]
    elif part_type in ["digits_after", "remainder_after"]:
        marker_index = barcode.casefold().find(value.casefold()) if value else -1
        remainder = barcode[marker_index + len(value):] if marker_index >= 0 else ""
        if part_type == "digits_after":
            number_match = re.search(r"\d+", remainder)
            result = number_match.group(0) if number_match else ""
        else:
            result = remainder
    elif part_type == "number_group":
        groups = re.findall(r"\d+", barcode)
        group_index = max(1, int(part.get("group", 1) or 1)) - 1
        result = groups[group_index] if group_index < len(groups) else ""

    result = result[max(0, int(part.get("trimStart", 0) or 0)):max(0, len(result)-max(0, int(part.get("trimEnd", 0) or 0)))].strip()
    if not result:
        return ""
    template = part.get("template")
    if template is not None:
        selected = result
        result = re.sub(
            r"\{(\d+)\}",
            lambda match: selected[int(match.group(1)) - 1] if 0 < int(match.group(1)) <= len(selected) else "",
            str(template),
        )
    else:
        for mapping in part.get("mappings", []) or []:
            if str(mapping.get("from", "")).lower() == result.lower():
                result = str(mapping.get("to", ""))
                break
    transform = part.get("transform", "as_is")
    if transform == "uppercase":
        result = result.upper()
    elif transform == "lowercase":
        result = result.lower()
    return (str(part.get("prefix", "") or "") + result + str(part.get("suffix", "") or "")) if result else ""

def calculate_storage_location(barcode: str, rules: list) -> Optional[str]:
    enabled_rules = [rule for rule in rules if rule.get("enabled", True)]
    if not enabled_rules:
        return None
    results = []
    for rule in enabled_rules:
        if not _rule_matches(barcode or "", rule.get("match", {})):
            continue
        separator = str(rule.get("separator", " "))
        pieces = [(part, _storage_part(barcode or "", part)) for part in rule.get("parts", [])]
        output = ""
        for part, piece in ((part, piece) for part, piece in pieces if piece):
            output += ((separator if part.get("joiner") is None else str(part.get("joiner"))) if output else "") + piece
        results.append((rule.get("name") or rule.get("id", "Rule"), output))
    if len({output for _, output in results}) > 1:
        detail = "; ".join(f'{name} → “{output}”' for name, output in results)
        raise HTTPException(status_code=422, detail=f'Conflicting location rules for “{barcode}”: {detail}')
    return results[0][1] if results else ""

def get_linked_paths(lab_dir: str) -> dict:
    """Returns dict of {relative_path: record_id} for all files linked to records or samples."""
    records = read_records(lab_dir)
    linked = {}
    for r in records:
        for f in r.get("files", []):
            p = f.get("path")
            if p:
                normalized = p.replace('\\', '/').strip('/')
                linked[normalized] = r.get("id")
    
    samples = read_samples(lab_dir)
    for s in samples:
        for f in s.get("files", []):
            p = f.get("path")
            if p:
                normalized = p.replace('\\', '/').strip('/')
                linked[normalized] = s.get("id") or "sample"
    return linked

# --- Models ---
class ArchiveRecordCreate(BaseModel):
    title: str
    summary: Optional[str] = ""
    description: Optional[str] = ""
    links: List[str] = []

class LinkFileRequest(BaseModel):
    path: str

class ArchiveRecordUpdate(BaseModel):
    title: str
    summary: Optional[str] = ""
    description: Optional[str] = ""
    links: List[str] = []

class CommentCreate(BaseModel):
    text: str

class FsMoveRequest(BaseModel):
    source_path: str
    dest_path: str

class FsCopyRequest(BaseModel):
    source_path: str
    dest_path: str

class FsMkdirRequest(BaseModel):
    path: str
    folder_name: str

class FsDeleteRequest(BaseModel):
    path: str

class SampleFileItem(BaseModel):
    filename: str
    path: str
    uploaded_at: Optional[str] = None

class SampleItem(BaseModel):
    id: Optional[str] = None
    barcode: Optional[str] = ""
    sample_name: Optional[str] = ""
    storage_location: Optional[str] = ""
    person: Optional[str] = ""
    project: Optional[str] = ""
    lab: Optional[str] = ""
    links: List[str] = []
    files: List[SampleFileItem] = []
    linked_record_id: Optional[str] = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class SamplesSaveRequest(BaseModel):
    samples: List[SampleItem]

class StorageRuleMatch(BaseModel):
    type: Literal["starts_with", "contains", "ends_with", "equals", "always"] = "starts_with"
    value: str = ""

class StorageRulePart(BaseModel):
    type: Literal["text", "barcode", "characters", "characters_from_end", "digits_after", "remainder_after", "number_group"] = "text"
    joiner: Optional[str] = None
    value: str = ""
    start: int = 1
    end: int = 1
    group: int = 1
    transform: Literal["as_is", "uppercase", "lowercase"] = "as_is"
    label: str = ""
    trimStart: int = Field(default=0, ge=0)
    trimEnd: int = Field(default=0, ge=0)
    prefix: str = ""
    suffix: str = ""
    template: Optional[str] = None
    mappings: List[dict] = Field(default_factory=list)

class StorageLocationRule(BaseModel):
    id: str
    name: str = "Storage rule"
    enabled: bool = True
    match: StorageRuleMatch = Field(default_factory=StorageRuleMatch)
    separator: str = " "
    parts: List[StorageRulePart] = Field(default_factory=list)

class ArchiveSettingsUpdate(BaseModel):
    storage_location_rules: List[StorageLocationRule] = Field(default_factory=list)

# --- Records API ---
@router.get("/{lab_id}/records")
async def list_records(lab_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return records

@router.post("/{lab_id}/records")
async def create_record(lab_id: str, record: ArchiveRecordCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    new_record = {
        "id": str(uuid.uuid4()),
        "title": record.title,
        "summary": record.summary,
        "description": record.description,
        "links": record.links,
        "files": [],
        "created_by": current_user.get("name") or current_user.get("email"),
        "created_by_uid": current_user.get("uid"),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "comments": []
    }
    
    records = read_records(lab_dir)
    records.append(new_record)
    write_records(lab_dir, records)
    return new_record

@router.patch("/{lab_id}/records/{record_id}")
async def update_record(lab_id: str, record_id: str, record_data: ArchiveRecordUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    
    is_admin = current_user.get("role") in ["admin", "owner"]
    found = False
    updated_record = None
    for r in records:
        if r.get("id") == record_id:
            if not is_admin and r.get("created_by_uid") != current_user.get("uid"):
                raise HTTPException(status_code=403, detail="Not authorized to edit this record")
            r["title"] = record_data.title
            r["summary"] = record_data.summary
            r["description"] = record_data.description
            r["links"] = record_data.links
            r["updated_at"] = now_iso()
            found = True
            updated_record = r
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="Record not found")
        
    write_records(lab_dir, records)
    return updated_record

@router.delete("/{lab_id}/records/{record_id}")
async def delete_record(lab_id: str, record_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    
    is_admin = current_user.get("role") in ["admin", "owner"]
    filtered_records = []
    deleted = False
    for r in records:
        if r.get("id") == record_id:
            if not is_admin and r.get("created_by_uid") != current_user.get("uid"):
                raise HTTPException(status_code=403, detail="Not authorized to delete this record")
            deleted = True
        else:
            filtered_records.append(r)
    if not deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    write_records(lab_dir, filtered_records)
    return {"status": "success"}

@router.post("/{lab_id}/records/{record_id}/comments")
async def add_record_comment(lab_id: str, record_id: str, comment: CommentCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    
    new_comment = {
        "id": str(uuid.uuid4()),
        "user_name": current_user.get("name") or current_user.get("email"),
        "user_uid": current_user.get("uid"),
        "text": comment.text,
        "created_at": now_iso()
    }
    found = False
    for r in records:
        if r.get("id") == record_id:
            r.setdefault("comments", []).append(new_comment)
            r["updated_at"] = now_iso()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Record not found")
    write_records(lab_dir, records)
    return new_comment

@router.delete("/{lab_id}/records/{record_id}/comments/{comment_id}")
async def delete_record_comment(lab_id: str, record_id: str, comment_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    
    is_admin = current_user.get("role") in ["admin", "owner"]
    found = False
    for r in records:
        if r.get("id") == record_id:
            original_len = len(r.get("comments", []))
            if is_admin:
                r["comments"] = [c for c in r.get("comments", []) if c.get("id") != comment_id]
            else:
                r["comments"] = [c for c in r.get("comments", []) if not (c.get("id") == comment_id and c.get("user_uid") == current_user.get("uid"))]
            if len(r["comments"]) < original_len:
                found = True
                r["updated_at"] = now_iso()
            break
    if not found:
        raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    write_records(lab_dir, records)
    return {"status": "success"}

@router.post("/{lab_id}/records/{record_id}/upload")
async def upload_record_attachment(lab_id: str, record_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Upload a file and link it to a record. File is stored in the lab's root directory (visible in explorer)."""
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    records = read_records(lab_dir)
    record = next((r for r in records if r.get("id") == record_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Save file to lab root directory (visible in explorer)
    filename = file.filename
    file_path = os.path.join(lab_dir, filename)
    
    # Handle name collision
    if os.path.exists(file_path):
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(file_path):
            filename = f"{base}_{counter}{ext}"
            file_path = os.path.join(lab_dir, filename)
            counter += 1
    
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Relative path from lab_dir
    rel_path = filename
    
    file_entry = {
        "filename": filename,
        "path": rel_path,
        "uploaded_at": now_iso()
    }
    record.setdefault("files", []).append(file_entry)
    record["updated_at"] = now_iso()
    write_records(lab_dir, records)
    return file_entry

@router.post("/{lab_id}/records/{record_id}/link-file")
async def link_record_file(lab_id: str, record_id: str, req: LinkFileRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    record = next((r for r in records if r.get("id") == record_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    safe_path = os.path.normpath(os.path.join(lab_dir, req.path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)) or not os.path.exists(safe_path) or os.path.isdir(safe_path):
        raise HTTPException(status_code=400, detail="File does not exist or is a directory")
        
    rel_path = os.path.relpath(safe_path, lab_dir).replace('\\', '/')
    filename = os.path.basename(safe_path)
    
    if any(f.get("path") == rel_path for f in record.get("files", [])):
        existing = next(f for f in record.get("files", []) if f.get("path") == rel_path)
        return existing
        
    file_entry = {
        "filename": filename,
        "path": rel_path,
        "uploaded_at": now_iso()
    }
    record.setdefault("files", []).append(file_entry)
    record["updated_at"] = now_iso()
    write_records(lab_dir, records)
    return file_entry

@router.post("/{lab_id}/records/{record_id}/unlink-file")
async def unlink_record_file(lab_id: str, record_id: str, req: LinkFileRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    records = read_records(lab_dir)
    record = next((r for r in records if r.get("id") == record_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
        
    rel_path = req.path.replace('\\', '/').strip('/')
    record["files"] = [f for f in record.get("files", []) if f.get("path", "").replace('\\', '/').strip('/') != rel_path]
    record["updated_at"] = now_iso()
    write_records(lab_dir, records)
    return {"status": "success"}

# --- Samples API ---
@router.get("/{lab_id}/settings")
async def get_archive_settings(lab_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    settings = read_archive_settings(get_lab_dir(db, lab_id))
    settings["can_manage"] = can_manage_lab(db, current_user, lab_id)
    return settings

@router.put("/{lab_id}/settings")
async def update_archive_settings(lab_id: str, req: ArchiveSettingsUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    if not can_manage_lab(db, current_user, lab_id):
        raise HTTPException(status_code=403, detail="Only lab leaders can change archive storage rules")
    if len(req.storage_location_rules) > 50 or any(len(rule.parts) > 20 for rule in req.storage_location_rules):
        raise HTTPException(status_code=400, detail="Too many storage location rules or output parts")
    settings = {"storage_location_rules": [rule.dict() for rule in req.storage_location_rules], "updated_at": now_iso()}
    for sample in read_samples(get_lab_dir(db, lab_id)):
        calculate_storage_location(sample.get("barcode") or "", settings["storage_location_rules"])
    write_archive_settings(get_lab_dir(db, lab_id), settings)
    return {**settings, "can_manage": True}

@router.get("/{lab_id}/samples")
async def list_samples(lab_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    samples = read_samples(lab_dir)
    return samples

@router.post("/{lab_id}/samples")
async def save_samples(lab_id: str, req: SamplesSaveRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    rules = read_archive_settings(lab_dir).get("storage_location_rules", [])
    saved_samples = []
    for s in req.samples:
        s_id = s.id or str(uuid.uuid4())
        created_at = s.created_at or now_iso()
        updated_at = now_iso()
        
        calculated_location = calculate_storage_location(s.barcode or "", rules)
        saved_samples.append({
            "id": s_id,
            "barcode": s.barcode or "",
            "sample_name": s.sample_name or "",
            "storage_location": calculated_location if calculated_location is not None else (s.storage_location or ""),
            "person": s.person or "",
            "project": s.project or "",
            "lab": s.lab or "",
            "links": s.links or [],
            "files": [f.dict() for f in s.files] if s.files else [],
            "linked_record_id": s.linked_record_id or "",
            "created_at": created_at,
            "updated_at": updated_at
        })
        
    write_samples(lab_dir, saved_samples)
    return saved_samples

@router.post("/{lab_id}/samples/{sample_id}/upload")
async def upload_sample_attachment(
    lab_id: str, 
    sample_id: str, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    filename = file.filename
    file_path = os.path.join(lab_dir, filename)
    
    if os.path.exists(file_path):
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(file_path):
            filename = f"{base}_{counter}{ext}"
            file_path = os.path.join(lab_dir, filename)
            counter += 1
            
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    file_entry = {
        "filename": filename,
        "path": filename,
        "uploaded_at": now_iso()
    }
    return file_entry

# --- File Explorer API ---
@router.get("/{lab_id}/fs")
async def fs_list(lab_id: str, path: str = "", db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    safe_path = os.path.normpath(os.path.join(lab_dir, path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.exists(safe_path):
        return []
    
    # Build linked files lookup
    linked = get_linked_paths(lab_dir)
    
    files = []
    for item in os.listdir(safe_path):
        # Hide the JSON index files
        if path == "" and item in ("archive_records.json", "archive_samples.json", "archive_settings.json"):
            continue
        item_path = os.path.join(safe_path, item)
        is_dir = os.path.isdir(item_path)
        stat = os.stat(item_path)
        rel = os.path.relpath(item_path, lab_dir).replace('\\', '/')
        normalized_rel = rel.replace('\\', '/').strip('/')
        files.append({
            "name": item,
            "is_dir": is_dir,
            "size": stat.st_size if not is_dir else 0,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "rel_path": rel,
            "is_linked": normalized_rel in linked,
            "linked_record_id": linked.get(normalized_rel)
        })
    
    files.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return files

@router.post("/{lab_id}/fs/upload")
async def fs_upload(lab_id: str, path: str = Form(""), file: UploadFile = File(...), db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    safe_path = os.path.normpath(os.path.join(lab_dir, path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    os.makedirs(safe_path, exist_ok=True)
    file_path = os.path.join(safe_path, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "success", "filename": file.filename}

@router.post("/{lab_id}/fs/mkdir")
async def fs_mkdir(lab_id: str, req: FsMkdirRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    safe_path = os.path.normpath(os.path.join(lab_dir, req.path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    new_dir = os.path.join(safe_path, sanitize_name(req.folder_name))
    os.makedirs(new_dir, exist_ok=True)
    return {"status": "success", "folder": req.folder_name}

@router.post("/{lab_id}/fs/delete")
async def fs_delete(lab_id: str, req: FsDeleteRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    safe_path = os.path.normpath(os.path.join(lab_dir, req.path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)) or safe_path == os.path.normpath(lab_dir):
        raise HTTPException(status_code=400, detail="Invalid path")
    
    # Prevent deletion of record-linked files
    rel = os.path.relpath(safe_path, lab_dir).replace('\\', '/').strip('/')
    linked = get_linked_paths(lab_dir)
    if rel in linked:
        raise HTTPException(status_code=403, detail="This file is linked to a record. Remove it from the record first, or move it instead.")
    
    if os.path.exists(safe_path):
        if os.path.isdir(safe_path):
            # Check if directory contains any linked files recursively
            for linked_path in linked.keys():
                normalized_linked = linked_path.replace('\\', '/').strip('/')
                if normalized_linked == rel or normalized_linked.startswith(rel + "/"):
                    raise HTTPException(
                        status_code=403, 
                        detail=f"Cannot delete folder because it contains a file linked to a record: {os.path.basename(linked_path)}. Remove it from the record first."
                    )
            shutil.rmtree(safe_path)
        else:
            os.remove(safe_path)
    return {"status": "success"}

@router.post("/{lab_id}/fs/move")
async def fs_move(lab_id: str, req: FsMoveRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    src_path = os.path.normpath(os.path.join(lab_dir, req.source_path.lstrip('/')))
    dst_path = os.path.normpath(os.path.join(lab_dir, req.dest_path.lstrip('/')))
    if not src_path.startswith(os.path.normpath(lab_dir)) or not dst_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail="Source not found")
    
    src_rel = os.path.relpath(src_path, lab_dir).replace('\\', '/')
    
    shutil.move(src_path, dst_path)
    
    # Compute new relative path
    if os.path.isdir(dst_path):
        dst_rel = os.path.relpath(os.path.join(dst_path, os.path.basename(src_path)), lab_dir).replace('\\', '/')
    else:
        dst_rel = os.path.relpath(dst_path, lab_dir).replace('\\', '/')
    
    src_rel_slash = src_rel + '/'
    
    # Update any record references to the moved file/folder
    records = read_records(lab_dir)
    changed = False
    for r in records:
        for f_entry in r.get("files", []):
            p = f_entry.get("path")
            if p == src_rel:
                f_entry["path"] = dst_rel
                f_entry["filename"] = os.path.basename(dst_rel)
                changed = True
            elif p and p.startswith(src_rel_slash):
                f_entry["path"] = dst_rel + p[len(src_rel):]
                changed = True
    if changed:
        write_records(lab_dir, records)
        
    # Update any sample references to the moved file/folder
    samples = read_samples(lab_dir)
    samples_changed = False
    for s in samples:
        for f_entry in s.get("files", []):
            p = f_entry.get("path")
            if p == src_rel:
                f_entry["path"] = dst_rel
                f_entry["filename"] = os.path.basename(dst_rel)
                samples_changed = True
            elif p and p.startswith(src_rel_slash):
                f_entry["path"] = dst_rel + p[len(src_rel):]
                samples_changed = True
    if samples_changed:
        write_samples(lab_dir, samples)
    
    return {"status": "success", "new_path": dst_rel}

@router.post("/{lab_id}/fs/copy")
async def fs_copy(lab_id: str, req: FsCopyRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    check_lab_membership(db, current_user, lab_id)
    lab_dir = get_lab_dir(db, lab_id)
    
    src_path = os.path.normpath(os.path.join(lab_dir, req.source_path.lstrip('/')))
    dst_path = os.path.normpath(os.path.join(lab_dir, req.dest_path.lstrip('/')))
    if not src_path.startswith(os.path.normpath(lab_dir)) or not dst_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.exists(src_path):
        raise HTTPException(status_code=404, detail="Source not found")
    
    filename = os.path.basename(src_path)
    if os.path.isdir(dst_path):
        target_path = os.path.join(dst_path, filename)
    else:
        target_path = dst_path
        
    # Handle naming collision (e.g. append _copy, _copy2...)
    if os.path.exists(target_path):
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(target_path):
            new_filename = f"{base}_copy{counter if counter > 1 else ''}{ext}"
            if os.path.isdir(dst_path):
                target_path = os.path.join(dst_path, new_filename)
            else:
                parent = os.path.dirname(dst_path)
                target_path = os.path.join(parent, new_filename)
            counter += 1
            
    if os.path.isdir(src_path):
        shutil.copytree(src_path, target_path)
    else:
        shutil.copy2(src_path, target_path)
        
    rel_dst = os.path.relpath(target_path, lab_dir).replace('\\', '/')
    return {"status": "success", "new_path": rel_dst}

@router.get("/{lab_id}/fs/download")
async def fs_download(
    lab_id: str, 
    path: str, 
    token: Optional[str] = None, 
    db: Session = Depends(get_db), 
    request: Request = None
):
    user_email = None
    auth_token = token
    
    if not auth_token and request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            auth_token = auth_header.split(" ")[1]
            
    if auth_token:
        try:
            from jose import jwt
            from auth.dependencies import SUPABASE_JWT_SECRET
            
            header = jwt.get_unverified_header(auth_token)
            alg = header.get("alg")
            if alg == "ES256":
                payload = jwt.get_unverified_claims(auth_token)
            else:
                try:
                    payload = jwt.decode(auth_token, SUPABASE_JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
                except:
                    payload = jwt.get_unverified_claims(auth_token)
            user_email = payload.get("email")
        except Exception as e:
            print(f"[DOWNLOAD AUTH] Query token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")
            
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    member = db.query(LabMember).filter(LabMember.lab_id == lab_id, LabMember.user_id == user.id).first()
    if not member and user.role not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Not a member of this lab")

    lab_dir = get_lab_dir(db, lab_id)
    safe_path = os.path.normpath(os.path.join(lab_dir, path.lstrip('/')))
    if not safe_path.startswith(os.path.normpath(lab_dir)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.exists(safe_path) or os.path.isdir(safe_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        safe_path,
        filename=os.path.basename(safe_path),
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )
