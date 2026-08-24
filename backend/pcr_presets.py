from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import PcrPreset, User, PcrPresetTransfer, PcrPresetLabShare, Lab, LabMember
from pydantic import BaseModel
import uuid
from sqlalchemy.orm.attributes import set_committed_value
from storage.file_store import document_path, read_json, relative_data_path, resolve_data_path, write_json

router = APIRouter(prefix="/pcr-presets", tags=["pcr"])


def hydrate_preset(preset: PcrPreset):
    payload = read_json(preset.storage_path, None) if preset.storage_path else None
    if isinstance(payload, dict):
        for field, key in (
            ("name", "name"), ("category", "category"), ("description", "description"),
            ("primer_f", "primer_f"), ("primer_r", "primer_r"), ("product_size", "product_size"),
            ("components_json", "components"), ("is_public", "is_public"),
        ):
            if key in payload:
                set_committed_value(preset, field, payload[key])
        preset.file_default_reaction_volume = payload.get("defaultReactionVolume", 20)
        preset.file_allowed_reaction_volumes = payload.get("allowedReactionVolumes", [])
    return preset


def save_personal_preset_file(
    preset: PcrPreset,
    current_user: dict,
    components: list,
    default_reaction_volume: float = 20,
    allowed_reaction_volumes: Optional[List[float]] = None,
) -> None:
    path = document_path(current_user, "solution-protocol", preset.id)
    write_json(path, {
        "version": 1, "type": "solution-protocol", "id": str(preset.id), "name": preset.name,
        "category": preset.category, "description": preset.description or "", "primer_f": preset.primer_f,
        "primer_r": preset.primer_r, "product_size": preset.product_size,
        "components": components, "is_public": bool(preset.is_public),
        "defaultReactionVolume": default_reaction_volume,
        "allowedReactionVolumes": allowed_reaction_volumes or [default_reaction_volume],
    })
    preset.storage_path = relative_data_path(path)

class PcrComponent(BaseModel):
    name: str
    componentType: Optional[str] = None
    calculationMode: str
    # Older built-in presets omitted this field, which Angular represented as
    # null when a user saved a copy. Treat that legacy value as false.
    isOptional: Optional[bool] = False
    stockConcentration: Optional[float] = None
    stockUnit: Optional[str] = None
    finalConcentration: Optional[float] = None
    finalUnit: Optional[str] = None
    ratioDenominator: Optional[float] = None
    fixedVolume: Optional[float] = None
    volumePer25ul: Optional[float] = None
    includeInMasterMix: Optional[bool] = True
    displayOrder: int = 0

class PcrPresetCreate(BaseModel):
    name: str
    category: Optional[str] = "User Created"
    primer_f: Optional[str] = None
    primer_r: Optional[str] = None
    product_size: Optional[int] = 0
    defaultReactionVolume: Optional[int] = 20
    allowedReactionVolumes: List[float] = []
    description: Optional[str] = ""
    isSystem: bool = False
    is_public: bool = False
    components: List[PcrComponent] = []

# --- Default Presets ---
DEFAULT_PRESETS = [
    {
        "name": "Standard Taq Protocol",
        "category": "System",
        "isSystem": True,
        "defaultReactionVolume": 25,
        "components": [
            {"name": "10 μM Forward Primer", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.2, "includeInMasterMix": True, "displayOrder": 1},
            {"name": "10 μM Reverse Primer", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.2, "includeInMasterMix": True, "displayOrder": 2},
            {"name": "Template DNA", "calculationMode": "fixed_volume", "fixedVolume": 1.0, "includeInMasterMix": False, "displayOrder": 3},
            {"name": "OneTaq 2X Master Mix with Standard Buffer", "calculationMode": "fixed_ratio", "ratioDenominator": 2, "includeInMasterMix": True, "displayOrder": 4},
            {"name": "Nuclease-Free Water", "calculationMode": "fill_to_reaction_volume", "includeInMasterMix": True, "displayOrder": 5}
        ]
    },
    {
        "name": "Q5 High-Fidelity Protocol",
        "category": "System",
        "isSystem": True,
        "defaultReactionVolume": 25,
        "components": [
            {"name": "5X Q5 Reaction Buffer", "calculationMode": "fixed_ratio", "ratioDenominator": 5, "includeInMasterMix": True, "displayOrder": 1},
            {"name": "10 mM dNTPs", "calculationMode": "fixed_volume", "fixedVolume": 0.5, "includeInMasterMix": True, "displayOrder": 2},
            {"name": "10 μM Forward Primer", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True, "displayOrder": 3},
            {"name": "10 μM Reverse Primer", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True, "displayOrder": 4},
            {"name": "Template DNA", "calculationMode": "fixed_volume", "fixedVolume": 1.0, "includeInMasterMix": False, "displayOrder": 5},
            {"name": "Q5 High-Fidelity DNA Polymerase", "calculationMode": "fixed_volume", "fixedVolume": 0.25, "includeInMasterMix": True, "displayOrder": 6},
            {"name": "5X Q5 High GC Enhancer (optional)", "calculationMode": "fixed_ratio", "ratioDenominator": 5, "isOptional": True, "includeInMasterMix": True, "displayOrder": 7},
            {"name": "Nuclease-Free Water", "calculationMode": "fill_to_reaction_volume", "includeInMasterMix": True, "displayOrder": 8}
        ]
    }
]

