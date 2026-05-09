"""
Authentication API endpoints.
Mounted under /api/auth/ in the main application.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from auth.dependencies import get_current_user, get_current_user_token, require_admin
from auth.models import TokenPayload, UserResponse, UserUpdate, UserRole, UserRegistration
from auth.user_manager import (
    update_user_name,
    update_user_bio,
    update_user_role,
    validate_email_domain,
    get_user_by_auth_id,
    get_user_by_email,
    create_user,
)
from auth.supabase_client import get_allowed_domain, get_supabase_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """
    Get the current authenticated user's profile.
    Requires a completed profile (enforced by get_current_user).
    """
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    update: UserUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the current user's profile fields."""
    if update.name is not None:
        user = update_user_name(user["supabase_auth_id"], update.name)
    if update.bio is not None:
        user = update_user_bio(user["supabase_auth_id"], update.bio)
    return user


@router.post("/check-user")
async def check_user(payload: dict):
    """
    Check if a user with the given email exists and has a completed profile.
    Public endpoint.
    """
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    user = get_user_by_email(email)
    return {
        "exists": user is not None and user.get("profile_completed", False)
    }


@router.get("/profile/{uid}", response_model=UserResponse)
async def get_profile_by_uid(uid: str):
    """
    Fetch a user's basic profile info by their UID.
    Used for auto-filling names in forms.
    """
    sb = get_supabase_admin()
    result = sb.table("users").select("*").eq("uid", uid).execute()
    
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return result.data[0]


@router.post("/register-profile", response_model=UserResponse)
async def register_profile(
    registration: UserRegistration,
    token: TokenPayload = Depends(get_current_user_token)
):
    """
    Register a new user profile.
    """
    print(f"[Register] Attempting registration for: {registration.email}")
    print(f"[Register] Token Email: {token.email}")
    print(f"[Register] Token Sub (Auth ID): {token.sub}")

    # 1. Security: Check if email matches token
    if registration.email.lower() != token.email.lower():
        print(f"[Register] Email mismatch! {registration.email} != {token.email}")
        raise HTTPException(
            status_code=403, 
            detail=f"Registration email ({registration.email}) must match session email ({token.email})"
        )
    
    # 2. Check if already exists
    existing = get_user_by_auth_id(token.sub)
    if existing and existing.get("profile_completed"):
        print(f"[Register] User already fully registered: {token.sub}")
        raise HTTPException(
            status_code=400,
            detail="User already registered"
        )
    
    # 3. Create profile
    try:
        print(f"[Register] Creating/Updating user record...")
        user = create_user(
            supabase_auth_id=token.sub,
            email=registration.email,
            name=registration.name,
            bio=registration.bio
        )
        print(f"[Register] Registration SUCCESS for {registration.email}")
        return user
    except Exception as e:
        print(f"[Register] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/validate-email")
async def validate_email(email: str):
    """
    Check if an email address is allowed to register.
    Used by the frontend before initiating OAuth.
    """
    is_valid = validate_email_domain(email)
    return {
        "email": email,
        "allowed": is_valid,
        "required_domain": get_allowed_domain(),
    }


@router.post("/verify-session")
async def verify_session(token: TokenPayload = Depends(get_current_user_token)):
    """
    Verify that the current session token is still valid.
    """
    return {
        "valid": True,
        "user_id": token.sub,
        "email": token.email,
    }


# --- Manager Management (Owner Only) ---

def check_owner(user: dict):
    if user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")

@router.get("/users", response_model=List[UserResponse])
async def list_users(current_user: dict = Depends(get_current_user)):
    """List all users (accessible by all authenticated researchers for sharing)."""
    # check_owner(current_user)  <- Removed to allow sharing features for all researchers
    sb = get_supabase_admin()
    result = sb.table("users").select("*").order("name").execute()
    return result.data

@router.patch("/users/{uid}/role")
async def update_user_role_endpoint(
    uid: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a user's role (promote to manager, revoke, etc)."""
    check_owner(current_user)
    new_role = payload.get("role")
    if new_role not in ["user", "manager", "owner", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    user = update_user_role(uid, new_role)
    return user
