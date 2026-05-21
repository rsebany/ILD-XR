import { apiFetch } from "../http/client";
import { ROUTES } from "../http/paths";
import type {
  PractitionerSettings,
  PractitionerSettingsUpdate,
} from "../domain";

export async function fetchSettings(): Promise<PractitionerSettings> {
  return apiFetch<PractitionerSettings>(ROUTES.settings, { method: "GET" });
}

export async function updateSettings(
  payload: PractitionerSettingsUpdate,
): Promise<PractitionerSettings> {
  return apiFetch<PractitionerSettings>(ROUTES.settings, {
    method: "PUT",
    body: payload,
  });
}
