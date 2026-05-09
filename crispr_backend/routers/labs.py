from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID
from auth.dependencies import get_current_user
from auth.supabase_client import get_supabase_admin
from models.labs import LabRegistrationCreate, LabRegistrationResponse, LabResponse, LabMemberResponse, LabJoinRequestCreate
import json

router = APIRouter(tags=["labs"])

# --- User Endpoints ---

@router.post("/lab-requests", response_model=LabRegistrationResponse)
async def create_lab_request(
    request: LabRegistrationCreate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    
    data = {
        "lab_name": request.lab_name,
        "lab_leader_name": request.lab_leader_name,
        "lab_leader_email": request.lab_leader_email,
        "lab_leader_uid": request.lab_leader_uid,
        "lab_tagline": request.lab_tagline,
        "lab_description": request.lab_description,
        "members_json": [m.dict() for m in request.members],
        "requested_by": current_user["id"],
        "status": "pending"
    }
    
    response = supabase.table("lab_registration_requests").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create lab request")
    
    return response.data[0]

@router.get("/lab-requests/my", response_model=List[LabRegistrationResponse])
async def get_my_lab_requests(
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    response = supabase.table("lab_registration_requests")\
        .select("*")\
        .eq("requested_by", current_user["id"])\
        .order("created_at", desc=True)\
        .execute()
    return response.data

@router.get("/labs/my", response_model=List[dict])
async def get_my_labs(
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # Get labs where user is a member (by uid)
    response = supabase.table("lab_members")\
        .select("role_in_lab, labs(*)")\
        .eq("uid", user_uid)\
        .execute()
        
    results = []
    if response.data:
        for row in response.data:
            if row.get("labs"):
                lab = row["labs"]
                lab["my_role"] = row["role_in_lab"]
                lab["is_leader"] = (lab.get("lab_leader_uid") == user_uid)
                results.append(lab)
        
    return results

@router.delete("/labs/{lab_id}")
async def delete_lab(
    lab_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # 1. Verify that user is the leader of this lab (by uid)
    check = supabase.table("labs").select("id").eq("id", str(lab_id)).eq("lab_leader_uid", user_uid).execute()
    if not check.data:
        raise HTTPException(status_code=403, detail="Only lab leaders can delete a lab")
        
    # 2. Delete lab
    supabase.table("labs").delete().eq("id", str(lab_id)).execute()
    
    return {"message": "Lab deleted successfully"}

# --- Admin Endpoints ---

def check_admin(user: dict):
    # Both owners and managers can access admin features
    if user.get("role") not in ["manager", "owner", "admin"]:
        raise HTTPException(status_code=403, detail="Admin or Manager privileges required")

def check_owner(user: dict):
    # Only owners can manage managers
    if user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")

@router.get("/admin/lab-requests", response_model=List[LabRegistrationResponse])
async def get_all_lab_requests(
    current_user: dict = Depends(get_current_user)
):
    check_admin(current_user)
    supabase = get_supabase_admin()
    response = supabase.table("lab_registration_requests")\
        .select("*")\
        .order("created_at", desc=True)\
        .execute()
    return response.data

@router.post("/admin/lab-requests/{request_id}/approve")
async def approve_lab_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_admin(current_user)
    supabase = get_supabase_admin()
    
    # 1. Fetch request
    req_res = supabase.table("lab_registration_requests").select("*").eq("id", request_id).execute()
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    
    req = req_res.data[0]
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request is already processed")
        
    # 2. Find leader user_id if they've registered (optional)
    leader_user_id = None
    leader_uid = req["lab_leader_uid"]
    user_lookup = supabase.table("users").select("id").eq("uid", leader_uid).execute()
    if user_lookup.data:
        leader_user_id = user_lookup.data[0]["id"]
    
    # 3. Create Lab (using uid as primary leader identifier)
    lab_data = {
        "lab_name": req["lab_name"],
        "lab_leader_user_id": leader_user_id,
        "lab_leader_uid": leader_uid,
        "lab_tagline": req.get("lab_tagline"),
        "lab_description": req.get("lab_description")
    }
    lab_res = supabase.table("labs").insert(lab_data).execute()
    if not lab_res.data:
        raise HTTPException(status_code=500, detail="Failed to create lab")
    
    lab_id = lab_res.data[0]["id"]
    
    # 4. Add Leader to Members (uid is the key)
    leader_member = {
        "lab_id": lab_id,
        "user_id": leader_user_id,
        "uid": leader_uid,
        "name": req["lab_leader_name"],
        "email": req["lab_leader_email"],
        "role_in_lab": "leader"
    }
    supabase.table("lab_members").insert(leader_member).execute()
    
    # 5. Add Team Members (uid is the key, user_id is optional)
    members = req.get("members_json", [])
    for m in members:
        m_user_id = None
        m_uid = m.get("uid", "")
        if m_uid:
            m_lookup = supabase.table("users").select("id").eq("uid", m_uid).execute()
            if m_lookup.data:
                m_user_id = m_lookup.data[0]["id"]
            
        supabase.table("lab_members").insert({
            "lab_id": lab_id,
            "user_id": m_user_id,
            "uid": m_uid,
            "name": m.get("name", ""),
            "email": m.get("email", ""),
            "role_in_lab": "member"
        }).execute()
        
    # 6. Update request status
    supabase.table("lab_registration_requests").update({
        "status": "approved",
        "approved_by": current_user["id"]
    }).eq("id", request_id).execute()
    
    return {"message": "Lab approved successfully", "lab_id": lab_id}

@router.post("/admin/lab-requests/{request_id}/reject")
async def reject_lab_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    check_admin(current_user)
    supabase = get_supabase_admin()
    
    supabase.table("lab_registration_requests").update({
        "status": "rejected",
        "approved_by": current_user["id"]
    }).eq("id", request_id).execute()
    
    return {"message": "Lab request rejected"}

# --- Public Lab Discovery & Joining ---

@router.get("/labs/all")
async def list_all_labs(
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    
    # Get all labs with some basic info
    response = supabase.table("labs").select("*").order("created_at", desc=True).execute()
    print(f"[Labs] Found {len(response.data)} approved labs in DB")
    return response.data

@router.post("/labs/{lab_id}/join")
async def request_to_join_lab(
    lab_id: UUID,
    join_data: LabJoinRequestCreate,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    internal_id = current_user["id"]
    
    print(f"[JoinRequest] User {user_uid} requesting to join lab {lab_id}")
    
    if not user_uid:
        raise HTTPException(status_code=400, detail="User UID missing. Please complete your profile.")
    
    # 1. Check if already a member (by uid)
    member_check = supabase.table("lab_members").select("id").eq("lab_id", str(lab_id)).eq("uid", user_uid).execute()
    if member_check.data:
        print(f"[JoinRequest] Already a member: {user_uid}")
        raise HTTPException(status_code=400, detail="You are already a member of this lab")
        
    # 2. Check if already requested
    request_check = supabase.table("lab_join_requests").select("id").eq("lab_id", str(lab_id)).eq("uid", user_uid).execute()
    if request_check.data:
        print(f"[JoinRequest] Already pending: {user_uid}")
        raise HTTPException(status_code=400, detail="Join request already pending or previously processed")
        
    # 3. Create request
    data = {
        "lab_id": str(lab_id),
        "user_id": internal_id,
        "uid": user_uid,
        "message": join_data.message,
        "status": "pending"
    }
    
    try:
        response = supabase.table("lab_join_requests").insert(data).execute()
        if not response.data:
            print(f"[JoinRequest] Insert failed: {response}")
            raise HTTPException(status_code=500, detail="Failed to create join request record")
        return response.data[0]
    except Exception as e:
        print(f"[JoinRequest] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/labs/join-requests/my")
async def get_my_join_requests(
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # Get my requests joined with lab info (by uid)
    response = supabase.table("lab_join_requests")\
        .select("*, labs(lab_name, lab_tagline)")\
        .eq("uid", user_uid)\
        .order("created_at", desc=True)\
        .execute()
    
    results = []
    for row in response.data:
        lab_info = row.get("labs", {})
        row["lab_name"] = lab_info.get("lab_name", "Unknown Lab")
        row["lab_tagline"] = lab_info.get("lab_tagline", "")
        results.append(row)
        
    return results

# --- Lab Leader Management of Join Requests ---

@router.get("/labs/{lab_id}/join-requests")
async def get_lab_join_requests(
    lab_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    print(f"[ManageRequests] User {user_uid} checking requests for lab {lab_id}")
    
    # 1. Verify leader (Check labs table OR lab_members table for robustness)
    is_leader = False
    
    # Try labs table first
    lab_check = supabase.table("labs").select("id").eq("id", str(lab_id)).eq("lab_leader_uid", user_uid).execute()
    if lab_check.data:
        is_leader = True
    else:
        # Fallback: check lab_members table
        member_check = supabase.table("lab_members").select("id").eq("lab_id", str(lab_id)).eq("uid", user_uid).eq("role_in_lab", "leader").execute()
        if member_check.data:
            is_leader = True

    if not is_leader:
        print(f"[ManageRequests] Permission denied: User {user_uid} is NOT leader of {lab_id}")
        raise HTTPException(status_code=403, detail="Only lab leaders can view join requests")
        
    # 2. Get pending requests
    response = supabase.table("lab_join_requests")\
        .select("*")\
        .eq("lab_id", str(lab_id))\
        .eq("status", "pending")\
        .order("created_at", desc=True)\
        .execute()
    
    print(f"[ManageRequests] Found {len(response.data)} pending requests for lab {lab_id}")
    return response.data

# --- Lab Member Management ---

@router.get("/labs/{lab_id}/members")
async def get_lab_members(
    lab_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # 1. Verify that current_user is a member of this lab (any role)
    check = supabase.table("lab_members").select("id").eq("lab_id", str(lab_id)).eq("uid", user_uid).execute()
    if not check.data:
        print(f"[Members] Access denied: User {user_uid} is NOT in lab {lab_id}")
        raise HTTPException(status_code=403, detail="You are not a member of this lab")
        
    # 2. Get all members
    response = supabase.table("lab_members").select("*").eq("lab_id", str(lab_id)).order("role_in_lab", desc=True).execute()
    print(f"[Members] Found {len(response.data)} members for lab {lab_id}")
    return response.data

@router.delete("/labs/{lab_id}/members/{target_uid}")
async def remove_lab_member(
    lab_id: UUID,
    target_uid: str,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    print(f"[RemoveMember] Leader {user_uid} removing {target_uid} from lab {lab_id}")
    
    # 1. Verify leader
    is_leader = False
    lab_check = supabase.table("labs").select("id").eq("id", str(lab_id)).eq("lab_leader_uid", user_uid).execute()
    if lab_check.data:
        is_leader = True
    else:
        member_check = supabase.table("lab_members").select("id").eq("lab_id", str(lab_id)).eq("uid", user_uid).eq("role_in_lab", "leader").execute()
        if member_check.data:
            is_leader = True

    if not is_leader:
        raise HTTPException(status_code=403, detail="Only lab leaders can remove members")
        
    if target_uid == user_uid:
        raise HTTPException(status_code=400, detail="Leaders cannot remove themselves")
        
    # 2. Delete member from lab_members
    sb = get_supabase_admin()
    sb.table("lab_members").delete().eq("lab_id", str(lab_id)).eq("uid", target_uid).execute()
    
    # 3. CRITICAL: Delete any existing join requests (approved/rejected) to allow re-application
    # First, we need the user_id or email to find the request. 
    # To be safe, we can try to find the request by lab_id and status associated with this member.
    # Since we don't have the internal 'user_id' easily here without a lookup, 
    # but we have the target_uid, let's just wipe all requests from that lab for safety 
    # (actually join_requests table has user_id, not uid usually, but let's see)
    
    # Let's find the user first to get their internal ID
    user_res = sb.table("users").select("id").eq("uid", target_uid).execute()
    if user_res.data:
        internal_user_id = user_res.data[0]["id"]
        print(f"[RemoveMember] Cleaning up join requests for user_id {internal_user_id}")
        sb.table("lab_join_requests").delete().eq("lab_id", str(lab_id)).eq("user_id", internal_user_id).execute()
        sb.table("lab_join_requests").delete().eq("lab_id", str(lab_id)).eq("user_id", internal_user_id).execute()
    
    return {"message": "Member removed and join requests cleared"}

@router.post("/labs/join-requests/{request_id}/approve")
async def approve_join_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    sb = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # 1. Fetch request
    req_res = sb.table("lab_join_requests").select("*").eq("id", request_id).execute()
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    req = req_res.data[0]
    
    # 2. Verify leader of the TARGET lab
    lab_id = req["lab_id"]
    check = sb.table("labs").select("id").eq("id", lab_id).eq("lab_leader_uid", user_uid).execute()
    if not check.data:
        # Fallback check for leader role in lab_members
        leader_check = sb.table("lab_members").select("id").eq("lab_id", lab_id).eq("uid", user_uid).eq("role_in_lab", "leader").execute()
        if not leader_check.data:
            raise HTTPException(status_code=403, detail="Only the lab leader can approve requests")
        
    # 3. Add to lab_members
    m_name = req.get("name") or "New Member"
    m_email = req.get("email") or ""
    applicant_uid = req.get("uid")
    
    # Refresh info from users table for accuracy
    if req.get("user_id"):
        u_lookup = sb.table("users").select("name, email, uid").eq("id", req["user_id"]).execute()
        if u_lookup.data:
            m_name = u_lookup.data[0]["name"]
            m_email = u_lookup.data[0]["email"]
            applicant_uid = u_lookup.data[0]["uid"]

    member_data = {
        "lab_id": lab_id,
        "user_id": req.get("user_id"),
        "uid": applicant_uid,
        "name": m_name,
        "email": m_email,
        "role_in_lab": "member"
    }
    
    insert_res = sb.table("lab_members").insert(member_data).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to add member to lab")
        
    # 4. SUCCESS: Delete the join request record entirely (no need to keep approved records)
    sb.table("lab_join_requests").delete().eq("id", request_id).execute()
    
    print(f"[JoinRequest] Request {request_id} approved and record deleted. Member added.")
    return {"message": "Request approved and member added successfully"}

@router.post("/labs/join-requests/{request_id}/reject")
async def reject_join_request(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    supabase = get_supabase_admin()
    user_uid = current_user.get("uid", "")
    
    # 1. Get request
    req_res = supabase.table("lab_join_requests").select("*").eq("id", request_id).execute()
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    request = req_res.data[0]
    
    # 2. Verify leader
    is_leader = False
    lab_check = supabase.table("labs").select("id").eq("id", request["lab_id"]).eq("lab_leader_uid", user_uid).execute()
    if lab_check.data:
        is_leader = True
    else:
        member_check = supabase.table("lab_members").select("id").eq("lab_id", request["lab_id"]).eq("uid", user_uid).eq("role_in_lab", "leader").execute()
        if member_check.data:
            is_leader = True

    if not is_leader:
        raise HTTPException(status_code=403, detail="Only lab leaders can reject requests")
        
    # 3. Delete the request record (allow re-application later)
    supabase.table("lab_join_requests").delete().eq("id", request_id).execute()
    
    print(f"[JoinRequest] Request {request_id} rejected and record deleted.")
    return {"message": "Request rejected and record cleared"}
