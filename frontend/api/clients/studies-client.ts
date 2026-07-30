/**
 * Studies API — list, upload, metrics, downloads, expert compare, volume/mask assets.
 */
import {
  ApiError,
  apiFetch,
  apiFetchAllow404,
  apiFetchBlob,
  apiFetchRawAllow404,
  buildApiUrl,
  appendAccessTokenParam,
} from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type {
  DicomVolumeShape,
  ExpertMaskCompareResponse,
  StudyListItem,
  StudyMetrics,
  UploadJobStatus,
  UploadStudyPatientPayload,
  UploadStudyResponse,
} from "../domain";

export type {
  DicomVolumeShape,
  ExpertMaskCompareResponse,
  StudySyncEvent,
  UploadStudyPatientPayload,
} from "../domain";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function appendImagingFiles(formData: FormData, files: File[]): void {
  const zipFiles = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFiles.length > 0) {
    formData.append("file", zipFiles[0]);
  } else {
    files.forEach((f) => formData.append("files", f));
  }
}

async function fetchStudyBlob(
  path: string,
  notFoundMessage: string,
): Promise<Blob> {
  try {
    return await apiFetchBlob(path, { method: "GET" });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(notFoundMessage);
    }
    throw error;
  }
}

export function resolveMeshUrl(meshPath: string): string {
  if (meshPath.startsWith("http://") || meshPath.startsWith("https://")) {
    return meshPath;
  }
  return buildApiUrl(meshPath);
}

async function fetchMeshUrlFromRoute(route: string): Promise<string> {
  const res = await apiFetch<{ mesh_url: string }>(route, { method: "GET" });
  return resolveMeshUrl(res.mesh_url || "");
}

function parseMaskShapeHeader(
  header: string | null,
): [number, number, number] {
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
  return parts as [number, number, number];
}

// ---------------------------------------------------------------------------
// List & lifecycle
// ---------------------------------------------------------------------------

export async function listStudies(): Promise<StudyListItem[]> {
  return apiFetch<StudyListItem[]>(ROUTES.studies, { method: "GET" });
}

