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
  windowPreset,
  orientation,
  onFolderChange,
  onWindowPresetChange,
  onOrientationChange,
  onResetSliceIndex,
}: View2DLeftPanelProps) {
  const sliceCount = files?.length ?? 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6 overflow-y-auto pr-2">
      <section className="rounded-2xl border border-ild-border bg-ild-card p-5">
        <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Database className="h-4 w-4" /> Patient DICOM Stack
        </h3>
        {hasDicomInDb && !hasVolume && dicomLoadStatus === "loading" && (
          <div className="mb-3 animate-pulse rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[11px] font-medium text-blue-500">
            Fetching study from vault...
          </div>
        )}
        <label
          className={`group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all
          ${
            hasVolume
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "cursor-pointer border-border bg-muted hover:border-sky-500/50"
          }`}
        >
          <Layers
            className={`mb-3 h-8 w-8 ${
              hasVolume
                ? "text-emerald-500"
                : "text-muted-foreground group-hover:text-sky-500"
            }`}
          />
          <span className="text-sm font-medium text-foreground">
            {hasVolume ? "Series Loaded" : "Load Study Data"}
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
          <div className="mt-4 rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
            {hasVolume ? `${sliceCount} Slices Ready` : "Select Directory"}
          </div>
        </label>
        {dicomLoadStatus === "failed" && dicomLoadError && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
            <Activity className="h-3 w-3 animate-pulse" />
            {dicomLoadError}
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-ild-border bg-ild-card p-5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Activity className="h-4 w-4" /> Visualization Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(WINDOW_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              variant="outline"
              className={`h-9 rounded-lg border-border text-xs transition-all ${
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

      <section className="space-y-3 rounded-2xl border border-ild-border bg-ild-card p-5">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Layers className="h-4 w-4" /> Multi-Planar Reconstruction
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {(["axial", "coronal", "sagittal"] as const).map((plane) => (
            <Button
              key={plane}
              variant="outline"
              className={`h-10 rounded-lg border-border text-xs capitalize transition-all ${
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

