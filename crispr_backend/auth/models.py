"""
Pydantic models for the user and authentication system.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum
from datetime import datetime


class UserRole(str, Enum):
    """Allowed user roles in the system."""
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class UserBase(BaseModel):
    """Base user schema shared across request/response models."""
    email: str
    uid: Optional[str] = None
    name: Optional[str] = None
    bio: Optional[str] = None
    role: UserRole = UserRole.USER
    profile_completed: bool = False


class UserCreate(UserBase):
    """Schema for creating a user (internal use)."""
    supabase_auth_id: str


class UserRegistration(BaseModel):
    """Schema for user profile registration."""
    email: EmailStr
    name: str
    bio: Optional[str] = None


class UserResponse(UserBase):
    """Schema returned by API endpoints."""
    id: int
    supabase_auth_id: str
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Schema for updating user profile fields."""
    name: Optional[str] = None
    bio: Optional[str] = None


class TokenPayload(BaseModel):
    """Decoded JWT token payload from Supabase."""
    sub: str          # supabase user id
    email: str
    exp: int
    aud: Optional[str] = None
