from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime

class LabMemberInfo(BaseModel):
    uid: str
    name: Optional[str] = None
    email: EmailStr

class LabRegistrationCreate(BaseModel):
    lab_name: str
    lab_leader_name: Optional[str] = None
    lab_leader_email: EmailStr
    lab_leader_uid: str
    lab_tagline: Optional[str] = None
    lab_description: Optional[str] = None
    members: List[LabMemberInfo] = Field(default_factory=list)

class LabRegistrationResponse(BaseModel):
    id: UUID
    lab_name: str
    lab_leader_name: str
    lab_leader_email: str
    lab_leader_uid: str
    members_json: Any
    lab_tagline: Optional[str] = None
    lab_description: Optional[str] = None
    status: str
    requested_by: int
    approved_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class LabResponse(BaseModel):
    id: UUID
    lab_name: str
    lab_leader_user_id: int
    lab_tagline: Optional[str] = None
    lab_description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class LabMemberResponse(BaseModel):
    id: UUID
    lab_id: UUID
    user_id: Optional[int] = None
    uid: str
    name: str
    email: str
    role_in_lab: str
    created_at: datetime

    class Config:
        from_attributes = True

class LabJoinRequestCreate(BaseModel):
    message: Optional[str] = None

class LabJoinRequestResponse(BaseModel):
    id: UUID
    lab_id: UUID
    user_id: int
    status: str
    message: Optional[str] = None
    created_at: datetime
    lab_name: Optional[str] = None # For UI convenience

    class Config:
        from_attributes = True
