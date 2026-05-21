import { Activity, Box, UploadCloud, Layers, Scan, FileStack, Sparkles } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import type { Patient } from "@/api/types";
import { cn } from "@/lib/utils";

type UploadImagingSectionProps = {
  dicomOnly?: boolean;
  secondaryButtonLabel?: string;
  uploadMode: "dicom" | "zip";
  hasCompletedStudyForPatient: boolean;
  hasVolume: boolean;
  files: File[] | null;
  zipFile: File | null;
  loading: boolean;
  uploadProgress: { step: string; percentage: number } | null;
  isNewPatient: boolean;
  newPatientName: string;
  selectedPatient?: Patient;
  patientId: string;
  segmentationPresent: boolean;
  onUploadModeChange: (mode: "dicom" | "zip") => void;
  onFilesChange: (files: File[] | null) => void;
  onZipFileChange: (file: File | null) => void;
  onRunSegmentation: () => void;
  onOpen2DViewer: () => void;
  primaryActionLabel?: string;
  error: string | null;
};

export function UploadImagingSection({
  dicomOnly = false,
  secondaryButtonLabel = "2D Viewer",
  uploadMode,
  hasCompletedStudyForPatient,
  hasVolume,
  files,
  zipFile,
  loading,
  uploadProgress,
  isNewPatient,
  newPatientName,
  selectedPatient,
  patientId,
  segmentationPresent,
  onUploadModeChange,
  onFilesChange,
  onZipFileChange,
  onRunSegmentation,
  onOpen2DViewer,
  primaryActionLabel = "RUN AI ANALYSIS",
  error,
}: UploadImagingSectionProps) {
  const canRunSegmentation =
    !loading &&
    (hasVolume || !!zipFile) &&
    (isNewPatient ? newPatientName.trim().length > 0 : !!selectedPatient) &&
    !hasCompletedStudyForPatient;

  const canOpen2DViewer =
    !!patientId && (segmentationPresent || !!selectedPatient);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "Enter" && canRunSegmentation) {
        e.preventDefault();
        onRunSegmentation();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRunSegmentation, onRunSegmentation]);

  return (
    <div className="group relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-ild-border bg-ild-card shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_100%_0%,rgba(6,182,212,0.08),transparent_50%)]"
        aria-hidden
      />

      <div className="relative border-b border-border/50 px-5 py-4 sm:px-6">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15 text-[10px] font-bold text-cyan-400"
              aria-hidden
            >
              2
            </span>
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-500">
              <Scan className="h-3.5 w-3.5" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {dicomOnly ? "DICOM" : "Imaging"}
                <span className="ml-1.5 text-destructive" aria-label="required">
                  *
                </span>
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {dicomOnly
                  ? "Axial chest CT — folder of slices."
                  : "DICOM folder or a .zip archive."}
              </p>
            </div>
          </div>

          {dicomOnly ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
              <FileStack className="h-3.5 w-3.5" />
              DICOM
            </div>
          ) : (
            <div
              className="flex rounded-full border border-border/80 bg-muted/30 p-1"
              role="group"
              aria-label="File source type"
            >
              <button
                type="button"
                onClick={() => onUploadModeChange("dicom")}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[10px] font-bold transition-all",
                  uploadMode === "dicom"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Folder
              </button>
              <button
                type="button"
                onClick={() => onUploadModeChange("zip")}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[10px] font-bold transition-all",
                  uploadMode === "zip"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                ZIP
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative space-y-5 p-5 sm:px-6 sm:py-6">
        <div
          className={cn(
            "relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-4 py-10 transition-[border-color,background,opacity]",
            "bg-[length:20px_20px] [background-image:radial-gradient(circle_at_center,rgba(100,116,139,0.12)_0.5px,transparent_0.5px)]",
            hasCompletedStudyForPatient
              ? "pointer-events-none cursor-not-allowed border-border/30 opacity-50"
              : "border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.04] to-background/40 hover:border-cyan-500/40 hover:bg-cyan-500/[0.06]"
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 flex justify-center [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
            aria-hidden
          >
            <div className="h-full w-[120%] -translate-y-1/2 bg-gradient-to-b from-cyan-400/5 to-transparent" />
          </div>

          <div className="relative flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 shadow-inner">
              <UploadCloud className="h-8 w-8" strokeWidth={1.25} />
            </div>
            <p className="text-sm font-semibold text-foreground">Drop or browse</p>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {uploadMode === "dicom" ? (
                <>
                  <span className="text-foreground/80">Browse</span> for a slice folder (top level
                  in some browsers).
                </>
              ) : (
                "One .zip per study."
              )}
            </p>

            <label
              className={cn(
                "mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-sky-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/15 transition-transform",
                hasCompletedStudyForPatient
                  ? "cursor-not-allowed opacity-50"
                  : "hover:from-cyan-500 hover:to-sky-500 active:scale-[0.98]"
              )}
            >
              {uploadMode === "dicom" ? (
                <>
                  <FileStack className="h-4 w-4 opacity-90" />
                  Browse
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4 opacity-90" />
                  Select ZIP
                </>
              )}
              <input
                type="file"
                className="hidden"
                multiple={uploadMode === "dicom"}
                accept={uploadMode === "dicom" ? ".dcm,.dicom" : ".zip"}
                disabled={hasCompletedStudyForPatient}
                // @ts-ignore — directory picker (non-standard)
                webkitdirectory={uploadMode === "dicom" ? "" : undefined}
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  if (uploadMode === "dicom") {
                    const dicomFiles = list.filter(
                      (f) =>
                        f.name.toLowerCase().endsWith(".dcm") ||
                        f.name.toLowerCase().endsWith(".dicom") ||
                        !f.name.includes("."),
                    );
                    if (dicomFiles.length === 0 && list.length > 0) {
                      alert("No DICOM files detected. Please select a folder containing .dcm files.");
                      return;
                    }
                    if (dicomFiles.length < 10) {
                      const ok = window.confirm(
                        `Only ${dicomFiles.length} DICOM slices detected. CT scans typically have 20–500+ slices. Continue anyway?`,
                      );
                      if (!ok) return;
                    }
                    onFilesChange(dicomFiles.length ? dicomFiles : null);
                  } else {
                    const file = list[0];
                    if (file && !file.name.toLowerCase().endsWith(".zip")) {
                      alert("Please select a valid ZIP file.");
                      return;
                    }
                    onZipFileChange(file ?? null);
                  }
                }}
              />
            </label>

            {(hasVolume || zipFile) && !hasCompletedStudyForPatient && (
              <p className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-cyan-600/90 dark:text-cyan-300/80">
                <Sparkles className="h-3.5 w-3.5" />
                Ready to run AI.
              </p>
            )}
          </div>

        {(hasVolume || zipFile) && (
            <div className="mt-2 flex w-full max-w-md items-center justify-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.1] py-1.5 text-[11px] font-semibold text-emerald-200">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                <Box className="h-3 w-3" />
              </span>
            {uploadMode === "dicom" ? (
              <span>
                {(files?.length ?? 0) === 0
                  ? "0 slices"
                  : `${files?.length} slice${(files?.length ?? 0) === 1 ? "" : "s"}`}
              </span>
            ) : (
              <span className="truncate px-1">{zipFile?.name}</span>
            )}
          </div>
        )}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
          <Button
            onClick={onRunSegmentation}
            disabled={!canRunSegmentation}
            className={cn(
              "h-12 flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 font-bold text-white shadow-md shadow-cyan-500/10 hover:from-cyan-500 hover:to-sky-500",
              hasCompletedStudyForPatient && "pointer-events-none opacity-50"
            )}
          >
            {loading && uploadProgress ? (
              <span className="flex items-center justify-center gap-2">
                <Activity className="h-4 w-4 animate-spin" />
                <span className="tabular-nums">{uploadProgress.percentage}%</span>
                <span className="hidden sm:inline">— {uploadProgress.step}</span>
              </span>
            ) : loading ? (
              <Activity className="h-4 w-4 animate-spin" />
            ) : (
              primaryActionLabel
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl border-border/80 bg-background/40 px-6"
            disabled={!canOpen2DViewer}
            onClick={onOpen2DViewer}
          >
            <Layers className="mr-2 h-4 w-4" /> {secondaryButtonLabel}
          </Button>
        </div>

        {hasCompletedStudyForPatient && (
          <p className="text-center text-[11px] font-medium leading-relaxed text-amber-500">
            This patient already has a study here. Use 2D/3D viewers, or you may create a duplicate.
          </p>
        )}

        {!loading && !hasCompletedStudyForPatient && (hasVolume || zipFile) && (
          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">Ctrl</span>
            <span>+</span>
            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">Enter</span>
            <span>Run AI</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive">
            <span
              className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
              aria-hidden
            />
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
