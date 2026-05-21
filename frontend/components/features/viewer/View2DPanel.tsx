"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createNotification } from "@/api/clients";
import { studyService, type DicomVolumeShape } from "@/services/study";
import { patientService } from "@/services/patient";
import { useSettings } from "@/hooks/settings";
import { useDicomLoader, useMaskProcessor } from "@/hooks/viewer";
import type { Study } from "@/api/domain";
import { useStudyMetrics } from "@/hooks/studies";
import { buildSegmentationMetricGroups } from "@/lib/metrics/segmentation-metric-groups";

// View Sub-components
import { View2DPanelLeftColumn } from "@/components/features/viewer/component/view2d/View2DPanelLeftColumn";
import { View2DPanelCenterColumn } from "@/components/features/viewer/component/view2d/View2DPanelCenterColumn";
import { View2DPanelRightColumn } from "@/components/features/viewer/component/view2d/View2DPanelRightColumn";
import { SegmentationClassLegend } from "@/components/features/viewer/component/ui/SegmentationClassLegend";

const WINDOW_PRESETS = {
  lung_ai: { label: "Lung", center: -600, width: 1500 },
  bone: { label: "Bone", center: 400, width: 1800 },
  mediastinum: { label: "Mediastinum", center: 40, width: 400 },
  soft_tissue: { label: "Soft Tissue", center: 50, width: 350 },
} as const;

type WindowPresetKey = keyof typeof WINDOW_PRESETS;
type Orientation = "axial" | "coronal" | "sagittal";

