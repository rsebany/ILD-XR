from __future__ import annotations
from datetime import datetime, date
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Optional, Dict, Literal

# --- Auth ---
class SignupRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: str
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    medical_id: str
    full_name: str
    email: EmailStr
    role: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class XRView(BaseModel):
    id: str
    mesh_url: str
    clipping_enabled: bool = True

class SegmentationResult(BaseModel):
    id: str
    # Aggregate biomarkers
    total_ild_volume_ml: float = Field(..., ge=0)
    lung_volume_ml: Optional[float] = Field(default=None, ge=0)
    ild_burden: Optional[float] = Field(default=None, ge=0, le=1)
    # Per-class lesion volumes (cm³ ≡ ml). Equation 1.5 in the report.
    ggo_volume_ml: Optional[float] = Field(default=None, ge=0)
    reticulation_volume_ml: Optional[float] = Field(default=None, ge=0)
    consolidation_volume_ml: Optional[float] = Field(default=None, ge=0)
    # Per-class burdens = V_class / V_lung. Equation 1.6 in the report.
    ggo_burden: Optional[float] = Field(default=None, ge=0, le=1)
    reticulation_burden: Optional[float] = Field(default=None, ge=0, le=1)
    consolidation_burden: Optional[float] = Field(default=None, ge=0, le=1)
    # Upper / Middle / Lower craniocaudal thirds — % of ILD voxels.
    zonal_distribution: Dict[str, float] = Field(default_factory=dict)
    mesh_url: str
    xr_view: Optional[XRView] = None
    visualization_mode: Literal["2d", "3d", "xr", "mixed"] = "mixed"
    # Dice score is expressed as a percentage (0–100) in the UI
    dice_score: Optional[float] = Field(None, ge=0, le=100)

class Study(BaseModel):
    id: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modality: str = "ct"
    segmentation: Optional[SegmentationResult] = None

class Patient(BaseModel):
    id: str
    name: str
    dateOfBirth: Optional[date] = None
    notes: Optional[str] = None
    studies: List[Study] = []

class PatientCreate(BaseModel):
    name: str
    dateOfBirth: Optional[date] = None
    notes: Optional[str] = None
    sex: Optional[str] = None  # U | M | F; default "U" in route

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    dateOfBirth: Optional[date] = None
    notes: Optional[str] = None

class StudyListItem(BaseModel):
    study_id: str
    patient_id: str
    patient_name: str
    modality: str
    ild_fraction: float
    volume_total_mm3: float
    status: Literal["Completed", "Processing", "Pending"]
    acquisition_date: Optional[datetime] = None
    # Upper / Middle / Lower craniocaudal thirds — % of ILD voxels per study.
    zonal_distribution: Dict[str, float] = Field(default_factory=dict)
    # Optional per-class biomarkers, surfaced when the study has them stored.
    lung_volume_ml: Optional[float] = None
    ggo_volume_ml: Optional[float] = None
    reticulation_volume_ml: Optional[float] = None
    consolidation_volume_ml: Optional[float] = None
    ggo_burden: Optional[float] = None
    reticulation_burden: Optional[float] = None
    consolidation_burden: Optional[float] = None


class UploadStudyResponse(BaseModel):
    """Response model for POST /studies/upload (ZIP or multiple DICOM files)."""
    study_id: str
    patient: Patient

class StudyMetrics(BaseModel):
    """Response from GET /studies/{study_id}/metrics."""
    study_id: str
    volume_total_mm3: float  # ILD volume in mm³ (frontend converts to cm³)
    ild_fraction: float
    zonal_distribution: Dict[str, float] = Field(default_factory=dict)
    # Per-class biomarkers (Equations 1.5 / 1.6 in the report).
    lung_volume_ml: Optional[float] = None
    ggo_volume_ml: Optional[float] = None
    reticulation_volume_ml: Optional[float] = None
    consolidation_volume_ml: Optional[float] = None
    ggo_burden: Optional[float] = None
    reticulation_burden: Optional[float] = None
    consolidation_burden: Optional[float] = None
    ild_burden: Optional[float] = None


