from pydantic import BaseModel, Field
from typing import Any, List, Optional
from uuid import UUID
from datetime import datetime


class ProtocolTreeCreate(BaseModel):
    title: str
    document_json: Any = Field(default_factory=dict)


class ProtocolTreeUpdate(BaseModel):
    title: Optional[str] = None
    document_json: Optional[Any] = None


class ProtocolTreeInDB(ProtocolTreeCreate):
    id: UUID
    owner_user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_shared: Optional[bool] = False
    shared_by_name: Optional[str] = None
    shared_with_labs: Optional[List[str]] = None
    share_access: Optional[str] = None
    can_edit: bool = False

    class Config:
        from_attributes = True