export function View2DPanel() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();

  // --- 1. VIEWPORT STATE ---
  const [windowPreset, setWindowPreset] = useState<WindowPresetKey>("lung_ai");
  const [windowCenter, setWindowCenter] = useState<number>(WINDOW_PRESETS.lung_ai.center);
  const [windowWidth, setWindowWidth] = useState<number>(WINDOW_PRESETS.lung_ai.width);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);
  const [orientation, setOrientation] = useState<Orientation>("axial");
  const [sliceIndex, setSliceIndex] = useState(0);
  const [viewerMode] = useState<"png">("png"); // Force PNG mode only, DICOM3D disabled

  // --- 2. DATA LOADING STATE ---
  const patientId = searchParams.get("patientId") ?? "";
  const studyIdParam = searchParams.get("studyId");
  const [studyIdFromPatient, setStudyIdFromPatient] = useState<string | null>(null);
  const [hasDicomInDb, setHasDicomInDb] = useState(false);
  const studyId = studyIdParam || studyIdFromPatient;

  useEffect(() => {
    if (studyIdParam) {
      setStudyIdFromPatient(null);
      return;
    }
    if (!patientId) {
      setStudyIdFromPatient(null);
      return;
    }
    let cancelled = false;
    studyService
      .getList()
      .then((list) => {
        if (cancelled) return;
        const forPatient = list.filter((s) => s.patient_id === patientId);
        if (forPatient.length === 0) {
          setStudyIdFromPatient(null);
          return;
        }
        forPatient.sort((a, b) => {
          const da = a.acquisition_date ? Date.parse(a.acquisition_date) : 0;
          const db = b.acquisition_date ? Date.parse(b.acquisition_date) : 0;
          return db - da;
        });
        setStudyIdFromPatient(forPatient[0].study_id);
      })
      .catch(() => {
        if (!cancelled) setStudyIdFromPatient(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studyIdParam, patientId]);

  // DICOM & Mask Data Hooks
  const { files, status: dicomLoadStatus, error: dicomLoadError } = useDicomLoader(studyId, Boolean(studyId));
  const { data: metrics, isLoading: metricsLoading } = useStudyMetrics(studyId || undefined);

  const [rawMask, setRawMask] = useState<Uint8Array | null>(null);
  const [rawMaskShape, setRawMaskShape] = useState<[number, number, number] | null>(null);
  const [maskLoadError, setMaskLoadError] = useState<string | null>(null);

  const { slices: segmentationMask, shape: maskShape, maxDiseaseSliceIndex } = useMaskProcessor(rawMask, rawMaskShape);

  // UI Error/Loading states
  const [overlayImageError, setOverlayImageError] = useState(false);
  const [reanalyzeLoading, setReanalyzeLoading] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [maskReloadToken, setMaskReloadToken] = useState(0);
  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const [meshLoading, setMeshLoading] = useState(false);
  /** Native grid from server; needed when DICOM ZIP is unavailable but `/slices/{z}` works. */
  const [serverVolumeShape, setServerVolumeShape] = useState<DicomVolumeShape | null>(null);

  useEffect(() => {
    if (!studyId) {
      setServerVolumeShape(null);
      return;
    }
    let cancelled = false;
    studyService
      .getDicomVolumeShape(studyId)
      .then((shape) => {
        if (!cancelled) setServerVolumeShape(shape);
      })
      .catch(() => {
        if (!cancelled) setServerVolumeShape(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  // --- 3. CLINICAL LOGIC: COORDINATE SYNC ---
  // Calculate depth based on orientation and data shape
  const volumeDepth = useMemo(() => {
    const serverD = serverVolumeShape?.depth ?? 0;
    const fileCount = files?.length ?? 0;
    const maskD = maskShape?.[0] ?? 0;

    if (orientation === "axial") {
      if (serverD > 0) return serverD;
      if (fileCount > 0) return fileCount;
      if (maskD > 0) return maskD;
      return 0;
    }
    if (orientation === "coronal" || orientation === "sagittal") {
      if (maskShape) {
        if (orientation === "coronal") return maskShape[1];
        return maskShape[2];
      }
      if (serverVolumeShape) {
        if (orientation === "coronal") return serverVolumeShape.height;
        return serverVolumeShape.width;
      }
      return 512;
    }
    return 0;
  }, [files, orientation, maskShape, serverVolumeShape]);

  // Ensure slice index stays valid when changing orientation
  useEffect(() => {
    if (sliceIndex >= volumeDepth) {
      setSliceIndex(Math.floor(volumeDepth / 2));
    }
  }, [orientation, volumeDepth]);

  // Initial Disease Focus: Jump to the slice where ILD is most prominent
  useEffect(() => {
    if (maxDiseaseSliceIndex != null && maxDiseaseSliceIndex >= 0) {
      setSliceIndex(maxDiseaseSliceIndex);
    } else if (files && files.length > 0) {
      setSliceIndex(Math.floor(files.length / 2));
    }
  }, [maxDiseaseSliceIndex, files?.length]);

  // --- 4. API INTEGRATION ---
  useEffect(() => {
    if (!studyId) return;
    setMaskLoadError(null);
    studyService
      .getMask(studyId)
      .then(({ shape, data }) => {
        setRawMask(data);
        setRawMaskShape(shape as [number, number, number]);
      })
      .catch((err) => setMaskLoadError(String(err?.message ?? err)));
  }, [studyId, maskReloadToken]);

  const metricGroups = useMemo(
    () => buildSegmentationMetricGroups(metrics),
    [metrics],
  );

  const onRunAiAgain = async () => {
    if (!studyId) return;
    setReanalyzeError(null);
    setReanalyzeLoading(true);
    const toastId = toast.loading("Running AI analysis…");
    try {
      await studyService.runAiAnalysis(studyId);
      await queryClient.invalidateQueries({
        queryKey: ["studies", "metrics", studyId],
      });
      await queryClient.invalidateQueries({ queryKey: ["studies"] });
      setMaskReloadToken((t) => t + 1);
      await createNotification({
        title: "AI analysis complete",
        message: `Study ${studyId} mask and metrics were updated.`,
        type: "analysis",
      }).catch(() => undefined);
      toast.success("AI analysis complete. Mask and metrics were updated.", {
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SegmentationClassLegend compact />
      <div className="flex min-h-[60dvh] flex-1 flex-col gap-4 overflow-hidden rounded-xl bg-background p-3 md:min-h-[420px] md:flex-row md:gap-6 md:p-4">
        <View2DPanelLeftColumn
          files={files}
          dicomLoadStatus={dicomLoadStatus}
          dicomLoadError={dicomLoadError}
          hasDicomInDb={hasDicomInDb}
          hasVolume={!!(files && files.length > 0)}
          windowPreset={windowPreset}
          orientation={orientation}
          onWindowPresetChange={(key, center, width) => {
            setWindowPreset(key as WindowPresetKey);
            setWindowCenter(center);
            setWindowWidth(width);
          }}
          onOrientationChange={setOrientation}
          onResetSliceIndex={() => setSliceIndex(0)}
          onFolderChange={() => {}} // Managed by hook
        />

        <View2DPanelCenterColumn
          studyId={studyId}
          files={files}
          windowCenter={windowCenter}
          windowWidth={windowWidth}
          showOverlay={showOverlay}
          setShowOverlay={setShowOverlay}
          overlayOpacity={overlayOpacity}
          setOverlayOpacity={setOverlayOpacity}
          orientation={orientation}
          sliceIndex={sliceIndex}
          setSliceIndex={setSliceIndex}
          segmentationMask={segmentationMask}
          maskShape={maskShape}
          dicomLoadStatus={dicomLoadStatus}
          viewerMode={viewerMode}
          maskLoadError={maskLoadError}
          overlayImageError={overlayImageError}
          setOverlayImageError={setOverlayImageError}
          dicomLoadError={null}
          metricsError={null}
          meshUrl={null}
          meshLoading={false}
          volumeDepth={volumeDepth}
        />

        <View2DPanelRightColumn
          metricGroups={metricGroups}
          metricsLoading={metricsLoading}
          reanalyzeLoading={reanalyzeLoading}
          canReanalyze={Boolean(studyId && dicomLoadStatus === "loaded")}
          onRunAiAgain={onRunAiAgain}
          viewerMode={viewerMode}
          onViewerModeChange={() => {}}
          reanalyzeError={reanalyzeError}
          studyId={studyId}
          patientId={patientId}
          viewContext="2d"
        />
      </div>
    </div>
  );
}