import type {
  UploadJobStatus,
  UploadStudyPatientPayload,
  UploadStudyResponse,
} from "@/api/domain";
import { uploadStudy } from "@/api/clients";

export interface UploadStudyRequest {
  patient: UploadStudyPatientPayload;
  files: File[];
  description?: string;
  onProgress?: (job: UploadJobStatus) => void;
}

export async function uploadStudyRequest(
  payload: UploadStudyRequest,
): Promise<UploadStudyResponse> {
  const { patient, files, description, onProgress } = payload;
  return uploadStudy(patient, files, description, onProgress);
}

export const uploadStudyService = {
  uploadStudy: uploadStudyRequest,
};
