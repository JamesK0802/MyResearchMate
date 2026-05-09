from typing import List, Dict, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth.dependencies import get_current_user
from auth.supabase_client import get_supabase_admin
import uuid

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────

class ComponentModel(BaseModel):
    id: Optional[str] = None
    name: str
    componentType: str
    calculationMode: str
    stockConcentration: Optional[float] = None
    stockUnit: Optional[str] = None
    finalConcentration: Optional[float] = None
    finalUnit: Optional[str] = None
    fixedVolume: Optional[float] = None
    volumePer25ul: Optional[float] = None
    ratioDenominator: Optional[float] = None
    includeInMasterMix: bool = True
    isOptional: bool = False
    displayOrder: int = 0

class PresetModel(BaseModel):
    id: Optional[str] = None
    name: str
    category: str
    source: Optional[str] = None
    description: Optional[str] = None
    defaultReactionVolume: float = 20.0
    allowedReactionVolumes: List[float] = []
    isSystem: bool = False
    ownerUserId: Optional[int] = None
    components: List[ComponentModel]

class PresetTransferRequest(BaseModel):
    to_user_id: int
    preset_id: str

# ─────────────────────────────────────────────────────────────────────────────
# Router
# ─────────────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/pcr-presets", tags=["pcr-presets"])

@router.get("")
async def list_presets(current_user: Optional[dict] = Depends(get_current_user)):
    """
    List all accessible presets: System ones + Personal ones + Pending Transfers
    """
    supabase = get_supabase_admin()
    user_id = current_user["id"] if current_user else None
    
    # 1. Fetch System Presets
    query = supabase.table("pcr_presets").select("*, pcr_preset_components(*)").eq("is_system", True)
    
    # 2. Add Personal Presets if logged in
    if user_id:
        # We can't easily do OR with composite select in PostgREST via simple call, 
        # so let's just fetch all where is_system=True OR owner_user_id=user_id
        res = supabase.table("pcr_presets").select("*, pcr_preset_components(*)").or_(f"is_system.eq.true,owner_user_id.eq.{user_id}").execute()
    else:
        res = query.execute()

    presets = res.data or []
    
    # 3. Fetch Pending Transfers if logged in
    transfers = []
    if user_id:
        trans_res = supabase.table("pcr_preset_transfers")\
            .select("*, users!from_user_id(name)")\
            .eq("to_user_id", user_id)\
            .execute()
        transfers = trans_res.data or []

    # Map to camelCase for frontend
    formatted_presets = []
    for p in presets:
        formatted_presets.append({
            "id": p["id"],
            "name": p["name"],
            "category": p["category"],
            "source": p["source"],
            "description": p["description"],
            "defaultReactionVolume": p["default_reaction_volume"],
            "allowedReactionVolumes": p["allowed_reaction_volumes"],
            "isSystem": p["is_system"],
            "ownerUserId": p["owner_user_id"],
            "components": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "componentType": c["component_type"],
                    "calculationMode": c["calculation_mode"],
                    "stockConcentration": c["stock_concentration"],
                    "stockUnit": c["stock_unit"],
                    "finalConcentration": c["final_concentration"],
                    "finalUnit": c["final_unit"],
                    "fixedVolume": c["fixed_volume"],
                    "volumePer25ul": c["volume_per_25ul"],
                    "ratioDenominator": c["ratio_denominator"],
                    "includeInMasterMix": c["include_in_master_mix"],
                    "isOptional": c["is_optional"],
                    "displayOrder": c["display_order"]
                } for c in p.get("pcr_preset_components", [])
            ]
        })

    return {
        "presets": formatted_presets,
        "transfers": transfers # Frontend will show these as "Incoming Presets"
    }

