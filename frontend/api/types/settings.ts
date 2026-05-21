export interface PractitionerSettings {
  email_on_analysis: boolean;
  in_app_alerts: boolean;
  default_view: string;
  unit_measurement: string;
  pacs_api_key?: string | null;
  pacs_endpoint?: string | null;
}

export interface PractitionerSettingsUpdate {
  email_on_analysis?: boolean;
  in_app_alerts?: boolean;
  default_view?: string;
  unit_measurement?: string;
  pacs_api_key?: string | null;
  pacs_endpoint?: string | null;
}

