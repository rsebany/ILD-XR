from __future__ import annotations
from datetime import date

from fastapi import APIRouter, HTTPException

from models.db import get_session
from models.models import PatientORM
from schemas import Patient, PatientCreate, PatientUpdate
from services.patients.ids import generate_patient_external_id

from .common import patient_orm_to_schema

router = APIRouter(prefix="/patients", tags=["patients"])


# --- Endpoint: GET /patients
@router.get(
    "",
    response_model=list[Patient],
    summary="List all patients",
    name="patients_list",
)
async def list_patients():
    """
    **List patients** — newest registration first.
    """
    with get_session() as session:
        patients = session.query(PatientORM).order_by(PatientORM.id.desc()).all()
        return [patient_orm_to_schema(p) for p in patients]


# --- Endpoint: GET /patients/{patient_id}
@router.get(
    "/{patient_id}",
    response_model=Patient,
    summary="Get one patient",
    name="patients_get",
)
async def get_patient(patient_id: str):
    """
    **Patient detail** — includes studies with segmentation summary.
    """
    with get_session() as session:
        patient = session.query(PatientORM).filter(PatientORM.external_id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        return patient_orm_to_schema(patient)


# --- Endpoint: POST /patients
@router.post(
    "",
    response_model=Patient,
    status_code=201,
    summary="Create patient",
    name="patients_create",
)
async def create_patient(payload: PatientCreate):
    """
    **Create patient** — assigns unique external id `ILD-2026-*`.
    """
    with get_session() as session:
        while True:
            medical_id = generate_patient_external_id()
            exists = session.query(PatientORM).filter(PatientORM.external_id == medical_id).first()
            if not exists:
                break

        patient = PatientORM(
            external_id=medical_id,
            name=payload.name,
            date_of_birth=payload.dateOfBirth or date(1900, 1, 1),
            sex=(payload.sex or "U").strip().upper()[:1] or "U",
            notes=payload.notes,
        )
        session.add(patient)
        session.commit()
        session.refresh(patient)
        return patient_orm_to_schema(patient)


# --- Endpoint: PUT /patients/{patient_id}
@router.put(
    "/{patient_id}",
    response_model=Patient,
    summary="Update patient",
    name="patients_update",
)
async def update_patient(patient_id: str, payload: PatientUpdate):
    """
    **Update patient** — metadata only; studies unchanged.
    """
    with get_session() as session:
        patient = session.query(PatientORM).filter(PatientORM.external_id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        if payload.name is not None:
            patient.name = payload.name
        if payload.dateOfBirth is not None:
            patient.date_of_birth = payload.dateOfBirth
        if payload.notes is not None:
            patient.notes = payload.notes

        session.commit()
        session.refresh(patient)
        return patient_orm_to_schema(patient)


# --- Endpoint: DELETE /patients/{patient_id}
@router.delete(
    "/{patient_id}",
    status_code=204,
    summary="Delete patient",
    name="patients_delete",
)
async def delete_patient(patient_id: str):
    """
    **Delete patient** — cascades per ORM rules.
    """
    with get_session() as session:
        patient = session.query(PatientORM).filter(PatientORM.external_id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        session.delete(patient)
        session.commit()
