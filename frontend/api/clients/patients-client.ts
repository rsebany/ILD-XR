import { apiFetch } from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type {
  CreatePatientPayload,
  Patient,
  UpdatePatientPayload,
} from "../domain";

export async function listPatients(): Promise<Patient[]> {
  return apiFetch<Patient[]>(ROUTES.patients, { method: "GET" });
}

export async function getPatient(patientId: string): Promise<Patient> {
  return apiFetch<Patient>(joinRoute(ROUTES.patients, patientId), {
    method: "GET",
  });
}

export async function createPatient(
  payload: CreatePatientPayload,
): Promise<Patient> {
  return apiFetch<Patient>(ROUTES.patients, {
    method: "POST",
    body: payload,
  });
}

export async function updatePatient(
  patientId: string,
  payload: UpdatePatientPayload,
): Promise<Patient> {
  return apiFetch<Patient>(joinRoute(ROUTES.patients, patientId), {
    method: "PUT",
    body: payload,
  });
}

export async function deletePatient(patientId: string): Promise<void> {
  await apiFetch<void>(joinRoute(ROUTES.patients, patientId), {
    method: "DELETE",
  });
}
