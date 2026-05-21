export * from "./auth";
export * from "./patients";
export * from "./studies";
export * from "./analytics";
export * from "./settings";
export * from "./notifications";

// App-specific unions / enums
export type AppSidebarPage =
  | "dashboard"
  | "patients"
  | "studies"
  | "upload_dicom"
  | "settings";

