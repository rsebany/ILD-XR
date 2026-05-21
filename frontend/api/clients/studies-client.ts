import {
  ApiError,
  apiFetch,
  apiFetchAllow404,
  apiFetchBlob,
  apiFetchRawAllow404,
  buildApiUrl,
} from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type {
  DicomVolumeShape,
  ExpertMaskCompareResponse,
  StudyListItem,
  StudyMetrics,
  UploadStudyPatientPayload,
  UploadStudyResponse,
} from "../domain";

export type {
  DicomVolumeShape,
  ExpertMaskCompareResponse,
  StudySyncEvent,
  UploadStudyPatientPayload,
} from "../domain";

export async function listStudies(): Promise<StudyListItem[]> {
  return apiFetch<StudyListItem[]>(ROUTES.studies, { method: "GET" });
}

export async function getStudyMetrics(studyId: string): Promise<StudyMetrics> {
  return apiFetch<StudyMetrics>(
    joinRoute(ROUTES.studies, studyId, "metrics"),
    { method: "GET" },
  );
}

export async function deleteStudy(studyId: string): Promise<void> {
  await apiFetch<void>(joinRoute(ROUTES.studies, studyId), {
    method: "DELETE",
  });
}

/** Re-run segmentation on the study's stored DICOM; updates mask on disk and metrics. */
export async function runStudyAiAnalysis(studyId: string): Promise<StudyMetrics> {
  return apiFetch<StudyMetrics>(
    joinRoute(ROUTES.studies, studyId, "ai-analysis"),
    { method: "POST" },
  );
}

export async function getStudyDicomZip(studyId: string): Promise<Blob> {
  try {
    return await apiFetchBlob(
      joinRoute(ROUTES.studies, studyId, "dicom-zip"),
      { method: "GET" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(
        "DICOM series is not available on the server for this study. Try re-running the analysis or re-uploading the scan.",
      );
    }
    throw error;
  }
}

export async function getStudyReportPdf(studyId: string): Promise<Blob> {
  try {
    return await apiFetchBlob(
      joinRoute(ROUTES.studies, studyId, "report-pdf"),
      { method: "GET" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(
        "Report is not available for this study yet. Wait for processing to complete.",
      );
    }
    throw error;
  }
}

export async function uploadStudy(
  patient: UploadStudyPatientPayload,
  files: File[],
  studyDescription?: string,
): Promise<UploadStudyResponse> {
  if (!files.length) {
    throw new Error("No imaging files provided for analysis.");
  }

  const formData = new FormData();
  const patientId = (patient.id ?? "").trim();
  const patientName = (patient.name ?? "").trim();
  const dob = (patient.dob ?? "").trim();
  if (patientId) {
    formData.append("patient_id", patientId);
  }
  formData.append("patient_name", patientName);
  if (dob) {
    formData.append("date_of_birth", dob);
  }
  const zipFiles = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFiles.length > 0) {
    formData.append("file", zipFiles[0]);
  } else {
    files.forEach((f) => formData.append("files", f));
  }
  if (studyDescription) {
    formData.append("study_description", studyDescription);
  }

  return apiFetch<UploadStudyResponse>(joinRoute(ROUTES.studies, "upload"), {
    method: "POST",
    body: formData,
    jsonBody: false,
  });
}

/** Compare expert / reference mask DICOMs (ZIP or multi-file) to the stored AI mask for a study. */
export async function compareExpertMaskDicom(
  studyId: string,
  files: File[],
): Promise<ExpertMaskCompareResponse> {
  if (!files.length) {
    throw new Error("Add expert mask DICOM files or a ZIP.");
  }
  const formData = new FormData();
  formData.append("study_id", studyId.trim());
  const zipFiles = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFiles.length > 0) {
    formData.append("file", zipFiles[0]);
  } else {
    files.forEach((f) => formData.append("files", f));
  }
  return apiFetch<ExpertMaskCompareResponse>(
    joinRoute(ROUTES.studies, "upload", "expert-mask-compare"),
    { method: "POST", body: formData, jsonBody: false },
  );
}

/** Axial dual-panel PNG URL: CT+AI | CT+expert (requires prior expert-mask compare for this study). */
export function getExpertCompareSliceUrl(
  studyId: string,
  zIndex: number,
  options: {
    windowCenter?: number;
    windowWidth?: number;
    overlayOpacity?: number;
  } = {},
): string {
  const windowCenter = options.windowCenter ?? -600;
  const windowWidth = options.windowWidth ?? 1500;
  const overlayOpacity = options.overlayOpacity ?? 0.6;
  const params = new URLSearchParams({
    window_center: String(windowCenter),
    window_width: String(windowWidth),
    overlay_opacity: Math.min(1, Math.max(0, overlayOpacity)).toFixed(2),
    denoise: "false",
  });
  return `${buildApiUrl(joinRoute(ROUTES.studies, studyId, "expert-compare", "slices", zIndex))}?${params}`;
}

export async function getStudyMeshUrl(studyId: string): Promise<string> {
  const res = await apiFetch<{ mesh_url: string }>(
    joinRoute(ROUTES.studies, studyId, "mesh"),
    { method: "GET" },
  );
  const meshPath = res.mesh_url || "";
  if (meshPath.startsWith("http://") || meshPath.startsWith("https://")) {
    return meshPath;
  }
  return buildApiUrl(meshPath);
}

/** GLB URL for the expert label mesh (after Upload DICOM expert compare). */
export async function getExpertCompareExpertMeshUrl(studyId: string): Promise<string> {
  const res = await apiFetch<{ mesh_url: string }>(
    joinRoute(ROUTES.studies, studyId, "expert-compare", "expert-mesh"),
    { method: "GET" },
  );
  const meshPath = res.mesh_url || "";
  if (meshPath.startsWith("http://") || meshPath.startsWith("https://")) {
    return meshPath;
  }
  return buildApiUrl(meshPath);
}

export function getStudyEventsUrl(studyId: string): string {
  return buildApiUrl(joinRoute(ROUTES.studies, studyId, "events"));
}

export async function getDicomVolumeShape(
  studyId: string,
): Promise<DicomVolumeShape | null> {
  return apiFetchAllow404<DicomVolumeShape>(
    joinRoute(ROUTES.studies, studyId, "dicom-shape"),
    { method: "GET" },
  );
}

export async function getStudyMask(
  studyId: string,
): Promise<{ shape: [number, number, number]; data: Uint8Array }> {
  const response = await apiFetchRawAllow404(
    joinRoute(ROUTES.studies, studyId, "mask"),
    { method: "GET" },
  );
  if (!response) {
    return { shape: [0, 0, 0], data: new Uint8Array() };
  }
  const header = response.headers.get("X-Mask-Shape");
  if (!header) {
    throw new Error("Mask shape header missing or invalid");
  }
  const parts = header
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  if (parts.length !== 3 || parts.some((n) => n <= 0)) {
    throw new Error("Mask shape header missing or invalid");
  }
  const [d, h, w] = parts as [number, number, number];
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  if (data.length !== d * h * w) {
    throw new Error("Mask bytes length does not match reported shape");
  }
  return { shape: [d, h, w], data };
}
