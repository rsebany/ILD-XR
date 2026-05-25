"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createNotification } from "@/api/clients";

import { studyService, type DicomVolumeShape } from "@/services/study";
import {
  ThreeViewer,
  DEFAULT_MESH_CLASS_VISIBILITY,
  type MeshClassKey,
  type MeshClassVisibility,
} from "@/components/features/viewer/xr/viewers/ThreeViewer";
import { imagingContextFromSearchParams, imagingContextQuery } from "@/lib/imaging";
import { buildSegmentationMetricGroups } from "@/lib/metrics/segmentation-metric-groups";
import { useVolumeDisplayUnit } from "@/hooks/settings";
import { useStudyMetrics } from "@/hooks/studies";
import {
  useDicomLoader,
  useResolvedStudyId,
  useViewerCaseContext,
} from "@/hooks/viewer";
import { View2DPanelLeftColumn } from "@/components/features/viewer/view2d/View2DPanelLeftColumn";
import { View2DPanelRightColumn } from "@/components/features/viewer/view2d/View2DPanelRightColumn";
import { Switch } from "@/components/ui/switch";

const WINDOW_PRESETS = {
  lung_ai: { label: "Lung", center: -600, width: 1500 },
  bone: { label: "Bone", center: 400, width: 1800 },
  mediastinum: { label: "Mediastinum", center: 40, width: 400 },
  soft_tissue: { label: "Soft Tissue", center: 50, width: 350 },
} as const;

type WindowPresetKey = keyof typeof WINDOW_PRESETS;
type Orientation = "axial" | "coronal" | "sagittal";
type LungRenderMode = "semi" | "real";

