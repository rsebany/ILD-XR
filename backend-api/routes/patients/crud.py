"""Patient CRUD HTTP routes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from models.db import get_session
from models.models import PatientORM
from schemas import Patient, PatientCreate, PatientUpdate
from services.patients.ids import generate_patient_external_id

from .common import patient_orm_to_schema

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/patients", tags=["patients"])

_DEFAULT_DOB = date(1900, 1, 1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_patient_or_404(session: Session, patient_id: str) -> PatientORM:
    patient = (
        session.query(PatientORM).filter(PatientORM.external_id == patient_id).first()
    )
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def _allocate_external_id(session: Session) -> str:
    while True:
        medical_id = generate_patient_external_id()
        exists = (
            session.query(PatientORM)
            .filter(PatientORM.external_id == medical_id)
            .first()
        )
        if not exists:
            return medical_id


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[Patient],
    summary="List all patients",
    name="patients_list",
)
async def list_patients() -> list[Patient]:
    with get_session() as session:
        patients = session.query(PatientORM).order_by(PatientORM.id.desc()).all()
        return [patient_orm_to_schema(p) for p in patients]


@router.get(
    "/{patient_id}",
    response_model=Patient,
    summary="Get one patient",
    name="patients_get",
)
async def get_patient(patient_id: str) -> Patient:
    with get_session() as session:
        return patient_orm_to_schema(_get_patient_or_404(session, patient_id))


@router.post(
    "",
    response_model=Patient,
    status_code=201,
    summary="Create patient",
    name="patients_create",
)
async def create_patient(payload: PatientCreate) -> Patient:
    with get_session() as session:
        patient = PatientORM(
            external_id=_allocate_external_id(session),
            name=payload.name,
            date_of_birth=payload.dateOfBirth or _DEFAULT_DOB,
            sex=(payload.sex or "U").strip().upper()[:1] or "U",
            notes=payload.notes,
        )
        session.add(patient)
        session.flush()
        return patient_orm_to_schema(patient)


@router.put(
    "/{patient_id}",
    response_model=Patient,
    summary="Update patient",
    name="patients_update",
)
async def update_patient(patient_id: str, payload: PatientUpdate) -> Patient:
    with get_session() as session:
        patient = _get_patient_or_404(session, patient_id)

        if payload.name is not None:
            patient.name = payload.name
        if payload.dateOfBirth is not None:
            patient.date_of_birth = payload.dateOfBirth
        if payload.notes is not None:
            patient.notes = payload.notes

        session.flush()
        return patient_orm_to_schema(patient)


@router.delete(
    "/{patient_id}",
    status_code=204,
    summary="Delete patient",
    name="patients_delete",
)
async def delete_patient(patient_id: str) -> None:
    with get_session() as session:
        session.delete(_get_patient_or_404(session, patient_id))
