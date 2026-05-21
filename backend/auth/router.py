from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import User
from auth.dependencies import get_current_user, get_current_user_token
from auth.models import TokenPayload, UserResponse, UserUpdate, UserRegistration
from auth.user_manager import (
    update_user_name,
    update_user_profile,
    update_user_role,
    validate_email_domain,
    get_user_by_email,
    get_user_by_auth_id,
    create_user,
)
from auth.supabase_client import get_allowed_domain

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user profile from local DB."""
    return user

@router.patch("/me", response_model=UserResponse)
async def update_me(
    update: UserUpdate,
    user: dict = Depends(get_current_user),
):
    """Update current user profile fields in local DB."""
    user = update_user_profile(user["auth_id"], update.name, update.bio)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/check-user")
async def check_user(payload: dict):
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    user = get_user_by_email(email)
    return {
        "exists": user is not None and user.get("profile_completed", False)
    }

@router.get("/profile/{uid}", response_model=UserResponse)
async def get_profile_by_uid(uid: str, db: Session = Depends(get_db)):
    """Fetch profile info by u-number (uid) from local DB."""
    user = db.query(User).filter(User.uid == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "uid": user.uid,
        "auth_id": str(user.auth_id or user.supabase_auth_id) if (user.auth_id or user.supabase_auth_id) else None,
        "supabase_auth_id": str(user.supabase_auth_id or user.auth_id) if (user.supabase_auth_id or user.auth_id) else None,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "bio": user.bio,
        "profile_completed": user.profile_completed or (True if user.name else False),
        "created_at": user.created_at,
        "last_login": user.last_login
    }

@router.post("/register-profile", response_model=UserResponse)
async def register_profile(
    registration: UserRegistration,
    token: TokenPayload = Depends(get_current_user_token)
):
    """Register a new profile in the local DB."""
    if registration.email.lower() != token.email.lower():
        raise HTTPException(status_code=403, detail="Email mismatch")
    
    user = create_user(
        supabase_auth_id=token.sub,
        email=registration.email,
        name=registration.name,
        bio=registration.bio or ""
    )
    return user

@router.get("/validate-email")
async def validate_email(email: str):
    is_valid = validate_email_domain(email)
    return {
        "email": email,
        "allowed": is_valid,
        "required_domain": get_allowed_domain(),
    }

@router.get("/users", response_model=List[UserResponse])
async def list_users(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """List all users from local DB (for sharing)."""
    users = db.query(User).order_by(User.name).all()
    return [
        {
            "id": u.id,
            "uid": u.uid,
            "email": u.email,
            "name": u.name,
            "role": u.role
        } for u in users
    ]

@router.patch("/users/{uid}/role")
async def update_user_role_endpoint(
    uid: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Owner privileges required")
    
    new_role = payload.get("role")
    user = update_user_role(uid, new_role)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