export async function deleteStudy(studyId: string): Promise<void> {
  await apiFetch<void>(joinRoute(ROUTES.studies, studyId), {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Metrics & AI analysis
// ---------------------------------------------------------------------------

export async function getStudyMetrics(studyId: string): Promise<StudyMetrics> {
  return apiFetch<StudyMetrics>(
    joinRoute(ROUTES.studies, studyId, "metrics"),
    { method: "GET" },
  );
}

/** Re-run segmentation on the study's stored DICOM; updates mask on disk and metrics. */
export async function runStudyAiAnalysis(studyId: string): Promise<StudyMetrics> {
  return apiFetch<StudyMetrics>(
    joinRoute(ROUTES.studies, studyId, "ai-analysis"),
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// Downloads (blob)
// ---------------------------------------------------------------------------

export async function getStudyDicomZip(studyId: string): Promise<Blob> {
  return fetchStudyBlob(
    joinRoute(ROUTES.studies, studyId, "dicom-zip"),
    "DICOM series is not available on the server for this study. Try re-running the analysis or re-uploading the scan.",
  );
}

export async function getStudyReportPdf(studyId: string): Promise<Blob> {
  return fetchStudyBlob(
    joinRoute(ROUTES.studies, studyId, "report-pdf"),
    "Report is not available for this study yet. Wait for processing to complete.",
  );
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function getUploadJobStatus(jobId: string): Promise<UploadJobStatus> {
  return apiFetch<UploadJobStatus>(
    joinRoute(ROUTES.studies, "upload", "jobs", jobId),
    { method: "GET" },
  );
}

async function waitForUploadJob(
  jobId: string,
  onProgress?: (job: UploadJobStatus) => void,
): Promise<UploadStudyResponse> {
  const pollMs = 2000;
  const maxWaitMs = 3 * 60 * 60 * 1000; // 3h Softmax-friendly
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const job = await getUploadJobStatus(jobId);
    onProgress?.(job);
    if (job.status === "done") {
      if (!job.result) {
        throw new Error("Analysis finished but no result was returned.");
      }
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "AI analysis failed.");
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("AI analysis timed out. Check the API logs and try again.");
}

export async function uploadStudy(
  patient: UploadStudyPatientPayload,
  files: File[],
  studyDescription?: string,
  onProgress?: (job: UploadJobStatus) => void,
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
  appendImagingFiles(formData, files);
  if (studyDescription) {
    formData.append("study_description", studyDescription);
  }
  // Softmax runs in a background job so this POST returns after DICOM ingest.
  formData.append("async_analysis", "true");

  const accepted = await apiFetch<UploadJobStatus | UploadStudyResponse>(
    joinRoute(ROUTES.studies, "upload"),
    {
      method: "POST",
      body: formData,
      jsonBody: false,
    },
  );

  if (accepted && typeof accepted === "object" && "study_id" in accepted && "patient" in accepted) {
    return accepted as UploadStudyResponse;
  }

  const job = accepted as UploadJobStatus;
  if (!job?.job_id) {
    throw new Error("Upload did not return a job id or study result.");
  }
  onProgress?.(job);
  return waitForUploadJob(job.job_id, onProgress);
}

// ---------------------------------------------------------------------------
// Expert mask compare
// ---------------------------------------------------------------------------

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
  appendImagingFiles(formData, files);
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
  appendAccessTokenParam(params);
  return `${buildApiUrl(joinRoute(ROUTES.studies, studyId, "expert-compare", "slices", zIndex))}?${params}`;
}

/** Axial/coronal/sagittal PNG URL for standard study slice rendering. */
export function getStudySliceUrl(
  studyId: string,
  zIndex: number,
  options: {
    windowCenter?: number;
    windowWidth?: number;
    orientation?: "axial" | "coronal" | "sagittal";
    includeOverlay?: boolean;
    includeLungBoundary?: boolean;
    overlayOpacity?: number;
  } = {},
): string {
  const params = new URLSearchParams({
    window_center: String(options.windowCenter ?? -600),
    window_width: String(options.windowWidth ?? 1500),
    orientation: options.orientation ?? "axial",
    include_overlay: options.includeOverlay ? "true" : "false",
    include_lung_boundary: options.includeLungBoundary !== false ? "true" : "false",
    denoise: "false",
  });
  if (options.includeOverlay) {
    params.set(
      "overlay_opacity",
      Math.min(1, Math.max(0, options.overlayOpacity ?? 0.6)).toFixed(2),
    );
  }
  appendAccessTokenParam(params);

  return `${buildApiUrl(joinRoute(ROUTES.studies, studyId, "slices", zIndex))}?${params}`;
}

/** GLB URL for the expert label mesh (after Upload DICOM expert compare). */
export async function getExpertCompareExpertMeshUrl(
  studyId: string,
): Promise<string> {
  return fetchMeshUrlFromRoute(
    joinRoute(ROUTES.studies, studyId, "expert-compare", "expert-mesh"),
  );
}

// ---------------------------------------------------------------------------
// 3D meshes
// ---------------------------------------------------------------------------

export async function getStudyMeshUrl(studyId: string): Promise<string> {
  return fetchMeshUrlFromRoute(joinRoute(ROUTES.studies, studyId, "mesh"));
}

// ---------------------------------------------------------------------------
// Realtime sync
// ---------------------------------------------------------------------------

export function getStudyEventsUrl(studyId: string): string {
  const params = new URLSearchParams();
  appendAccessTokenParam(params);
  const query = params.toString();
  const base = buildApiUrl(joinRoute(ROUTES.studies, studyId, "events"));
  return query ? `${base}?${query}` : base;
}

// ---------------------------------------------------------------------------
// Volume & segmentation mask
// ---------------------------------------------------------------------------

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

  const [d, h, w] = parseMaskShapeHeader(
    response.headers.get("X-Mask-Shape"),
  );
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length !== d * h * w) {
    throw new Error("Mask bytes length does not match reported shape");
  }
  return { shape: [d, h, w], data };
}
