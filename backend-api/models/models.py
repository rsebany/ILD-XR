from sqlalchemy import Column, Integer, String, Float, JSON, ForeignKey, DateTime, Boolean, LargeBinary, Date
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from datetime import datetime, date, timezone
from typing import List, Optional

# --- Role Constants ---
ROLE_RADIOLOGIST = "radiologist"
ROLE_REFERRING = "referring_physician"
ROLE_ADMIN = "admin"

def utcnow() -> datetime:
    """Helper to ensure all timestamps are timezone-aware UTC."""
    return datetime.now(timezone.utc)

class Base(DeclarativeBase): 
    pass

# --- Core Entities ---

class UserORM(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    medical_id: Mapped[str] = mapped_column(String, unique=True, index=True) # docteur id or similar
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default=ROLE_RADIOLOGIST)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    
    # Relationships
    settings: Mapped[Optional["SettingsORM"]] = relationship("SettingsORM", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications: Mapped[List["NotificationORM"]] = relationship("NotificationORM", back_populates="user", cascade="all, delete-orphan")
    studies: Mapped[List["StudyORM"]] = relationship("StudyORM", back_populates="user")


class PatientORM(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True) 
    name: Mapped[str] = mapped_column(String, nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False) 
    sex: Mapped[str] = mapped_column(String, nullable=False) 
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Relationships
    studies: Mapped[List["StudyORM"]] = relationship("StudyORM", back_populates="patient", cascade="all, delete-orphan")


class StudyORM(Base):
    __tablename__ = "studies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True) #UUID from PACS or similar system
    study_uid: Mapped[Optional[str]] = mapped_column(String, nullable=True) 
    modality: Mapped[str] = mapped_column(String, default="ct") # CT, X-ray, MRI, etc.
    volume_path: Mapped[str] = mapped_column(String, nullable=False) 
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    
    # Foreign Keys
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Relationships
    patient: Mapped[PatientORM] = relationship("PatientORM", back_populates="studies")
    user: Mapped[UserORM] = relationship("UserORM", back_populates="studies")
    segmentation: Mapped[Optional["SegmentationResultORM"]] = relationship(
        "SegmentationResultORM", back_populates="study", uselist=False, cascade="all, delete-orphan"
    )

# --- AI & Analytics ---

class SegmentationResultORM(Base):
    __tablename__ = "segmentations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True)

    total_ild_volume_ml: Mapped[float] = mapped_column(Float)
    ild_fraction: Mapped[float] = mapped_column(Float, default=0.0)
    lung_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True) #True lung volume (cm³)

    # Per-class lesion volumes (cm³)
    ggo_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reticulation_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    consolidation_volume_ml: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Per-class burden ratios
    ggo_burden: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reticulation_burden: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    consolidation_burden: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    dice_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True) #compared with ground truth if available
    zonal_distribution: Mapped[dict] = mapped_column(JSON) # % of ILD voxels per zone
    visualization_mode: Mapped[str] = mapped_column(String, default="mixed") # 2d, 3d, xr, mixed
    
    # Output Files
    mesh_url: Mapped[str] = mapped_column(String)
    mask_shape: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mask_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True) 
    mask_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    
    # Foreign Keys
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id"), unique=True)
    
    # Relationships
    study: Mapped[StudyORM] = relationship("StudyORM", back_populates="segmentation")
    xr_view: Mapped[Optional["XRViewORM"]] = relationship(
        "XRViewORM", back_populates="segmentation", uselist=False, cascade="all, delete-orphan"
    )

# --- Visualization - 3D Viewer ---

class XRViewORM(Base):
    __tablename__ = "xr_views"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    clipping_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Foreign Keys
    segmentation_id: Mapped[int] = mapped_column(ForeignKey("segmentations.id"), unique=True)
    
    # Relationships
    segmentation: Mapped[SegmentationResultORM] = relationship("SegmentationResultORM", back_populates="xr_view")




# --- Additional infrastructure - Settings, Notifications, Password Reset Tokens ---

class SettingsORM(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    
    email_on_analysis: Mapped[bool] = mapped_column(Boolean, default=True)
    in_app_alerts: Mapped[bool] = mapped_column(Boolean, default=True)
    default_view: Mapped[str] = mapped_column(String, default="2d")
    unit_measurement: Mapped[str] = mapped_column(String, default="mm")
    
    pacs_api_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pacs_endpoint: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[UserORM] = relationship("UserORM", back_populates="settings")


class NotificationORM(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, default="")
    type: Mapped[str] = mapped_column(String, default="info")
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[UserORM] = relationship("UserORM", back_populates="notifications")


class PasswordResetTokenORM(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)