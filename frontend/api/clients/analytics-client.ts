import { apiFetch } from "../http/client";
import { joinRoute, ROUTES } from "../http/paths";
import type { DashboardMetrics } from "../domain";

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return apiFetch<DashboardMetrics>(
    joinRoute(ROUTES.analytics, "dashboard-metrics"),
    { method: "GET" },
  );
}
