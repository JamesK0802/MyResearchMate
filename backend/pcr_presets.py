from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from auth.dependencies import get_current_user
from database.db import get_db
from database.models import PcrPreset, User, PcrPresetTransfer
from pydantic import BaseModel
import uuid

router = APIRouter(prefix="/pcr-presets", tags=["pcr"])

class PcrComponent(BaseModel):
    name: str
    calculationMode: str
    isOptional: bool = False
    stockConcentration: Optional[float] = None
    stockUnit: Optional[str] = None
    finalConcentration: Optional[float] = None
    finalUnit: Optional[str] = None
    ratioDenominator: Optional[float] = None
    fixedVolume: Optional[float] = None
    includeInMasterMix: bool = True
    displayOrder: int = 0

class PcrPresetCreate(BaseModel):
    name: str
    category: Optional[str] = "User Created"
    primer_f: Optional[str] = None
    primer_r: Optional[str] = None
    product_size: Optional[int] = 0
    defaultReactionVolume: Optional[int] = 20
    isSystem: bool = False
    is_public: bool = False
    components: List[PcrComponent] = []

# --- Default Presets ---
DEFAULT_PRESETS = [
    {
        "name": "Standard Taq Protocol",
        "category": "System",
        "isSystem": True,
        "defaultReactionVolume": 20,
        "components": [
            {"name": "10X Taq Buffer", "calculationMode": "fixed_ratio", "ratioDenominator": 10, "includeInMasterMix": True},
            {"name": "dNTPs (10mM)", "calculationMode": "fixed_volume", "fixedVolume": 0.4, "includeInMasterMix": True},
            {"name": "Forward Primer (10uM)", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True},
            {"name": "Reverse Primer (10uM)", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True},
            {"name": "Taq Polymerase", "calculationMode": "fixed_volume", "fixedVolume": 0.2, "includeInMasterMix": True},
            {"name": "Template DNA", "calculationMode": "fixed_volume", "fixedVolume": 1.0, "includeInMasterMix": False},
            {"name": "Nuclease-Free Water", "calculationMode": "fill_to_reaction_volume", "includeInMasterMix": True}
        ]
    },
    {
        "name": "Q5 High-Fidelity Protocol",
        "category": "System",
        "isSystem": True,
        "defaultReactionVolume": 25,
        "components": [
            {"name": "5X Q5 Buffer", "calculationMode": "fixed_ratio", "ratioDenominator": 5, "includeInMasterMix": True},
            {"name": "dNTPs (10mM)", "calculationMode": "fixed_volume", "fixedVolume": 0.5, "includeInMasterMix": True},
            {"name": "Forward Primer (10uM)", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True},
            {"name": "Reverse Primer (10uM)", "calculationMode": "primer_concentration", "stockConcentration": 10, "finalConcentration": 0.5, "includeInMasterMix": True},
            {"name": "Q5 Polymerase", "calculationMode": "fixed_volume", "fixedVolume": 0.25, "includeInMasterMix": True},
            {"name": "Template DNA", "calculationMode": "fixed_volume", "fixedVolume": 1.0, "includeInMasterMix": False},
            {"name": "Nuclease-Free Water", "calculationMode": "fill_to_reaction_volume", "includeInMasterMix": True}
        ]
    }
]

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
        components_json=[c.dict() for c in preset_data.components],
        is_public=preset_data.is_public,
        is_system=preset_data.isSystem
    )
    db.add(new_preset)
    db.commit()
    db.refresh(new_preset)
    return {"id": str(new_preset.id), "name": new_preset.name}

@router.get("")
async def list_presets(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Lists my presets, system presets, and incoming shared ones."""
    # DEBUG
    print(f"[DEBUG] PcrPreset attributes: {dir(PcrPreset)}")
    # 1. Fetch system & user presets
    presets = db.query(PcrPreset).filter(
        (PcrPreset.owner_user_id == current_user["id"]) | 
        (PcrPreset.is_system == True) |
        (PcrPreset.is_public == True)
    ).order_by(PcrPreset.is_system.desc(), PcrPreset.created_at.desc()).all()
    
    # 2. If no system presets exist, inject defaults for this session (or better, save them)
    if not any(p.is_system for p in presets):
        for dp in DEFAULT_PRESETS:
            db_dp = PcrPreset(
                name=dp["name"],
                category=dp["category"],
                is_system=True,
                components_json=dp["components"],
                owner_user_id=None # System owned
            )
            db.add(db_dp)
        db.commit()
        # Re-fetch
        presets = db.query(PcrPreset).filter(
            (PcrPreset.owner_user_id == current_user["id"]) | 
            (PcrPreset.is_system == True)
        ).all()

    # 3. Fetch incoming transfers
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

    return {
        "presets": [
            {
                "id": str(p.id),
                "name": p.name,
                "category": p.category,
                "isSystem": p.is_system,
                "defaultReactionVolume": 20, 
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
        
    new_preset = PcrPreset(
        owner_user_id=current_user["id"],
        name=f"{original.name} (Shared)",
        category="Shared",
        components_json=original.components_json,
        is_system=False,
        is_public=False
    )
    db.add(new_preset)
    
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
