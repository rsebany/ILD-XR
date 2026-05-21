/**
 * Shared query string for imaging pipeline routes (patient + study context).
 */
export function imagingContextQuery(params: {
  patientId?: string | null;
  studyId?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (params.patientId) sp.set("patientId", params.patientId);
  if (params.studyId) sp.set("studyId", params.studyId);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function imagingContextFromSearchParams(searchParams: URLSearchParams): {
  patientId: string | null;
  studyId: string | null;
} {
  return {
    patientId: searchParams.get("patientId"),
    studyId: searchParams.get("studyId"),
  };
}
