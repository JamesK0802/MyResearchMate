from sqlalchemy import Column, String, BigInteger, Boolean, DateTime, ForeignKey, JSON, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from .db import Base
import uuid

class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, index=True)
    supabase_auth_id = Column(UUID(as_uuid=True), unique=True, index=True)
    auth_id = Column(UUID(as_uuid=True), unique=True) # Alias
    email = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String, default="user")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))
    uid = Column(String, unique=True, index=True)
    bio = Column(Text)
    profile_completed = Column(Boolean, default=False)

class ToolLink(Base):
    __tablename__ = "tool_links"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    description = Column(Text, default="")
    thumbnail_url = Column(Text, nullable=True)
    created_by = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ToolLinkHeart(Base):
    __tablename__ = "tool_link_hearts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tool_link_id = Column(UUID(as_uuid=True), ForeignKey("tool_links.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

class Lab(Base):
    __tablename__ = "labs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_name = Column(String, unique=True, index=True)
    lab_leader_user_id = Column(BigInteger, ForeignKey("users.id"))
    lab_leader_uid = Column(String)
    lab_tagline = Column(String)
    lab_description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deletion_requested_at = Column(DateTime(timezone=True), nullable=True)
    archive_deletion_at = Column(DateTime(timezone=True), nullable=True)

class LabMember(Base):
    __tablename__ = "lab_members"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id", ondelete="CASCADE"))
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    uid = Column(String)
    name = Column(String)
    email = Column(String)
    role_in_lab = Column(String, default="member")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class StorageQuota(Base):
    __tablename__ = "storage_quotas"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope = Column(String, nullable=False)  # personal | lab
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id", ondelete="CASCADE"), nullable=True, index=True)
    quota_bytes = Column(BigInteger, nullable=False)
    updated_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class StorageQuotaRequest(Base):
    __tablename__ = "storage_quota_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope = Column(String, nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id", ondelete="CASCADE"), nullable=True, index=True)
    requested_bytes = Column(BigInteger, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending")
    reviewed_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    approved_bytes = Column(BigInteger, nullable=True)
    review_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

class LabRegistrationRequest(Base):
    __tablename__ = "lab_registration_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_name = Column(String, index=True)
    lab_leader_name = Column(String)
    lab_leader_email = Column(String)
    lab_leader_uid = Column(String)
    lab_tagline = Column(String)
    lab_description = Column(Text)
    members_json = Column(JSON)
    status = Column(String, default="pending")
    requested_by = Column(BigInteger, ForeignKey("users.id"))
    approved_by = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class LabJoinRequest(Base):
    __tablename__ = "lab_join_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    user_id = Column(BigInteger, ForeignKey("users.id"))
    uid = Column(String)
    status = Column(String, default="pending")
    message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class CrisprResult(Base):
    __tablename__ = "crispr_results"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"))
    title = Column(String)
    metadata_json = Column(JSON)
    result_json = Column(JSON)
    storage_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class CrisprResultShare(Base):
    __tablename__ = "crispr_result_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    result_id = Column(UUID(as_uuid=True), ForeignKey("crispr_results.id", ondelete="CASCADE"))
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ProtocolTree(Base):
    __tablename__ = "protocol_trees"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"))
    title = Column(String)
    document_json = Column(JSON)
    storage_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ProtocolTreeShare(Base):
    __tablename__ = "protocol_tree_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    protocol_tree_id = Column(UUID(as_uuid=True), ForeignKey("protocol_trees.id", ondelete="CASCADE"))
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class PlotProject(Base):
    __tablename__ = "plot_projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    project_json = Column(JSON, nullable=False, default=dict)
    storage_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class PlotProjectShare(Base):
    __tablename__ = "plot_project_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plot_project_id = Column(UUID(as_uuid=True), ForeignKey("plot_projects.id", ondelete="CASCADE"))
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SequenceWorkspaceFile(Base):
    __tablename__ = "sequence_workspace_files"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False, unique=True)
    size_bytes = Column(BigInteger, nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    storage_path = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class PcrPreset(Base):
    __tablename__ = "pcr_presets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    # Re-added simple fields
    primer_f = Column(String, nullable=True)
    primer_r = Column(String, nullable=True)
    product_size = Column(Integer, default=0)
    components_json = Column(JSON, default=list) # Store full component list
    storage_path = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False)
    # ERD fields
    category = Column(String)
    description = Column(Text)
    is_system = Column(Boolean, default=False)
    owner_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class PcrPresetTransfer(Base):
    __tablename__ = "pcr_preset_transfers"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preset_id = Column(UUID(as_uuid=True), ForeignKey("pcr_presets.id", ondelete="CASCADE"))
    sender_user_id = Column(BigInteger, ForeignKey("users.id"))
    receiver_user_id = Column(BigInteger, ForeignKey("users.id"))
    status = Column(String, default="pending") # pending, accepted, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class PcrPresetLabShare(Base):
    __tablename__ = "pcr_preset_lab_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preset_id = Column(UUID(as_uuid=True), ForeignKey("pcr_presets.id", ondelete="CASCADE"))
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ─────────────────────────────────────────────────────────────────────────────
# Facility Booking System
# ─────────────────────────────────────────────────────────────────────────────

from sqlalchemy import Date

class FacilitySpot(Base):
    """
    Represents a physical spot/location within a facility room.
    Maps to the 'Spot' column in the original Excel allocation sheet.
    """
    __tablename__ = "facility_spots"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, index=True)          # e.g. "Acacia Room 18_01"
    room = Column(String, index=True)                       # e.g. "Acacia Room 18"
    category = Column(String, default="General")            # e.g. "Growth Chamber", "Storage"
    display_order = Column(Integer, default=0)               # Controls visual ordering
    map_group = Column(String, nullable=True)                # Grouping for visual layout
    is_active = Column(Boolean, default=True)                # Soft delete / deactivation
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class FacilityBooking(Base):
    """
    Represents a booking/reservation of a facility spot for a date range.
    Maps to the 'Raw booking table' in the original Excel.
    """
    __tablename__ = "facility_bookings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    spot_id = Column(UUID(as_uuid=True), ForeignKey("facility_spots.id", ondelete="CASCADE"), index=True)
    user_name = Column(String)                               # Who booked it
    species = Column(String, nullable=True)                  # e.g. "Arabidopsis Col-0"
    start_date = Column(Date, nullable=False)                # First day of booking period
    end_date = Column(Date, nullable=False)                  # Last day of booking period
    comment = Column(Text, nullable=True)
    created_by_name = Column(String, nullable=True)          # Name of the user who created it
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class WorkflowPresetTransfer(Base):
    __tablename__ = "workflow_preset_transfers"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preset_id = Column(String)
    preset_data = Column(JSON)
    sender_user_id = Column(BigInteger, ForeignKey("users.id"))
    receiver_user_id = Column(BigInteger, ForeignKey("users.id"))
    status = Column(String, default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WorkflowShare(Base):
    __tablename__ = "workflow_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(String, index=True)
    workflow_type = Column(String)  # "active" or "archive"
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id", ondelete="CASCADE"), nullable=True)
    shared_with_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
