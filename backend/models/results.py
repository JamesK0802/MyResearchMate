from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from uuid import UUID
from datetime import datetime

class CrisprResultBase(BaseModel):
    title: str
    metadata_json: Any = Field(default_factory=dict)
    result_json: Any = Field(default_factory=dict)

class CrisprResultCreate(CrisprResultBase):
    pass

class CrisprResultUpdate(BaseModel):
    title: Optional[str] = None
    metadata_json: Optional[Any] = None
    result_json: Optional[Any] = None

class CrisprResultInDB(CrisprResultBase):
    id: UUID
    owner_user_id: int  # Changed from UUID to int to match BIGINT
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Optional fields for shared context
    is_shared: Optional[bool] = False
    shared_by_name: Optional[str] = None
    lab_name: Optional[str] = None
    shared_with_labs: Optional[List[str]] = None

    class Config:
        from_attributes = True

class ResultShare(BaseModel):
    id: UUID
    result_id: UUID
    lab_id: str
    shared_by_user_id: int
    created_at: datetime

class ResultShareUpdate(BaseModel):
    lab_ids: List[str]
