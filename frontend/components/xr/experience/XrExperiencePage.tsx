"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useXrStudyData } from "@/hooks/xr";
import { XR_SIDE_BY_SIDE } from "@/lib/xr/layout-constants";
import { XrExperienceCanvas } from "./XrExperienceCanvas";
import { XrExperienceChrome } from "./XrExperienceChrome";
import { useDicomPlayback } from "./use-dicom-playback";
import { useFullscreen } from "./use-fullscreen";
import { useImmersiveEntry } from "./use-immersive-entry";
import { useMeshClassPresets } from "./use-mesh-class-presets";
import { useXrSessionStore } from "./use-xr-session-store";
import { isMobileArDevice, type ArQualityPreset, type XrExperienceMode } from "./types";

type Props = { mode: XrExperienceMode };

export function XrExperiencePage({ mode }: Props) {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const studyId = searchParams.get("studyId");
  const fallbackMesh = searchParams.get("mesh");

  const [realLungEnabled, setRealLungEnabled] = useState(false);
  const [focusStackNonce, setFocusStackNonce] = useState(0);
  const [focusMeshNonce, setFocusMeshNonce] = useState(0);
  const [focusBalancedNonce, setFocusBalancedNonce] = useState(0);
  const [meshScale, setMeshScale] = useState<number>(XR_SIDE_BY_SIDE.defaultMeshScale);
  const [arQuality, setArQuality] = useState<ArQualityPreset>("balanced");
  const [vrSpawnNonce, setVrSpawnNonce] = useState(0);

  const study = useXrStudyData(studyId, fallbackMesh);
  const dicom = useDicomPlayback(study.dicomSliceCount, study.setCurrentDicomSlice);
  const presets = useMeshClassPresets();
  const isMobileAr = useMemo(() => (mode === "ar" ? isMobileArDevice() : false), [mode]);
  // Perf strips DICOM/hospital; GPU throttle can stay mild on mobile even when Bal shows 2D.
  const hideHeavyArAssets = mode === "ar" && arQuality === "performance";
  const arPerformanceMode =
    mode === "ar" && (arQuality === "performance" || (isMobileAr && arQuality !== "quality"));

  const session = useXrSessionStore(mode, {
    studyId,
    meshUrl: study.effectiveMeshUrl,
    dicomSlice: study.currentDicomSlice,
    skipHeavyAssets: hideHeavyArAssets,
  });
  const toggleFullscreen = useFullscreen(containerRef);
  const immersive = useImmersiveEntry({
    mode, store: session.store, isImmersiveSupported: session.isImmersiveSupported,
    isCheckingSupport: session.isCheckingSupport,
    unsupportedReason: session.unsupportedReason,
    studyId,
    effectiveMeshUrl: study.effectiveMeshUrl, currentDicomSlice: study.currentDicomSlice,
    onVrSpawn: () => setVrSpawnNonce((v) => v + 1),
  });

  const alternateLabHref = useMemo(() => {
    const otherPath = mode === "ar" ? "/xr/vr" : "/xr/ar";
    const q = new URLSearchParams(searchParams.toString()).toString();
    return q ? `${otherPath}?${q}` : otherPath;
  }, [mode, searchParams]);

  const handleResetView = () => {
    setMeshScale(XR_SIDE_BY_SIDE.defaultMeshScale);
    presets.applyAllOnPreset();
    setFocusBalancedNonce((v) => v + 1);
  };

  return (
    <div ref={containerRef} className="relative h-dvh min-h-dvh w-full overflow-hidden bg-transparent">
      <XrExperienceChrome
        mode={mode}
        isPresenting={session.isPresenting}
        studyId={studyId}
        syncConnected={study.syncConnected}
        metrics={study.metrics}
        xrError={immersive.xrError}
        meshError={study.meshError}
        isLoading={study.isLoading || (immersive.preparingImmersive && !session.isPresenting)}
        preparingImmersive={immersive.preparingImmersive}
        onExitImmersive={immersive.handleExitImmersive}
        alternateLabHref={alternateLabHref}
        isImmersiveSupported={session.isImmersiveSupported}
        isCheckingSupport={session.isCheckingSupport}
        unsupportedReason={session.unsupportedReason}
        meshClassVisibility={presets.meshClassVisibility}
        realLungEnabled={realLungEnabled}
        onFocusStack={() => setFocusStackNonce((v) => v + 1)}
        onFocusMesh={() => setFocusMeshNonce((v) => v + 1)}
        onBalancedView={() => setFocusBalancedNonce((v) => v + 1)}
        onZoomIn={() => setMeshScale((v) => Math.min(2.4, v + 0.12))}
        onZoomOut={() => setMeshScale((v) => Math.max(0.65, v - 0.12))}
        onPresetAll={presets.applyAllOnPreset}
        onPresetLesions={presets.applyLesionsOnlyPreset}
        onPresetShell={presets.applyShellOnlyPreset}
        onToggleMeshClass={presets.toggleMeshClass}
        onToggleRealLung={() => setRealLungEnabled((v) => !v)}
        onEnterImmersive={() => immersive.handleEnterImmersive(() => setFocusBalancedNonce((v) => v + 1))}
        onToggleFullscreen={toggleFullscreen}
      />
      <XrExperienceCanvas
        mode={mode}
        store={session.store}
        arPerformanceMode={arPerformanceMode}
        arQuality={arQuality}
        onExitImmersive={immersive.handleExitImmersive}
        scene={{
          meshUrl: study.effectiveMeshUrl,
          useMeshPlaceholder: study.useMeshPlaceholder,
          realLungEnabled,
          onToggleRealLung: () => setRealLungEnabled((v) => !v),
          studyId,
          dicomSliceCount: study.dicomSliceCount,
          currentDicomSlice: study.currentDicomSlice,
          setCurrentDicomSlice: study.setCurrentDicomSlice,
          focusStackNonce,
          focusMeshNonce,
          focusBalancedNonce,
          meshScale,
          meshClassVisibility: presets.meshClassVisibility,
          onResetView: handleResetView,
          applyAllOnPreset: presets.applyAllOnPreset,
          applyLesionsOnlyPreset: presets.applyLesionsOnlyPreset,
          applyShellOnlyPreset: presets.applyShellOnlyPreset,
          toggleMeshClass: presets.toggleMeshClass,
          setMeshScale,
          arQuality,
          setArQuality,
          syncConnected: study.syncConnected,
          isDicomPlaying: dicom.isDicomPlaying,
          toggleDicomPlayback: dicom.toggleDicomPlayback,
          pauseDicomPlayback: dicom.pauseDicomPlayback,
          vrSpawnNonce,
        }}
      />
    </div>
  );
}