def ensure_system_presets(db: Session):
    changed = False
    for dp in DEFAULT_PRESETS:
        preset = db.query(PcrPreset).filter(
            PcrPreset.is_system == True,
            PcrPreset.name == dp["name"]
        ).first()
        if preset is None:
            db.add(PcrPreset(
                name=dp["name"], category=dp["category"], is_system=True,
                components_json=dp["components"], owner_user_id=None
            ))
            changed = True
        elif preset.category != dp["category"] or preset.components_json != dp["components"]:
            preset.category = dp["category"]
            preset.components_json = dp["components"]
            changed = True
    if changed:
        db.commit()

def preset_default_reaction_volume(preset: PcrPreset) -> int:
    hydrate_preset(preset)
    if getattr(preset, "file_default_reaction_volume", None) is not None:
        return int(preset.file_default_reaction_volume)
    for default in DEFAULT_PRESETS:
        if preset.is_system and preset.name == default["name"]:
            return default["defaultReactionVolume"]
    return 20

def preset_data(preset: PcrPreset, db: Session, current_user: dict):
    hydrate_preset(preset)
    shares = db.query(PcrPresetLabShare, Lab).join(Lab, PcrPresetLabShare.lab_id == Lab.id).filter(
        PcrPresetLabShare.preset_id == preset.id
    ).all()
    return {
        "id": str(preset.id), "owner_user_id": preset.owner_user_id,
        "title": preset.name, "name": preset.name, "category": preset.category,
        "is_system": preset.is_system, "isSystem": preset.is_system,
        "components": preset.components_json or [], "defaultReactionVolume": preset_default_reaction_volume(preset),
        "allowedReactionVolumes": getattr(preset, "file_allowed_reaction_volumes", []),
        "created_at": preset.created_at, "updated_at": preset.updated_at,
        "is_shared": bool(shares), "shared_with_labs": [share.Lab.lab_name for share in shares]
    }

def data_scope_presets(scope: str, db: Session, current_user: dict):
    ensure_system_presets(db)
    owner_id = current_user["id"]
    if scope == "shared":
        lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == owner_id).all()]
        if not lab_ids:
            return []
        presets = db.query(PcrPreset).join(PcrPresetLabShare).filter(
            PcrPresetLabShare.lab_id.in_(lab_ids), PcrPreset.owner_user_id != owner_id
        ).all()
    else:
        owned = db.query(PcrPreset).filter((PcrPreset.owner_user_id == owner_id) | (PcrPreset.is_system == True)).all()
        if scope == "my":
            presets = owned
        else:
            lab_ids = [row[0] for row in db.query(LabMember.lab_id).filter(LabMember.user_id == owner_id).all()]
            shared = db.query(PcrPreset).join(PcrPresetLabShare).filter(
                PcrPresetLabShare.lab_id.in_(lab_ids), PcrPreset.owner_user_id != owner_id
            ).all() if lab_ids else []
            presets = owned + shared
    seen = set()
    result = []
    for preset in sorted(presets, key=lambda item: (not item.is_system, item.created_at or 0)):
        if preset.id in seen:
            continue
        seen.add(preset.id)
        row = preset_data(preset, db, current_user)
        if preset.owner_user_id and preset.owner_user_id != owner_id:
            owner = db.query(User).filter(User.id == preset.owner_user_id).first()
            row["shared_by_name"] = owner.name if owner else None
        result.append(row)
    return result

