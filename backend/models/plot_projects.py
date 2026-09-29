from datetime import datetime
from typing import Any, Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


class PlotProjectCreate(BaseModel):
    title: str
    project_json: Any = Field(default_factory=dict)


class PlotProjectUpdate(BaseModel):
    title: Optional[str] = None
    project_json: Optional[Any] = None


class PlotProjectInDB(PlotProjectCreate):
    id: UUID
    owner_user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_shared: bool = False
    shared_by_name: Optional[str] = None
    shared_with_labs: List[str] = Field(default_factory=list)
    share_access: Optional[str] = None
    can_edit: bool = False

    class Config:
        from_attributes = True
