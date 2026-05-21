import { getApiBaseUrl } from "@/api/http/client";

/** Absolute URL for mesh paths returned by the API (may be relative). */
export function resolveMeshUrl(raw: string | undefined): string {
  if (!raw || raw.trim().length === 0) return "";
  if (raw.startsWith("http")) return raw;
  const base = getApiBaseUrl();
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}