@router.get("/data/{scope}")
async def list_data_presets(scope: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if scope not in ("all", "my", "shared"):
        raise HTTPException(status_code=404, detail="Unknown data scope")
    return data_scope_presets(scope, db, current_user)

@router.get("/data/{preset_id}/shares")
async def get_data_preset_shares(preset_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return [str(row.lab_id) for row in db.query(PcrPresetLabShare).filter(PcrPresetLabShare.preset_id == preset_id).all()]

@router.put("/data/{preset_id}/shares")
async def update_data_preset_shares(preset_id: str, payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    preset = db.query(PcrPreset).filter(PcrPreset.id == preset_id, PcrPreset.owner_user_id == current_user["id"], PcrPreset.is_system == False).first()
    if not preset:
        raise HTTPException(status_code=403, detail="Not authorized")
    db.query(PcrPresetLabShare).filter(PcrPresetLabShare.preset_id == preset.id).delete()
    for lab_id in payload.get("lab_ids", []):
        try:
            db.add(PcrPresetLabShare(preset_id=preset.id, lab_id=uuid.UUID(lab_id), shared_by_user_id=current_user["id"]))
        except (ValueError, TypeError):
            continue
    db.commit()
    return {"message": "Shares updated successfully"}

@router.post("", response_model=dict)
async def create_preset(
    preset_data: PcrPresetCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Saves a PCR preset to the LOCAL database."""
    new_preset = PcrPreset(
        owner_user_id=current_user["id"],
        name=preset_data.name,
        category=preset_data.category,
        primer_f=preset_data.primer_f,
        primer_r=preset_data.primer_r,
        product_size=preset_data.product_size,
        description=preset_data.description,
        components_json=[],
        is_public=preset_data.is_public,
        is_system=preset_data.isSystem
    )
    db.add(new_preset)
    db.flush()
    save_personal_preset_file(
        new_preset, current_user, [
            {**c.model_dump(), "isOptional": bool(c.isOptional), "includeInMasterMix": c.includeInMasterMix is not False}
            for c in preset_data.components
        ],
        preset_data.defaultReactionVolume or 20, preset_data.allowedReactionVolumes,
    )
    db.commit()
    db.refresh(new_preset)
    return {"id": str(new_preset.id), "name": new_preset.name}

@router.get("")
async def list_presets(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lists my presets, system presets, and incoming shared ones."""
    ensure_system_presets(db)
    # 1. Fetch system & user presets
    presets = db.query(PcrPreset).filter(
        (PcrPreset.owner_user_id == current_user["id"]) | 
        (PcrPreset.is_system == True) |
        (PcrPreset.is_public == True)
    ).order_by(PcrPreset.is_system.desc(), PcrPreset.created_at.desc()).all()
    
    # 2. Fetch incoming transfers
    transfers = db.query(PcrPresetTransfer).filter(
        PcrPresetTransfer.receiver_user_id == current_user["id"],
        PcrPresetTransfer.status == "pending"
    ).all()
    
    transfer_list = []
    for t in transfers:
        sender = db.query(User).filter(User.id == t.sender_user_id).first()
        preset = db.query(PcrPreset).filter(PcrPreset.id == t.preset_id).first()
        if preset:
            transfer_list.append({
                "id": str(t.id),
                "presetName": preset.name,
                "senderName": sender.name if sender else "Unknown",
                "createdAt": t.created_at
            })

    for preset in presets:
        hydrate_preset(preset)

    return {
        "presets": [
            {
                "id": str(p.id),
                "name": p.name,
                "category": p.category,
                "isSystem": p.is_system,
                "defaultReactionVolume": preset_default_reaction_volume(p),
                "components": p.components_json,
                "ownerUserId": p.owner_user_id,
                "isOwner": p.owner_user_id == current_user["id"]
            } for p in presets
        ],
        "transfers": transfer_list
    }

@router.delete("/{preset_id}")
async def delete_preset(
    preset_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    preset = db.query(PcrPreset).filter(
        PcrPreset.id == preset_id,
        PcrPreset.owner_user_id == current_user["id"]
    ).first()
    
    if not preset:
        raise HTTPException(status_code=403, detail="Not authorized to delete this preset")
    if preset.storage_path:
        resolve_data_path(preset.storage_path).unlink(missing_ok=True)
    db.delete(preset)
    db.commit()
    return {"message": "Preset deleted successfully"}

# --- Sharing / Transfers ---

class PcrTransferRequest(BaseModel):
    preset_id: str
    to_user_id: int

@router.post("/send")
async def send_preset(
    req: PcrTransferRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Verify ownership
    preset = db.query(PcrPreset).filter(
        PcrPreset.id == req.preset_id,
        PcrPreset.owner_user_id == current_user["id"]
    ).first()
    
    if not preset:
        raise HTTPException(status_code=403, detail="Not authorized to share this preset")
        
    transfer = PcrPresetTransfer(
        preset_id=uuid.UUID(req.preset_id),
        sender_user_id=current_user["id"],
        receiver_user_id=req.to_user_id,
        status="pending"
    )
    db.add(transfer)
    db.commit()
    return {"message": "Preset sent"}

@router.post("/transfers/{transfer_id}/accept")
async def accept_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    transfer = db.query(PcrPresetTransfer).filter(
        PcrPresetTransfer.id == transfer_id,
        PcrPresetTransfer.receiver_user_id == current_user["id"],
        PcrPresetTransfer.status == "pending"
    ).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found or already processed")
        
    # Copy the preset to the receiver's collection
    original = db.query(PcrPreset).filter(PcrPreset.id == transfer.preset_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original preset no longer exists")
        
    hydrate_preset(original)
    original_components = original.components_json or []
    new_preset = PcrPreset(
        owner_user_id=current_user["id"],
        name=f"{original.name} (Shared)",
        category="Shared",
        components_json=[],
        is_system=False,
        is_public=False
    )
    db.add(new_preset)
    db.flush()
    save_personal_preset_file(
        new_preset, current_user, original_components, preset_default_reaction_volume(original)
    )
    
    # Mark transfer as accepted
    transfer.status = "accepted"
    db.commit()
    return {"message": "Preset accepted"}

@router.post("/transfers/{transfer_id}/reject")
async def reject_transfer(
    transfer_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    transfer = db.query(PcrPresetTransfer).filter(
        PcrPresetTransfer.id == transfer_id,
        PcrPresetTransfer.receiver_user_id == current_user["id"]
    ).first()
    
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
        
    transfer.status = "rejected"
    db.commit()
    return {"message": "Transfer rejected"}
