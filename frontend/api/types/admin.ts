/**
 * Admin API types — user directory (aligned with `backend-api` admin schemas).
 */

export interface AdminUserListItem {
  id: number;
  medical_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface HealthCheckResponse {
  status: string;
  infrastructure: string;
  ai_model: string;
  storage: string;
  xr?: {
    api_bind: string;
    api_base_url_for_headset: string;
    hint: string;
  };
  slicer?: {
    api_base: string;
    bridge_cli: string;
    hint: string;
  };
}