class ExpertMaskCompareResponse(BaseModel):
    """Response from POST /studies/upload/expert-mask-compare (expert DICOM vs stored AI mask)."""

    study_id: str
    expert_shape: List[int] = Field(
        ...,
        min_length=3,
        max_length=3,
        description="Expert label volume shape [Z, Y, X] after stacking sorted DICOMs.",
    )
    prediction_shape: List[int] = Field(
        ...,
        min_length=3,
        max_length=3,
        description="Stored prediction mask shape [Z, Y, X].",
    )
    dice: Dict[str, float] = Field(
        default_factory=dict,
        description="Per-class Dice and aggregates (0–1). Keys include dice_ggo, dice_reticulation, "
        "dice_consolidation, dice_mean_lesion, dice_any_ild.",
    )
    expert_label_max_seen: int = Field(
        ...,
        ge=0,
        description="Maximum raw integer label in expert DICOM pixels (before remap to 0–3).",
    )
    expert_labels_were_clipped: bool = Field(
        default=False,
        description="Deprecated: kept false; expert labels are remapped, not clipped to class 3.",
    )
    expert_remap_mode: str = Field(
        default="unknown",
        description="How raw expert pixels were mapped to model classes 0–3 (e.g. native_0_to_3, binary_to_class1).",
    )
    expert_remap_note: Optional[str] = Field(
        default=None,
        description="Human-readable summary of the expert label remap.",
    )
    expert_labels_were_remapped: bool = Field(
        default=False,
        description="True if raw DICOM values were not already in 0–3 (remap applied).",
    )
    prediction_remap_mode: Optional[str] = Field(
        default=None,
        description="How stored AI mask values were normalized to 0–3 for class-comparable evaluation.",
    )
    prediction_remap_note: Optional[str] = Field(
        default=None,
        description="Human-readable summary of prediction label normalization.",
    )
    prediction_labels_were_remapped: Optional[bool] = Field(
        default=None,
        description="True if stored AI mask values were not already native 0–3.",
    )
    mapping_source: Optional[str] = Field(
        default=None,
        description="Expert-class mapping provenance: native_labels or dicom_seg_metadata.",
    )
    mapping_confidence: Optional[str] = Field(
        default=None,
        description="Mapping confidence level. Strict mode returns strict_verified.",
    )
    comparison_scope: Optional[str] = Field(
        default=None,
        description="Comparison contract indicator, e.g. classes_1_2_3_only.",
    )
    mapping_failure_reason_code: Optional[str] = Field(
        default=None,
        description="Optional machine-readable reason code when mapping is unavailable.",
    )
    expert_has_ggo: Optional[bool] = Field(default=None)
    expert_has_reticulation: Optional[bool] = Field(default=None)
    expert_has_consolidation: Optional[bool] = Field(default=None)
    prediction_has_ggo: Optional[bool] = Field(default=None)
    prediction_has_reticulation: Optional[bool] = Field(default=None)
    prediction_has_consolidation: Optional[bool] = Field(default=None)
    voxel_count_expert: Dict[str, int] = Field(
        default_factory=dict,
        description="Voxel counts per label 0–3 in the expert volume after remap.",
    )
    voxel_count_prediction: Dict[str, int] = Field(
        default_factory=dict,
        description="Voxel counts per label 0–3 in the stored AI mask.",
    )
    dice_vacuous_both_empty: Dict[str, bool] = Field(
        default_factory=dict,
        description="Per lesion class: True if Dice=1 only because both expert and AI have zero voxels of that class.",
    )
    foreground_overlap_voxels: int = Field(
        default=0,
        ge=0,
        description="Count of voxels where both expert>0 and prediction>0.",
    )
    expert_foreground_voxels: int = Field(default=0, ge=0)
    prediction_foreground_voxels: int = Field(default=0, ge=0)
    voxel_agreement_fraction: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Fraction of voxels where expert label equals AI label.",
    )
    interpretation_hint: Optional[str] = Field(
        default=None,
        description="Short explanation when overlap or label counts look inconsistent with Dice.",
    )
    expert_stack_mode: Optional[str] = Field(
        default=None,
        description="How expert slices were stacked (ct_grid vs z_sorted_only).",
    )
    expert_inplane_correction: Optional[str] = Field(
        default=None,
        description="Auto in-plane flip applied to match CT/AI (none, flip_lr, flip_ud, flip_lr_ud).",
    )
    expert_slices_matched: Optional[int] = Field(
        default=None,
        ge=0,
        description="Expert DICOM files matched to a study CT slice index.",
    )


