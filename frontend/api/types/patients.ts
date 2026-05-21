import type { Study } from "./studies";

export interface Patient {
  id: string;
  name: string;
  dateOfBirth?: string; // ISO date string
  notes?: string | null;
  studies: Study[];
}

export interface CreatePatientPayload {
  name: string;
  dateOfBirth?: string;
  notes?: string;
  sex?: string | null;
}

export interface UpdatePatientPayload {
  name?: string;
  dateOfBirth?: string;
  notes?: string;
}

