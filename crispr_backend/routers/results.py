from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID
from auth.dependencies import get_current_user
from models.results import CrisprResultCreate, CrisprResultUpdate, CrisprResultInDB, ResultShareUpdate
from auth.supabase_client import get_supabase_admin


router = APIRouter(prefix="/crispr-results", tags=["results"])

@router.post("", response_model=CrisprResultInDB)
async def create_result(
    result_data: CrisprResultCreate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    data = result_data.model_dump()
    data["owner_user_id"] = internal_id

    response = supabase.table("crispr_results").insert(data).execute()
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save result")
        
    return response.data[0]

@router.get("/my", response_model=List[CrisprResultInDB])
@router.get("", response_model=List[CrisprResultInDB])
async def list_my_results(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # 1. Get my results
    response = supabase.table("crispr_results") \
        .select("*") \
        .eq("owner_user_id", internal_id) \
        .order("created_at", desc=True) \
        .execute()
    
    results = response.data
    
    # 2. Get sharing details (which labs)
    if results:
        res_ids = [r["id"] for r in results]
        # Join with labs to get names
        shares = supabase.table("crispr_result_shares")\
            .select("result_id, labs(lab_name)")\
            .in_("result_id", res_ids)\
            .execute()
            
        # Group lab names by result_id
        sharing_map = {}
        for s in shares.data:
            rid = s["result_id"]
            if not s.get("labs"): continue
            lname = s["labs"]["lab_name"]
            if rid not in sharing_map: sharing_map[rid] = []
            sharing_map[rid].append(lname)
            
        for r in results:
            labs = sharing_map.get(r["id"], [])
            r["is_shared"] = len(labs) > 0
            r["shared_with_labs"] = labs if labs else None
            
    return results

@router.get("/shared", response_model=List[CrisprResultInDB])
async def list_shared_results(current_user: dict = Depends(get_current_user)):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # 1. Get lab IDs the user belongs to (by uid)
    user_uid = current_user.get("uid", "")
    my_labs = supabase.table("lab_members").select("lab_id").eq("uid", user_uid).execute()
    lab_ids = [row["lab_id"] for row in my_labs.data]
    
    if not lab_ids:
        return []

    # 2. Get shared results
    response = supabase.table("crispr_result_shares") \
        .select("*, crispr_results(*), users!shared_by_user_id(name), labs(lab_name)") \
        .in_("lab_id", lab_ids) \
        .neq("shared_by_user_id", internal_id) \
        .execute()
    
    # 3. Group by result_id to collect ALL lab names
    grouped_results = {}
    for row in response.data:
        res_data = row["crispr_results"]
        if not res_data: continue
        rid = res_data["id"]
        
        if rid not in grouped_results:
            res_data["is_shared"] = True
            res_data["shared_by_name"] = row.get("users", {}).get("name")
            res_data["shared_with_labs"] = []
            grouped_results[rid] = res_data
            
        lname = row.get("labs", {}).get("lab_name")
        if lname and lname not in grouped_results[rid]["shared_with_labs"]:
            grouped_results[rid]["shared_with_labs"].append(lname)
            
    # For backward compatibility, also keep a single 'lab_name'
    for res in grouped_results.values():
        if res["shared_with_labs"]:
            res["lab_name"] = res["shared_with_labs"][0]

    return list(grouped_results.values())

@router.get("/all", response_model=List[CrisprResultInDB])
async def list_all_results(current_user: dict = Depends(get_current_user)):
    my = await list_my_results(current_user)
    shared = await list_shared_results(current_user)
    return my + shared

@router.get("/{result_id}", response_model=CrisprResultInDB)
async def get_result(
    result_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # Try owner first
    response = supabase.table("crispr_results").select("*").eq("id", str(result_id)).eq("owner_user_id", internal_id).execute()
    
    if response.data:
        return response.data[0]
        
    # Check if shared with user (by uid)
    user_uid = current_user.get("uid", "")
    my_labs = supabase.table("lab_members").select("lab_id").eq("uid", user_uid).execute()
    lab_ids = [row["lab_id"] for row in my_labs.data]
    
    if lab_ids:
        shared = supabase.table("crispr_result_shares") \
            .select("*, crispr_results(*), users!shared_by_user_id(name), labs(lab_name)") \
            .eq("result_id", str(result_id)) \
            .in_("lab_id", lab_ids) \
            .execute()
            
        if shared.data:
            # Group all lab names
            res_data = shared.data[0]["crispr_results"]
            res_data["is_shared"] = True
            res_data["shared_by_name"] = shared.data[0]["users"]["name"]
            
            all_labs = []
            for row in shared.data:
                lname = row.get("labs", {}).get("lab_name")
                if lname and lname not in all_labs:
                    all_labs.append(lname)
            
            res_data["shared_with_labs"] = all_labs
            res_data["lab_name"] = all_labs[0] if all_labs else "Unknown Lab"
            return res_data
            
    raise HTTPException(status_code=404, detail="Result not found or access denied")

@router.put("/{result_id}", response_model=CrisprResultInDB)
async def update_result(
    result_id: UUID,
    update_data: CrisprResultUpdate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # Check ownership
    check = supabase.table("crispr_results").select("id").eq("id", str(result_id)).eq("owner_user_id", internal_id).execute()
    if not check.data:
        raise HTTPException(status_code=403, detail="Not authorized to edit this result")

    data = update_data.model_dump(exclude_unset=True)
    response = supabase.table("crispr_results").update(data).eq("id", str(result_id)).execute()
    
    return response.data[0]

@router.delete("/{result_id}")
async def delete_result(
    result_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    response = supabase.table("crispr_results").delete().eq("id", str(result_id)).eq("owner_user_id", internal_id).execute()
    
    if not response.data:
        raise HTTPException(status_code=403, detail="Not authorized to delete this result")
        
    return {"message": "Result deleted successfully"}

# --- Sharing Management ---

@router.get("/{result_id}/shares")
async def get_result_shares(
    result_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # Verify ownership
    check = supabase.table("crispr_results").select("id").eq("id", str(result_id)).eq("owner_user_id", internal_id).execute()
    if not check.data:
        raise HTTPException(status_code=403, detail="Only owners can view sharing settings")
        
    shares = supabase.table("crispr_result_shares").select("lab_id").eq("result_id", str(result_id)).execute()
    return [s["lab_id"] for s in shares.data]

@router.put("/{result_id}/shares")
async def update_result_shares(
    result_id: UUID,
    share_data: ResultShareUpdate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    print(f"[Results] Updating shares for result {result_id} by user {internal_id}")
    
    # 1. Validate ownership
    res = supabase.table("crispr_results").select("owner_user_id").eq("id", str(result_id)).execute()
    if not res.data:
        print(f"[Results] Result {result_id} not found")
        raise HTTPException(status_code=404, detail="Result not found")
        
    owner_id = res.data[0]["owner_user_id"]
    print(f"[Results] Owner: {owner_id} (type: {type(owner_id)}), Current User: {internal_id} (type: {type(internal_id)})")
    
    if owner_id != internal_id:
        print(f"[Results] Ownership mismatch: {owner_id} != {internal_id}")
        raise HTTPException(status_code=403, detail="Only owner can manage shares")
        
    # 2. Validate lab IDs (must be a member)
    my_labs = supabase.table("lab_members").select("lab_id").eq("user_id", internal_id).execute()
    my_lab_ids = {row["lab_id"] for row in my_labs.data}
    print(f"[Results] User labs: {my_lab_ids}")
    
    for lid in share_data.lab_ids:
        if lid not in my_lab_ids:
            print(f"[Results] Lab membership validation failed for lab: {lid}")
            raise HTTPException(status_code=400, detail=f"You are not a member of lab {lid}")

    # 3. Update shares
    # Simple strategy: delete all current and insert new
    print(f"[Results] Deleting existing shares for {result_id}")
    supabase.table("crispr_result_shares").delete().eq("result_id", str(result_id)).execute()
    
    if share_data.lab_ids:
        new_shares = [
            {
                "result_id": str(result_id),
                "lab_id": lid,
                "shared_by_user_id": internal_id
            }
            for lid in share_data.lab_ids
        ]
        print(f"[Results] Inserting {len(new_shares)} new shares")
        ins_res = supabase.table("crispr_result_shares").insert(new_shares).execute()
        if not ins_res.data:
            print(f"[Results] Insert failed: {ins_res}")
            raise HTTPException(status_code=500, detail="Failed to insert shares")
    
    print(f"[Results] Successfully updated shares for {result_id}")
    return {"status": "success", "shared_labs": len(share_data.lab_ids)}

@router.delete("/{result_id}/shares/{lab_id}")
async def remove_result_share(
    result_id: UUID,
    lab_id: int,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    internal_id = current_user["id"]
    
    # Verify ownership
    check = supabase.table("crispr_results").select("id").eq("id", str(result_id)).eq("owner_user_id", internal_id).execute()
    if not check.data:
        raise HTTPException(status_code=403, detail="Only owners can remove sharing")
        
    supabase.table("crispr_result_shares").delete() \
        .eq("result_id", str(result_id)) \
        .eq("lab_id", lab_id) \
        .execute()
        
    return {"message": "Share removed"}
