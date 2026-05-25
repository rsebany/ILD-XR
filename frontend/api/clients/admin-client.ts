/**
 * Admin API — user directory and system health.
 */
import { apiFetch } from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type { AdminUserListItem, HealthCheckResponse } from "../domain";

export async function fetchAdminUsers(): Promise<AdminUserListItem[]> {
  return apiFetch<AdminUserListItem[]>(joinRoute(ROUTES.admin, "users"), {
    method: "GET",
  });
}

export async function fetchHealth(): Promise<HealthCheckResponse> {
  return apiFetch<HealthCheckResponse>("/health", { method: "GET" });
}
