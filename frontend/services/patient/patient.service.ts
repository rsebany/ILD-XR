import type {
  CreatePatientPayload,
  Patient,
  UpdatePatientPayload,
} from "@/api/domain";
import {
  createPatient,
  deletePatient,
  getPatient,
  listPatients,
  updatePatient,
} from "@/api/clients";

export async function getById(id: string): Promise<Patient> {
  return getPatient(id);
}

export async function list(): Promise<Patient[]> {
  return listPatients();
}

export async function create(data: CreatePatientPayload): Promise<Patient> {
  return createPatient(data);
}

export async function update(
  id: string,
  data: UpdatePatientPayload,
): Promise<Patient> {
  return updatePatient(id, data);
}

export async function remove(id: string): Promise<void> {
  return deletePatient(id);
}

export const patientService = {
  getById,
  list,
  create,
  update,
  remove,
};