class DicomVolumeShape(BaseModel):
    """Raw DICOM series shape on disk (axial depth × H × W). Matches slice API indexing."""

    depth: int = Field(..., ge=1, description="Number of axial slices (D)")
    height: int = Field(..., ge=1, description="Rows in-plane (Y)")
    width: int = Field(..., ge=1, description="Columns in-plane (X)")
    spacing_z_mm: float = Field(
        ...,
        ge=0,
        description="Consecutive-slice distance along volume index 0 (Z, mm)",
    )
    spacing_y_mm: float = Field(..., ge=0, description="Pixel row spacing (mm), matches H")
    spacing_x_mm: float = Field(..., ge=0, description="Pixel col spacing (mm), matches W")


class SegmentationGeometry(BaseModel):
    """Canonical voxel-grid metadata for segmentation revisions."""

    shape_zyx: List[int] = Field(
        ...,
        min_length=3,
        max_length=3,
        description="Segmentation volume shape in [Z, Y, X] order.",
    )
    spacing_zyx_mm: List[float] = Field(
        ...,
        min_length=3,
        max_length=3,
        description="Voxel spacing in mm in [Z, Y, X] order.",
    )
    orientation: str = Field(
        default="zyx",
        description="Index orientation of the serialized mask. Defaults to zyx.",
    )

    @field_validator("shape_zyx")
    @classmethod
    def _validate_shape(cls, value: List[int]) -> List[int]:
        if len(value) != 3 or any(int(v) <= 0 for v in value):
            raise ValueError("shape_zyx must contain exactly 3 positive integers")
        return [int(v) for v in value]

    @field_validator("spacing_zyx_mm")
    @classmethod
    def _validate_spacing(cls, value: List[float]) -> List[float]:
        if len(value) != 3 or any(float(v) <= 0 for v in value):
            raise ValueError("spacing_zyx_mm must contain exactly 3 positive values")
        return [float(v) for v in value]


class SegmentationRevisionCreate(BaseModel):
    """Slicer/AI push payload for a study segmentation update."""

    source: Literal["ai", "slicer", "slicer_bridge", "manual"] = "slicer_bridge"
    revision_note: Optional[str] = None
    geometry: SegmentationGeometry
    labels: Dict[str, int] = Field(
        default_factory=lambda: {
            "background": 0,
            "ggo": 1,
            "reticulation": 2,
            "consolidation": 3,
        }
    )
    # Base64 payload for uint8 mask bytes, flattened in C order from [Z,Y,X].
    mask_b64: str = Field(..., min_length=4)


class SegmentationRevisionInfo(BaseModel):
    revision_id: int
    source: str
    revision_note: Optional[str] = None
    created_at: datetime
    geometry: SegmentationGeometry
    labels: Dict[str, int]
    mask_url: str
    mesh_url: Optional[str] = None


class SegmentationSyncStatus(BaseModel):
    study_id: str
    current_revision_id: int
    latest: Optional[SegmentationRevisionInfo] = None


class SegmentationUpdateResponse(BaseModel):
    study_id: str
    revision_id: int
    accepted_at: datetime
    mesh_url: Optional[str] = None
    metrics: Dict[str, float] = Field(default_factory=dict)

# --- Settings ---
class PractitionerSettings(BaseModel):
    email_on_analysis: bool = True
    in_app_alerts: bool = True
    default_view: str = "2d"
    unit_measurement: str = "mm"
    pacs_api_key: Optional[str] = None
    pacs_endpoint: Optional[str] = None

class PractitionerSettingsUpdate(BaseModel):
    email_on_analysis: Optional[bool] = None
    in_app_alerts: Optional[bool] = None
    default_view: Optional[str] = None
    unit_measurement: Optional[str] = None
    pacs_api_key: Optional[str] = None
    pacs_endpoint: Optional[str] = None

# --- Notifications ---
class Notification(BaseModel):
    id: int
    title: str
    message: str = ""
    type: str = "info"
    read_at: Optional[str] = None  # ISO datetime string
    created_at: str  # ISO datetime string

class NotificationListResponse(BaseModel):
    unread_count: int
    notifications: List[Notification]

class NotificationCreate(BaseModel):
    title: str
    message: Optional[str] = None
    type: Optional[str] = "info"