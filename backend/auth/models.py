from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserResponse(BaseModel):
    id: int
    uid: Optional[str] = None
    auth_id: Optional[str] = None
    supabase_auth_id: Optional[str] = None # For frontend compatibility
    email: str
    name: Optional[str] = None
    role: str
    bio: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    profile_completed: bool = False

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None

class UserRegistration(BaseModel):
    email: EmailStr
    name: str
    bio: Optional[str] = None

class TokenPayload(BaseModel):
    sub: str # This is the supabase_auth_id
    email: str
    exp: int
