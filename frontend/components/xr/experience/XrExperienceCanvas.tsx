"use client";

import type { Dispatch, SetStateAction } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, XRDomOverlay, type XRStore } from "@react-three/xr";
import * as THREE from "three";
import { XrLocomotionRig } from "../locomotion";
import { XRSceneContent } from "../scene";
import { xrPreviewCameraPose } from "@/lib/xr/layout-constants";
import type { ArQualityPreset, MeshClassVisibility, XrExperienceMode } from "./types";

type SceneProps = {
  meshUrl: string;
  useMeshPlaceholder: boolean;
  realLungEnabled: boolean;
  onToggleRealLung: () => void;
  studyId: string | null;
  dicomSliceCount: number;
  currentDicomSlice: number;
  setCurrentDicomSlice: (slice: number) => void;
  focusStackNonce: number;
  focusMeshNonce: number;
  focusBalancedNonce: number;
  meshScale: number;
  meshClassVisibility: MeshClassVisibility;
  onResetView: () => void;
  applyAllOnPreset: () => void;
  applyLesionsOnlyPreset: () => void;
  applyShellOnlyPreset: () => void;
  toggleMeshClass: (key: keyof MeshClassVisibility) => void;
  setMeshScale: Dispatch<SetStateAction<number>>;
  arQuality: ArQualityPreset;
  setArQuality: (q: ArQualityPreset) => void;
  syncConnected: boolean;
  isDicomPlaying: boolean;
  toggleDicomPlayback: () => void;
  pauseDicomPlayback: () => void;
  vrSpawnNonce: number;
};

type Props = {
  mode: XrExperienceMode;
  store: XRStore;
  arPerformanceMode: boolean;
  arQuality: ArQualityPreset;
  onExitImmersive: () => void;
  scene: SceneProps;
};

export function XrExperienceCanvas({
  mode,
  store,
  arPerformanceMode,
  arQuality,
  onExitImmersive,
  scene,
}: Props) {
  const {
    meshUrl, useMeshPlaceholder, realLungEnabled, onToggleRealLung, studyId, dicomSliceCount, currentDicomSlice,
    setCurrentDicomSlice, focusStackNonce, focusMeshNonce, focusBalancedNonce, meshScale,
    meshClassVisibility, onResetView, applyAllOnPreset, applyLesionsOnlyPreset, applyShellOnlyPreset,
    toggleMeshClass, setMeshScale, setArQuality, syncConnected, isDicomPlaying, toggleDicomPlayback,
    pauseDicomPlayback, vrSpawnNonce,
  } = scene;

  return (
    <div className="absolute inset-0 z-0 touch-none">
      <Canvas
        className="block h-full w-full"
        style={{ width: "100%", height: "100%" }}
        camera={{ position: xrPreviewCameraPose().position, fov: 64 }}
        dpr={mode === "ar" ? (arPerformanceMode ? [1, 1] : arQuality === "quality" ? [1, 1.25] : [1, 1]) : [1, 2]}
        gl={{
          localClippingEnabled: false,
          powerPreference: arPerformanceMode ? "low-power" : "high-performance",
          antialias: mode !== "ar" || (!arPerformanceMode && arQuality === "quality"),
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
            meshUrl={meshUrl}
            useMeshPlaceholder={useMeshPlaceholder}
            realLungEnabled={realLungEnabled}
            onToggleRealLung={onToggleRealLung}
            onResetView={onResetView}
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
            onToggleMeshClass={toggleMeshClass}
            sceneVariant={mode}
            arQuality={arQuality}
            onArQualityChange={setArQuality}
            syncConnected={syncConnected}
            isDicomPlaying={isDicomPlaying}
            onToggleDicomPlay={toggleDicomPlayback}
            onPauseDicomPlay={pauseDicomPlayback}
            vrSpawnNonce={vrSpawnNonce}
          />
          {mode === "ar" ? (
            <XRDomOverlay
              style={{
                position: "fixed",
                inset: 0,
                pointerEvents: "none",
                zIndex: 40,
              }}
            >
              <div className="pointer-events-auto absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))]">
                <button
                  type="button"
                  onClick={onExitImmersive}
                  className="rounded-full border border-white/25 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md"
                  aria-label="Exit AR"
                >
                  Exit AR
                </button>
              </div>
            </XRDomOverlay>
          ) : null}
        </XR>
      </Canvas>
    </div>
  );
}