export function View3DReconstructionPanel() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { patientId, studyId: studyIdParam } = imagingContextFromSearchParams(searchParams);
  const meshFallback = searchParams.get("mesh");

  const studyId = useResolvedStudyId({ studyIdParam, patientId });
  const ctx = imagingContextQuery({ patientId, studyId: studyId || null });

  const [windowPreset, setWindowPreset] = useState<WindowPresetKey>("lung_ai");
  const [windowCenter, setWindowCenter] = useState<number>(WINDOW_PRESETS.lung_ai.center);
  const [windowWidth, setWindowWidth] = useState<number>(WINDOW_PRESETS.lung_ai.width);
  const [orientation, setOrientation] = useState<Orientation>("axial");
  const [viewerMode] = useState<"png">("png");
  const [reanalyzeLoading, setReanalyzeLoading] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [meshReloadToken, setMeshReloadToken] = useState(0);
  /** On by default so the marching-cubes GLB (same asset as XR lab) is visible, including in WebXR. */
  const [showAiMesh, setShowAiMesh] = useState(true);
  const [hasSegmentationMesh, setHasSegmentationMesh] = useState(false);
  const [classVisibility, setClassVisibility] = useState<Required<MeshClassVisibility>>(
    DEFAULT_MESH_CLASS_VISIBILITY,
  );
  const [showCtVolume, setShowCtVolume] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [lungRenderMode, setLungRenderMode] = useState<LungRenderMode>("semi");
  const [volumeShape, setVolumeShape] = useState<DicomVolumeShape | null>(null);
  const [volumeShapeLoading, setVolumeShapeLoading] = useState(false);

  const toggleClass = (key: MeshClassKey) =>
    setClassVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  const { files, status: dicomLoadStatus, error: dicomLoadError } = useDicomLoader(
    studyId,
    Boolean(studyId),
  );
  const { data: metrics, isLoading: metricsLoading } = useStudyMetrics(studyId || undefined);
  const { patientName, studyLine } = useViewerCaseContext(studyId, patientId || null);

  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId) {
      setMeshUrl(meshFallback);
      setError(null);
      setLoading(false);
      setHasSegmentationMesh(!!(meshFallback && String(meshFallback).length > 0));
      return;
    }
    setLoading(true);
    setError(null);
    studyService
      .getMeshUrl(studyId)
      .then((url) => {
        const u = (url || meshFallback || "").trim();
        setMeshUrl(url || meshFallback);
        setHasSegmentationMesh(u.length > 0);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load mesh.");
        setMeshUrl(meshFallback);
        setHasSegmentationMesh(!!(meshFallback && String(meshFallback).trim().length > 0));
      })
      .finally(() => setLoading(false));
  }, [studyId, meshFallback, meshReloadToken]);

  useEffect(() => {
    setFlipVertical(false);
  }, [studyId]);

  useEffect(() => {
    if (!studyId) {
      setVolumeShape(null);
      setShowCtVolume(false);
      return;
    }
    let cancelled = false;
    setVolumeShapeLoading(true);
    studyService
      .getDicomVolumeShape(studyId)
      .then((shape) => {
        if (!cancelled) setVolumeShape(shape);
      })
      .catch(() => {
        if (!cancelled) setVolumeShape(null);
      })
      .finally(() => {
        if (!cancelled) setVolumeShapeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  useEffect(() => {
    if (hasSegmentationMesh) {
      setShowAiMesh(true);
    } else {
      setShowAiMesh(false);
    }
  }, [hasSegmentationMesh]);

  const volumeDisplayUnit = useVolumeDisplayUnit();
  const metricGroups = useMemo(
    () => buildSegmentationMetricGroups(metrics, volumeDisplayUnit),
    [metrics, volumeDisplayUnit],
  );

  const resolvedUrl = meshUrl || meshFallback;
  const usePlaceholder = !resolvedUrl;

  const showMeshInViewer = showAiMesh && hasSegmentationMesh;
  const meshUrlForViewer = (meshUrl || meshFallback || "").trim();

  const axialCount = volumeShape?.depth ?? 0;
  const dicomContext3d =
    showCtVolume && studyId && axialCount > 0
      ? {
          studyId,
          maxSlices: axialCount,
          currentSlice: Math.floor(axialCount / 2),
        }
      : null;
  const dicomSpacingMm = volumeShape
    ? {
        z: volumeShape.spacing_z_mm,
        y: volumeShape.spacing_y_mm,
        x: volumeShape.spacing_x_mm,
      }
    : null;
  const dicomVoxelCount = volumeShape
    ? {
        depth: volumeShape.depth,
        height: volumeShape.height,
        width: volumeShape.width,
      }
    : null;
  const canShowCtVolume = Boolean(studyId && axialCount > 0);
  const meshVisualPreset =
    lungRenderMode === "real" ? "anatomicalLung" : "anatomicalSemi";

  const onRunAiAgain = async () => {
    if (!studyId) return;
    setReanalyzeError(null);
    setReanalyzeLoading(true);
    const toastId = toast.loading("Running AI analysis…");
    try {
      await studyService.runAiAnalysis(studyId);
      await queryClient.invalidateQueries({ queryKey: ["studies", "metrics", studyId] });
      await queryClient.invalidateQueries({ queryKey: ["studies"] });
      setShowAiMesh(true);
      setMeshReloadToken((t) => t + 1);
      await createNotification({
        title: "AI analysis complete",
        message: `Study ${studyId} mesh and metrics were updated.`,
        type: "analysis",
      }).catch(() => undefined);
      toast.success("AI analysis complete. Mesh and metrics were updated.", {
        id: toastId,
      });
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "AI analysis failed.";
      setReanalyzeError(msg);
      await createNotification({
        title: "AI analysis failed",
        message: msg,
        type: "analysis",
      }).catch(() => undefined);
      toast.error(msg, { id: toastId });
    } finally {
      setReanalyzeLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-0">
      {!studyId && !meshFallback && (
        <p className="px-1 text-xs text-amber-600 dark:text-amber-400">
          No study in the URL and no <code className="rounded bg-muted px-1">?mesh=</code> — add{" "}
          <code className="rounded bg-muted px-1">?studyId=</code> or open a case from{" "}
          <Link href="/upload-dicom" className="font-semibold underline-offset-4 hover:underline">
            Upload DICOM
          </Link>
          .
        </p>
      )}

      {error && (
        <p className="px-1 text-xs text-amber-600 dark:text-amber-400">
          {error} {usePlaceholder ? "(placeholder shape shown.)" : ""}
        </p>
      )}

      <div className="flex min-h-[60dvh] flex-1 flex-col gap-4 overflow-hidden rounded-xl bg-background p-3 md:min-h-[360px] md:flex-row md:gap-6 md:p-4">
        <View2DPanelLeftColumn
          files={files}
          dicomLoadStatus={dicomLoadStatus}
          dicomLoadError={dicomLoadError}
          hasDicomInDb={Boolean(studyId)}
          hasVolume={!!(files && files.length > 0)}
          patientName={patientName}
          studyLine={studyLine}
          windowPreset={windowPreset}
          orientation={orientation}
          onWindowPresetChange={(key, center, width) => {
            setWindowPreset(key as WindowPresetKey);
            setWindowCenter(center);
            setWindowWidth(width);
          }}
          onOrientationChange={setOrientation}
          onResetSliceIndex={() => {}}
          onFolderChange={() => {}}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                3D reconstruction
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div
                className={`flex shrink-0 items-center gap-3 rounded-xl border border-ild-border bg-ild-card px-3 py-2 ${
                  !canShowCtVolume ? "opacity-50" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">3D CT volume</span>
                  <span className="text-xs text-muted-foreground">
                    {volumeShapeLoading
                      ? "Loading shape…"
                      : canShowCtVolume
                        ? "Axial stack with lung-true proportions"
                        : "Needs DICOM on server"}
                  </span>
                </div>
                <Switch
                  checked={showCtVolume}
                  onCheckedChange={setShowCtVolume}
                  disabled={!canShowCtVolume || volumeShapeLoading}
                  aria-label="Show 3D CT volume stack"
                />
              </div>
              <div
                className={`flex shrink-0 items-center gap-3 rounded-xl border border-ild-border bg-ild-card px-3 py-2 ${
                  !studyId ? "opacity-50" : ""
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">AI lung surface</span>
                  <span className="text-xs text-muted-foreground">
                    {loading
                      ? "Checking mesh…"
                      : hasSegmentationMesh
                        ? "GLB from segmentation"
                        : "Run AI analysis (right) to enable"}
                  </span>
                </div>
                <Switch
                  checked={showAiMesh}
                  onCheckedChange={setShowAiMesh}
                  disabled={!hasSegmentationMesh || loading}
                  aria-label="Show AI lung mesh in 3D"
                />
              </div>
              <div
                className={`flex shrink-0 items-center gap-2 rounded-xl border border-ild-border bg-ild-card px-2 py-2 ${
                  !showMeshInViewer ? "opacity-60" : ""
                }`}
              >
                <span className="px-1 text-xs font-medium text-foreground">Lung style</span>
                <button
                  type="button"
                  onClick={() => setLungRenderMode("semi")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    lungRenderMode === "semi"
                      ? "bg-sky-600 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={lungRenderMode === "semi"}
                  title="Transparent shell with visible lesions inside (WebXR-like)"
                >
                  Semi-transparent
                </button>
                <button
                  type="button"
                  onClick={() => setLungRenderMode("real")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    lungRenderMode === "real"
                      ? "bg-sky-600 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={lungRenderMode === "real"}
                  title="Opaque realistic lung tissue"
                >
                  Real lung
                </button>
              </div>
            </div>
          </div>
          {hasSegmentationMesh && showAiMesh && (
            <ClassVisibilityToggles
              visibility={classVisibility}
              onToggle={toggleClass}
            />
          )}

          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-xl border border-border bg-[#020617] shadow-inner md:min-h-[300px]">
            <ThreeViewer
              meshUrl={meshUrlForViewer}
              usePlaceholder={usePlaceholder}
              showMesh={showMeshInViewer}
              visualPreset={meshVisualPreset}
              classVisibility={classVisibility}
              dicomContext={dicomContext3d}
              dicomSpacingMm={dicomSpacingMm}
              dicomVoxelCount={dicomVoxelCount}
              dicomIncludeOverlay={false}
              dicomMaxStackSlices={160}
              flipVertical={flipVertical}
              onFlipVertical={() => setFlipVertical((v) => !v)}
            />
          </div>

        </div>

        <View2DPanelRightColumn
          metricGroups={metricGroups}
          metricsLoading={metricsLoading}
          reanalyzeError={reanalyzeError}
          canReanalyze={Boolean(studyId && dicomLoadStatus === "loaded")}
          reanalyzeLoading={reanalyzeLoading}
          onRunAiAgain={onRunAiAgain}
          viewerMode={viewerMode}
          onViewerModeChange={() => {}}
          studyId={studyId}
          patientId={patientId}
          viewContext="3d"
        />
      </div>
    </div>
  );
}

const CLASS_TOGGLE_META: Record<MeshClassKey, { label: string; swatch: string }> = {
  ggo: { label: "GGO", swatch: "bg-[#66CC66]" },
  reticulation: { label: "Reticulation", swatch: "bg-[#2B77FF]" },
  consolidation: { label: "Consolidation", swatch: "bg-[#FFE640]" },
  lung_shell: { label: "Lung", swatch: "bg-rose-400" },
};

function ClassVisibilityToggles({
  visibility,
  onToggle,
}: {
  visibility: Required<MeshClassVisibility>;
  onToggle: (key: MeshClassKey) => void;
}) {
  const order: MeshClassKey[] = ["ggo", "reticulation", "consolidation", "lung_shell"];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
      <span className="shrink-0 pr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Show classes
      </span>
      {order.map((key) => {
        const meta = CLASS_TOGGLE_META[key];
        const active = visibility[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "border-border bg-background text-foreground"
                : "border-border/60 bg-muted/40 text-muted-foreground line-through opacity-70 hover:opacity-100"
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.swatch}`} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