@router.post("")
async def create_preset(preset: PresetModel, current_user: dict = Depends(get_current_user)):
    """
    Save a new personal preset.
    """
    supabase = get_supabase_admin()
    user_id = current_user["id"]
    
    # 1. Insert Preset Header
    res = supabase.table("pcr_presets").insert({
        "name": preset.name,
        "category": preset.category,
        "source": preset.source,
        "description": preset.description,
        "default_reaction_volume": preset.defaultReactionVolume,
        "allowed_reaction_volumes": preset.allowedReactionVolumes,
        "is_system": False,
        "owner_user_id": user_id
    }).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create preset")
    
    preset_id = res.data[0]["id"]
    
    # 2. Insert Components
    components = []
    for i, c in enumerate(preset.components):
        components.append({
            "preset_id": preset_id,
            "name": c.name,
            "component_type": c.componentType,
            "calculation_mode": c.calculationMode,
            "stock_concentration": c.stockConcentration,
            "stock_unit": c.stockUnit,
            "final_concentration": c.finalConcentration,
            "final_unit": c.finalUnit,
            "fixed_volume": c.fixedVolume,
            "volume_per_25ul": c.volumePer25ul,
            "ratio_denominator": c.ratioDenominator,
            "include_in_master_mix": c.includeInMasterMix,
            "is_optional": c.isOptional,
            "display_order": i
        })
    
    supabase.table("pcr_preset_components").insert(components).execute()
    
    return {"id": preset_id, "status": "success"}

@router.delete("/{preset_id}")
async def delete_preset(preset_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    user_id = current_user["id"]
    
    # Verify ownership
    check = supabase.table("pcr_presets").select("owner_user_id, is_system").eq("id", preset_id).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Preset not found")
        
    if check.data[0]["is_system"]:
        raise HTTPException(status_code=403, detail="Cannot delete system presets")
        
    if check.data[0]["owner_user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this preset")
        
    supabase.table("pcr_presets").delete().eq("id", preset_id).execute()
    return {"status": "deleted"}

# ── Preset Transfers (Send to User) ───────────────────────────────────────────

@router.post("/send")
async def send_preset(req: PresetTransferRequest, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    from_user_id = current_user["id"]
    
    # 1. Fetch full preset data to copy it
    res = supabase.table("pcr_presets").select("*, pcr_preset_components(*)").eq("id", req.preset_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    preset = res.data[0]
    
    # 2. Create transfer record
    transfer_data = {
        "from_user_id": from_user_id,
        "to_user_id": req.to_user_id,
        "preset_name": preset["name"],
        "preset_data": preset # Full snapshot
    }
    
    supabase.table("pcr_preset_transfers").insert(transfer_data).execute()
    return {"status": "sent"}

@router.post("/transfers/{transfer_id}/accept")
async def accept_preset(transfer_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    user_id = current_user["id"]
    
    # 1. Get transfer
    res = supabase.table("pcr_preset_transfers").select("*").eq("id", transfer_id).eq("to_user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Transfer not found or not for you")
    
    transfer = res.data[0]
    p_data = transfer["preset_data"]
    
    # 2. Create new preset for the user (Copy)
    new_p = supabase.table("pcr_presets").insert({
        "name": p_data["name"] + " (Received)",
        "category": p_data["category"],
        "source": p_data["source"],
        "description": f"Received from user {transfer['from_user_id']}",
        "default_reaction_volume": p_data["default_reaction_volume"],
        "allowed_reaction_volumes": p_data["allowed_reaction_volumes"],
        "is_system": False,
        "owner_user_id": user_id
    }).execute()
    
    new_id = new_p.data[0]["id"]
    
    # 3. Create components
    comps = []
    for c in p_data.get("pcr_preset_components", []):
        comps.append({
            "preset_id": new_id,
            "name": c["name"],
            "component_type": c["component_type"],
            "calculation_mode": c["calculation_mode"],
            "stock_concentration": c["stock_concentration"],
            "stock_unit": c["stock_unit"],
            "final_concentration": c["final_concentration"],
            "final_unit": c["final_unit"],
            "fixed_volume": c["fixed_volume"],
            "volume_per_25ul": c["volume_per_25ul"],
            "ratio_denominator": c["ratio_denominator"],
            "include_in_master_mix": c["include_in_master_mix"],
            "is_optional": c["is_optional"],
            "display_order": c["display_order"]
        })
    
    if comps:
        supabase.table("pcr_preset_components").insert(comps).execute()
        
    # 4. Delete transfer
    supabase.table("pcr_preset_transfers").delete().eq("id", transfer_id).execute()
    
    return {"status": "accepted", "id": new_id}

@router.post("/transfers/{transfer_id}/reject")
async def reject_preset(transfer_id: str, current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    user_id = current_user["id"]
    
    # Delete transfer record
    supabase.table("pcr_preset_transfers").delete().eq("id", transfer_id).eq("to_user_id", user_id).execute()
    return {"status": "rejected"}
