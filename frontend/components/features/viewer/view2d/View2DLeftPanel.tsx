import React from "react";
import { Activity, Database, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";

const WINDOW_PRESETS = {
  lung_ai: { label: "Lung (AI)", center: -600, width: 1500 },
  bone: { label: "Bone", center: 400, width: 1800 },
  mediastinum: { label: "Mediastinum", center: 40, width: 400 },
  soft_tissue: { label: "Soft Tissue", center: 50, width: 350 },
} as const;

type WindowPresetKey = keyof typeof WINDOW_PRESETS;
type Orientation = "axial" | "coronal" | "sagittal";

type View2DLeftPanelProps = {
  files: File[] | null;
  dicomLoadStatus: "idle" | "loading" | "loaded" | "failed";
  dicomLoadError: string | null;
  hasDicomInDb: boolean;
  hasVolume: boolean;
  patientName?: string | null;
  studyLine?: string | null;
  windowPreset: WindowPresetKey;
  orientation: Orientation;
  onFolderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWindowPresetChange: (key: WindowPresetKey, center: number, width: number) => void;
  onOrientationChange: (orientation: Orientation) => void;
  onResetSliceIndex: () => void;
};

export function View2DLeftPanel({
  files,
  dicomLoadStatus,
  dicomLoadError,
  hasDicomInDb,
  hasVolume,
  patientName,
  studyLine,
  windowPreset,
  orientation,
  onFolderChange,
  onWindowPresetChange,
  onOrientationChange,
  onResetSliceIndex,
}: View2DLeftPanelProps) {
  const sliceCount = files?.length ?? 0;
  const showCaseIdentity = Boolean(patientName || studyLine || hasDicomInDb);
  const vaultCase = hasDicomInDb;

  return (
    <div className="flex w-full flex-col gap-3 overflow-y-auto pr-1">
      <section className="rounded-xl border border-ild-border bg-ild-card p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Database className="h-3.5 w-3.5" /> Case
        </h3>

        {showCaseIdentity && (
          <div className="mb-2 min-w-0 space-y-0.5 border-b border-border/60 pb-2">
            {patientName && (
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {patientName}
              </p>
            )}
            {studyLine && (
              <p className="truncate text-[11px] text-muted-foreground" title={studyLine}>
                {studyLine}
              </p>
            )}
          </div>
        )}

        {hasDicomInDb && !hasVolume && dicomLoadStatus === "loading" && (
          <div className="mb-2 animate-pulse rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1.5 text-[10px] font-medium text-blue-500">
            Fetching study from vault…
          </div>
        )}

        {vaultCase ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${
              hasVolume
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            <Layers
              className={`h-3.5 w-3.5 shrink-0 ${hasVolume ? "text-emerald-500" : "text-muted-foreground"}`}
            />
            <span className="min-w-0 flex-1 font-medium">
              {dicomLoadStatus === "loading"
                ? "Loading DICOM…"
                : hasVolume
                  ? `${sliceCount} axial slices`
                  : "DICOM pending"}
            </span>
          </div>
        ) : (
          <label
            className={`group flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-all
            ${
              hasVolume
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "cursor-pointer border-border bg-muted hover:border-sky-500/50"
            }`}
          >
            <Layers
              className={`mb-1.5 h-5 w-5 ${
                hasVolume
                  ? "text-emerald-500"
                  : "text-muted-foreground group-hover:text-sky-500"
              }`}
            />
            <span className="text-xs font-medium text-foreground">
              {hasVolume ? "Series loaded" : "Load study folder"}
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={onFolderChange}
              disabled={dicomLoadStatus === "loading"}
              // @ts-expect-error directory upload
              webkitdirectory=""
            />
            <span className="mt-2 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {hasVolume ? `${sliceCount} slices` : "Select directory"}
            </span>
          </label>
        )}

        {dicomLoadStatus === "failed" && dicomLoadError && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            <Activity className="h-3 w-3 shrink-0 animate-pulse" />
            <span className="min-w-0">{dicomLoadError}</span>
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-ild-border bg-ild-card p-3">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Window
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              variant="outline"
              className={`h-8 rounded-md border-border text-[11px] transition-all ${
                windowPreset === key
                  ? "bg-sky-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-ild-card-hover"
              }`}
              onClick={() =>
                onWindowPresetChange(
                  key as WindowPresetKey,
                  preset.center,
                  preset.width,
                )
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-ild-border bg-ild-card p-3">
        <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <Layers className="h-3.5 w-3.5" /> Plane
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {(["axial", "coronal", "sagittal"] as const).map((plane) => (
            <Button
              key={plane}
              variant="outline"
              className={`h-8 rounded-md border-border text-[11px] capitalize transition-all ${
                orientation === plane
                  ? "bg-sky-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-ild-card-hover"
              }`}
              onClick={() => {
                onOrientationChange(plane);
                onResetSliceIndex();
              }}
              disabled={!hasVolume}
            >
              {plane}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

