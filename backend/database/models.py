from sqlalchemy import Column, String, BigInteger, Boolean, DateTime, ForeignKey, JSON, Text, Float, Integer
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class CrisprResultShare(Base):
    __tablename__ = "crispr_result_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    result_id = Column(UUID(as_uuid=True), ForeignKey("crispr_results.id", ondelete="CASCADE"))
    lab_id = Column(UUID(as_uuid=True), ForeignKey("labs.id"))
    shared_by_user_id = Column(BigInteger, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class PcrPreset(Base):
    __tablename__ = "pcr_presets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    # Re-added simple fields
    primer_f = Column(String, nullable=True)
    primer_r = Column(String, nullable=True)
    product_size = Column(Integer, default=0)
    components_json = Column(JSON, default=list) # Store full component list
    is_public = Column(Boolean, default=False)
    # ERD fields
    category = Column(String)
    source = Column(String)
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

class PcrPresetComponent(Base):
    __tablename__ = "pcr_preset_components"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    preset_id = Column(UUID(as_uuid=True), ForeignKey("pcr_presets.id"))
    name = Column(String)
    component_type = Column(String)
    calculation_mode = Column(String)
    stock_concentration = Column(Float)
    stock_unit = Column(String)
    final_concentration = Column(Float)
    final_unit = Column(String)
    fixed_volume = Column(Float)
    volume_per_25ul = Column(Float)
    ratio_denominator = Column(Float)
    include_in_master_mix = Column(Boolean, default=True)
    is_optional = Column(Boolean, default=False)
    display_order = Column(Integer)
