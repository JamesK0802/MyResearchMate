from sqlalchemy.orm import Session
from database.db import SessionLocal
from database.models import User
from uuid import UUID
from datetime import datetime

def get_user_by_auth_id(auth_id_str: str):
    db = SessionLocal()
    try:
        auth_uuid = UUID(auth_id_str)
        # Check both columns for compatibility
        user = db.query(User).filter(
            (User.auth_id == auth_uuid) | (User.supabase_auth_id == auth_uuid)
        ).first()
        if user:
            return {
                "id": user.id,
                "auth_id": str(user.auth_id or user.supabase_auth_id),
                "supabase_auth_id": str(user.supabase_auth_id or user.auth_id),
                "uid": user.uid,
                "email": user.email,
                "name": user.name,
                "role": user.role,
                "bio": user.bio,
                "profile_completed": user.profile_completed or (True if user.name else False),
                "created_at": user.created_at,
                "last_login": user.last_login
            }
        return None
    finally:
        db.close()

def get_user_by_email(email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if user:
            return {
                "id": user.id, 
                "email": user.email, 
                "profile_completed": user.profile_completed or (True if user.name else False)
            }
        return None
    finally:
        db.close()

def create_user(supabase_auth_id: str, email: str, name: str, uid: str = None, bio: str = ""):
    db = SessionLocal()
    try:
        auth_uuid = UUID(supabase_auth_id)
        user = db.query(User).filter(
            (User.auth_id == auth_uuid) | (User.supabase_auth_id == auth_uuid)
        ).first()
        
        derived_uid = uid or email.split("@")[0]
        
        if not user:
            # Automatic Owner promotion for the primary researcher
            role = "owner" if email.lower() == "u6646386@anu.edu.au" else "user"
            
            user = User(
                supabase_auth_id=auth_uuid,
                auth_id=auth_uuid,
                email=email.lower(),
                name=name,
                uid=derived_uid,
                role=role,
                bio=bio,
                profile_completed=True,
                last_login=datetime.now()
            )
            db.add(user)
        else:
            user.name = name
            user.bio = bio
            user.profile_completed = True
            user.last_login = datetime.now()
            if not user.uid: user.uid = derived_uid
            if not user.supabase_auth_id: user.supabase_auth_id = auth_uuid
            if not user.auth_id: user.auth_id = auth_uuid
        
        db.commit()
        db.refresh(user)
        return {
            "id": user.id,
            "uid": user.uid,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "bio": user.bio,
            "profile_completed": user.profile_completed
        }
    finally:
        db.close()

def update_user_name(auth_id_str: str, name: str):
    db = SessionLocal()
    try:
        auth_uuid = UUID(auth_id_str)
        user = db.query(User).filter(
            (User.auth_id == auth_uuid) | (User.supabase_auth_id == auth_uuid)
        ).first()
        if user:
            user.name = name
            db.commit()
            db.refresh(user)
            return {"id": user.id, "name": user.name, "email": user.email, "uid": user.uid}
        return None
    finally:
        db.close()

def update_user_role(uid_str: str, new_role: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.uid == uid_str).first()
        if user:
            user.role = new_role
            db.commit()
            return {"uid": user.uid, "role": user.role}
        return None
    finally:
        db.close()

def validate_email_domain(email: str):
    from auth.supabase_client import get_allowed_domain
    allowed = get_allowed_domain()
    if not allowed: return True
    return email.lower().endswith(f"@{allowed}")

def update_user_profile(auth_id_str: str, name: str = None, bio: str = None):
    db = SessionLocal()
    try:
        auth_uuid = UUID(auth_id_str)
        user = db.query(User).filter(
            (User.auth_id == auth_uuid) | (User.supabase_auth_id == auth_uuid)
        ).first()
        if user:
            if name is not None: user.name = name
            if bio is not None: user.bio = bio
            db.commit()
            db.refresh(user)
            return user
        return None
    finally:
        db.close()
