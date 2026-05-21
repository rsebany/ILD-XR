"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import * as THREE from "three";
import { XrLocomotionRig } from "./xr-locomotion-rig";
import { XRSceneContent } from "./xr-scene-content";
import { XR_SIDE_BY_SIDE, xrPreviewCameraPose } from "./xr-layout";
import { preloadXrSessionAssets } from "./xr-preload";
import {
  XrBottomToolbar,
} from "./xr-bottom-toolbar";
import { XrLabHeader } from "./xr-lab-header";
import { XrMetricsPanel } from "./xr-metrics-panel";
import { XrStatusOverlays } from "./xr-status-overlays";
import { useWebXrSessionSupport, useXrStudyData } from "@/hooks/xr";

export type XrExperienceMode = "vr" | "ar";
export type ArQualityPreset = "performance" | "balanced" | "quality";
type MeshClassKey = "ggo" | "reticulation" | "consolidation" | "lung_shell";
type MeshClassVisibility = Record<MeshClassKey, boolean>;
const DEFAULT_MESH_CLASS_VISIBILITY: MeshClassVisibility = {
  ggo: true,
  reticulation: true,
  consolidation: true,
  lung_shell: true,
};

type Props = {
  mode: XrExperienceMode;
};

export function XrExperiencePage({ mode }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const studyId = searchParams.get("studyId");
  const fallbackMesh = searchParams.get("mesh");

  const [clippingValue] = useState(0);
  const [xrError, setXrError] = useState<string | null>(null);
  const [focusStackNonce, setFocusStackNonce] = useState(0);
  const [focusMeshNonce, setFocusMeshNonce] = useState(0);
  const [focusBalancedNonce, setFocusBalancedNonce] = useState(0);
  const [meshScale, setMeshScale] = useState<number>(XR_SIDE_BY_SIDE.defaultMeshScale);
  const [arQuality, setArQuality] = useState<ArQualityPreset>("performance");
  const [isDicomPlaying, setIsDicomPlaying] = useState(false);
  const [preparingImmersive, setPreparingImmersive] = useState(false);
  const [vrSpawnNonce, setVrSpawnNonce] = useState(0);
  const [meshClassVisibility, setMeshClassVisibility] = useState<MeshClassVisibility>(
    DEFAULT_MESH_CLASS_VISIBILITY,
  );
  const {
    meshError,
    isLoading,
    metrics,
    meshLoadSuccess,
    dicomSliceCount,
    currentDicomSlice,
    setCurrentDicomSlice,
    syncConnected,
    effectiveMeshUrl,
    useMeshPlaceholder,
  } = useXrStudyData(studyId, fallbackMesh);
  const pauseDicomPlayback = useCallback(() => {
    setIsDicomPlaying(false);
  }, []);
  const toggleDicomPlayback = useCallback(() => {
    setIsDicomPlaying((prev) => !prev);
  }, []);

  useEffect(() => {
    if (dicomSliceCount <= 1 && isDicomPlaying) {
      setIsDicomPlaying(false);
    }
  }, [dicomSliceCount, isDicomPlaying]);

  useEffect(() => {
    if (!isDicomPlaying || dicomSliceCount <= 1) return;
    const timer = window.setInterval(() => {
      setCurrentDicomSlice((prev) => (prev + 1) % dicomSliceCount);
    }, 170);
    return () => {
      window.clearInterval(timer);
    };
  }, [dicomSliceCount, isDicomPlaying, setCurrentDicomSlice]);

  const sessionMode = mode === "ar" ? "immersive-ar" : "immersive-vr";
  const isImmersiveSupported = useWebXrSessionSupport(sessionMode);
  // Same store options for AR and VR so immersive sessions behave consistently.
  const store = useMemo(
    () =>
      createXRStore({
        offerSession: false,
      }),
    [mode],
  );
  const applyAllOnPreset = () => setMeshClassVisibility(DEFAULT_MESH_CLASS_VISIBILITY);
  const applyLesionsOnlyPreset = () =>
    setMeshClassVisibility({
      ggo: true,
      reticulation: true,
      consolidation: true,
      // Keep shell visible in XR so lesions stay spatially anchored to anatomy.
      lung_shell: true,
    });
  const applyShellOnlyPreset = () =>
    setMeshClassVisibility({
      ggo: false,
      reticulation: false,
      consolidation: false,
      lung_shell: true,
    });
  const handleResetView = () => {
    setMeshScale(XR_SIDE_BY_SIDE.defaultMeshScale);
    setMeshClassVisibility(DEFAULT_MESH_CLASS_VISIBILITY);
    setFocusBalancedNonce((v) => v + 1);
  };

  const alternateLabHref = useMemo(() => {
    const otherPath = mode === "ar" ? "/xr/vr" : "/xr/ar";
    const q = new URLSearchParams(searchParams.toString());
    const s = q.toString();
    return s ? `${otherPath}?${s}` : otherPath;
  }, [mode, searchParams]);
  const alternateLabShortLabel = mode === "ar" ? "VR" : "AR";

  const runEnterImmersive = async () => {
    try {
      setXrError(null);
      if (mode === "vr") {
        setPreparingImmersive(true);
        try {
          await preloadXrSessionAssets({
            studyId,
            meshUrl: effectiveMeshUrl,
            dicomSlice: currentDicomSlice,
          });
        } catch (preloadErr) {
          console.warn("XR preload incomplete:", preloadErr);
        } finally {
          setPreparingImmersive(false);
        }
        setVrSpawnNonce((v) => v + 1);
        await store.enterVR();
        return;
      }
      await store.enterAR();
    } catch (err) {
      const label = mode === "ar" ? "AR" : "VR";
      const message =
        err instanceof Error ? err.message : `Failed to enter ${label}`;
      setXrError(message);
      console.error("XR Error:", err);

      if (
        message.includes("NotSupportedError") ||
        message.includes("XRSession") ||
        message.includes("XRWebGLBinding")
      ) {
        setXrError(
          mode === "ar"
            ? "AR session configuration is not supported on this phone/browser. Use Android Chrome over HTTPS on an ARCore-capable device, or switch to VR."
            : "No VR headset detected. Please connect a compatible WebXR device (e.g., Meta Quest, HTC Vive) or use desktop 3D view.",
        );
      }
    }
  };

  const handleEnterImmersive = async () => {
    setFocusBalancedNonce((v) => v + 1);
    if (mode === "vr") {
      setVrSpawnNonce((v) => v + 1);
    }
    await runEnterImmersive();
  };

  return (
    <div className="relative h-dvh min-h-dvh w-full overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)] sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <XrLabHeader studyId={studyId} syncConnected={syncConnected} />
          {metrics && <XrMetricsPanel metrics={metrics} />}
        </div>
      </div>

      <XrStatusOverlays
        xrError={xrError}
        meshError={meshError}
        isLoading={isLoading || preparingImmersive}
        studyId={studyId}
      />

      {preparingImmersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex justify-center">
          <p className="rounded-full border border-cyan-500/40 bg-black/70 px-3 py-1 text-[11px] font-medium text-cyan-200">
            Preparing VR…
          </p>
        </div>
      )}

      <XrBottomToolbar
        onFocusStack={() => setFocusStackNonce((v) => v + 1)}
        onFocusMesh={() => setFocusMeshNonce((v) => v + 1)}
        onBalancedView={() => setFocusBalancedNonce((v) => v + 1)}
        onZoomIn={() => setMeshScale((v) => Math.min(2.4, v + 0.12))}
        onZoomOut={() => setMeshScale((v) => Math.max(0.65, v - 0.12))}
        onPresetAll={applyAllOnPreset}
        onPresetLesions={applyLesionsOnlyPreset}
        onPresetShell={applyShellOnlyPreset}
        meshClassVisibility={meshClassVisibility}
        onToggleMeshClass={(key) =>
          setMeshClassVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
        }
        onEnterImmersiveCentered={handleEnterImmersive}
        alternateLabHref={alternateLabHref}
        alternateLabShortLabel={alternateLabShortLabel}
        immersiveMode={mode}
        isImmersiveSupported={isImmersiveSupported}
      />

      <div className="absolute inset-0 z-0 touch-none">
        <Canvas
          className="block h-full w-full"
          style={{ width: "100%", height: "100%" }}
          camera={{ position: xrPreviewCameraPose().position, fov: 64 }}
          dpr={mode === "ar" ? (arQuality === "quality" ? [1, 1.25] : [1, 1]) : [1, 2]}
          gl={{
            localClippingEnabled: true,
            powerPreference: "high-performance",
            antialias: mode !== "ar" || arQuality === "quality",
            stencil: false,
            alpha: true,
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <XR store={store}>
            <XrLocomotionRig mode={mode} vrSpawnNonce={vrSpawnNonce} />
            <XRSceneContent
              meshUrl={effectiveMeshUrl}
              useMeshPlaceholder={useMeshPlaceholder}
              clippingValue={clippingValue}
              onResetView={handleResetView}
              studyId={studyId}
              dicomSliceCount={dicomSliceCount}
              currentDicomSlice={currentDicomSlice}
              onDicomSliceChange={setCurrentDicomSlice}
              focusStackNonce={focusStackNonce}
              focusMeshNonce={focusMeshNonce}
              focusBalancedNonce={focusBalancedNonce}
              meshScale={meshScale}
              classVisibility={meshClassVisibility}
              onZoomIn={() => setMeshScale((v) => Math.min(2.4, v + 0.12))}
              onZoomOut={() => setMeshScale((v) => Math.max(0.65, v - 0.12))}
              onPresetAll={applyAllOnPreset}
              onPresetLesions={applyLesionsOnlyPreset}
              onPresetShell={applyShellOnlyPreset}
              onToggleMeshClass={(key) =>
                setMeshClassVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
              }
              sceneVariant={mode}
              arQuality={arQuality}
              onArQualityChange={setArQuality}
              syncConnected={syncConnected}
              isDicomPlaying={isDicomPlaying}
              onToggleDicomPlay={toggleDicomPlayback}
              onPauseDicomPlay={pauseDicomPlayback}
              vrSpawnNonce={vrSpawnNonce}
            />
          </XR>
        </Canvas>
      </div>
    </div>
  );
}
