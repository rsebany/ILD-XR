"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Html, OrbitControls, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { XRControllers } from "@/components/features/viewer/component/xr/XRControllers";
import { XRInteractionLayer } from "@/components/features/viewer/component/xr/core/XRInteractionLayer";
import { LungMesh } from "@/components/features/viewer/component/xr/LungMesh";
import { DicomSliceViewer } from "./dicom-slice-viewer";
import { XrEnvironmentLayer } from "./xr-environment";
import { ImmersiveButton, ImmersiveToggleButton } from "./xr-immersive-ui";
import {
  clinicalWorldPosition,
  combineAnchor,
  XR_CLINICAL_ZONE,
  XR_IMMERSIVE_MESH_ROTATION_OFFSET,
  XR_MESH_DEFAULT_VIEW_ROTATION,
  XR_SIDE_BY_SIDE,
  xrPreviewCameraPose,
} from "./xr-layout";
import {
  type SceneEulerRotation,
  stepRotationY,
  ZERO_ROTATION,
} from "@/lib/xr/scene-rotation";
import type { ArQualityPreset } from "./xr-experience-page";

const IMMERSIVE_CONTROLS_OFFSET: [number, number, number] = [0, 0.25, 1.3];

const OPAQUE_CLEAR = 0x111827;

/** Inline AR preview uses an opaque backdrop; immersive passthrough uses transparent clear so the camera shows through open areas (hospital meshes still draw in-scene). */
function ImmersiveClearColor({ sceneVariant }: { sceneVariant: "vr" | "ar" }) {
  const { gl, scene } = useThree();
  const session = useXR((s) => s.session);
  const presenting = Boolean(session);
  const blendMode = session?.environmentBlendMode;
  const isArSession = presenting && sceneVariant === "ar";
  const isVrSession = presenting && sceneVariant === "vr";
  const immersivePassthrough =
    isArSession && (blendMode === "alpha-blend" || blendMode === "additive");
  const solidRef = useRef(new THREE.Color("#111827"));

  const applyPreviewClear = () => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  };

  const applyOpaqueClear = () => {
    scene.background = solidRef.current;
    gl.setClearColor(OPAQUE_CLEAR, 1);
  };

  const applyPassthroughClear = () => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  };

  useEffect(() => {
    const previousBackground = scene.background;
    const previousClear = gl.getClearColor(new THREE.Color()).clone();
    const previousAlpha = gl.getClearAlpha();
    if (!presenting) {
      applyPreviewClear();
      return () => {
        scene.background = previousBackground;
        gl.setClearColor(previousClear, previousAlpha);
      };
    }
    if (immersivePassthrough) {
      applyPassthroughClear();
      return () => {
        scene.background = previousBackground;
        gl.setClearColor(previousClear, previousAlpha);
      };
    }
    applyOpaqueClear();
    return () => {
      scene.background = previousBackground;
      gl.setClearColor(previousClear, previousAlpha);
    };
  }, [presenting, immersivePassthrough, gl, scene]);

  useFrame(() => {
    if (isVrSession) {
      applyOpaqueClear();
      return;
    }
    if (!presenting) {
      if (scene.background !== null) applyPreviewClear();
      else if (gl.getClearAlpha() !== 0) gl.setClearColor(0x000000, 0);
      return;
    }
    if (immersivePassthrough) return;
    if (scene.background !== solidRef.current) {
      applyOpaqueClear();
    } else if (gl.getClearAlpha() !== 1) {
      gl.setClearColor(OPAQUE_CLEAR, 1);
    }
  });

  return null;
}

function XrSceneLoadingFallback() {
  return (
    <group>
      <mesh position={[0, 1.4, -2.4]}>
        <sphereGeometry args={[6, 24, 24]} />
        <meshBasicMaterial color="#050505" side={THREE.BackSide} />
      </mesh>
      <Html position={[0, 1.3, -0.75]} center>
        <div className="rounded-lg border border-cyan-500/30 bg-black/70 px-3 py-1.5">
          <p className="text-[10px] font-semibold tracking-wide text-cyan-200">Loading XR scene...</p>
        </div>
      </Html>
    </group>
  );
}

export function XRSceneContent({
  meshUrl,
  useMeshPlaceholder,
  clippingValue,
  onResetView,
  studyId,
  dicomSliceCount,
  currentDicomSlice,
  onDicomSliceChange,
  focusStackNonce,
  focusMeshNonce,
  focusBalancedNonce,
  meshScale,
  classVisibility,
  onZoomIn,
  onZoomOut,
  onPresetAll,
  onPresetLesions,
  onPresetShell,
  onToggleMeshClass,
  sceneVariant = "vr",
  arQuality = "performance",
  onArQualityChange,
  syncConnected,
  isDicomPlaying,
  onToggleDicomPlay,
  onPauseDicomPlay,
  vrSpawnNonce = 0,
}: {
  meshUrl: string;
  useMeshPlaceholder: boolean;
  clippingValue: number;
  onResetView: () => void;
  studyId: string | null;
  dicomSliceCount: number;
  currentDicomSlice: number;
  onDicomSliceChange: (slice: number) => void;
  focusStackNonce: number;
  focusMeshNonce: number;
  focusBalancedNonce: number;
  meshScale: number;
  classVisibility: {
    ggo: boolean;
    reticulation: boolean;
    consolidation: boolean;
    lung_shell: boolean;
  };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  onToggleMeshClass: (key: "ggo" | "reticulation" | "consolidation" | "lung_shell") => void;
  /** AR: inline preview uses solid clear; immersive passthrough uses transparent clear (hospital GLB still renders on top). */
  sceneVariant?: "vr" | "ar";
  arQuality?: ArQualityPreset;
  onArQualityChange: (next: ArQualityPreset) => void;
  syncConnected: boolean;
  isDicomPlaying: boolean;
  onToggleDicomPlay: () => void;
  onPauseDicomPlay: () => void;
  /** Bumped when entering VR so content recenters in the hospital zone. */
  vrSpawnNonce?: number;
}) {
  const controlsRef = React.useRef<unknown>(null);
  const { camera, gl } = useThree();
  const arRaycasterRef = React.useRef(new THREE.Raycaster());
  const ENABLE_AR_TAP_PLACEMENT = false;
  const arTouchRef = React.useRef({
    startX: 0,
    startY: 0,
    moved: false,
    hadPinch: false,
  });

  const session = useXR((s) => s.session);
  const isPresenting = Boolean(session);
  const isArImmersive = isPresenting && sceneVariant === "ar";
  const useHtmlControls = !isPresenting;
  const showImmersive3DControls = isPresenting;
  const [meshDragOffset, setMeshDragOffset] = useState<[number, number, number]>([0, 0, 0]);
  const [meshRotation, setMeshRotation] = useState<SceneEulerRotation>(
    XR_MESH_DEFAULT_VIEW_ROTATION,
  );
  const [placingLesion, setPlacingLesion] = useState(false);
  const [userLesions, setUserLesions] = useState<
    Array<{ id: string; position: [number, number, number] }>
  >([]);
  const [panels, setPanels] = useState<
    Array<{ id: string; title: string; angle: number; distance: number; size: [number, number] }>
  >([]);
  const meshGroupRef = useRef<THREE.Group>(null);
  const [arAnchor, setArAnchor] = useState<[number, number, number]>(() => [
    ...XR_CLINICAL_ZONE.center,
  ]);
  const clinicalZonePosition = useMemo((): [number, number, number] => {
    if (isArImmersive) return arAnchor;
    return [...XR_CLINICAL_ZONE.center];
  }, [isArImmersive, arAnchor]);
  const meshGroupPosition = useMemo(
    () => combineAnchor(XR_SIDE_BY_SIDE.mesh, meshDragOffset),
    [meshDragOffset],
  );
  const handleMeshWorldDragDelta = React.useCallback(
    (delta: THREE.Vector3) => {
      if (isArImmersive) return;
      setMeshDragOffset((prev) => [
        prev[0] + delta.x,
        Math.max(-0.55, prev[1] + delta.y),
        prev[2] + delta.z,
      ]);
    },
    [isArImmersive],
  );

  const meshDisplayRotation = useMemo((): SceneEulerRotation => {
    if (!isPresenting) return meshRotation;
    const [ox, oy, oz] = XR_IMMERSIVE_MESH_ROTATION_OFFSET;
    return [meshRotation[0] + ox, meshRotation[1] + oy, meshRotation[2] + oz];
  }, [isPresenting, meshRotation]);

  const rotateMeshY = React.useCallback((direction: 1 | -1) => {
    setMeshRotation((current) => stepRotationY(current, direction));
  }, []);

  const resetMeshRotation = React.useCallback(() => {
    setMeshRotation(XR_MESH_DEFAULT_VIEW_ROTATION);
  }, []);

  const flipMesh = React.useCallback(() => {
    setMeshRotation((current) => [current[0] + Math.PI, current[1], current[2]]);
  }, []);

  const createPanelTexture = React.useCallback((title: string) => {
    const w = 512;
    const h = 320;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#071022";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#a5f3fc";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, 60);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "16px sans-serif";
    ctx.fillText("Contenu XR — exemple de panneau", w / 2, 110);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const addPanel = React.useCallback(() => {
    setPanels((prev) => {
      const next = prev.length;
      const spread = Math.min(5, next + 1);
      const angle = (next - (spread - 1) / 2) * (Math.PI / 10);
      return [
        ...prev,
        { id: `panel-${Date.now()}`, title: `Screen ${next + 1}`, angle, distance: 1.2, size: [0.9, 0.56] },
      ];
    });
  }, []);

  const clearPanels = React.useCallback(() => setPanels([]), []);

  const handleSurfacePick = React.useCallback((worldPoint: THREE.Vector3) => {
    const group = meshGroupRef.current;
    if (!group) return;
    const local = group.worldToLocal(worldPoint.clone());
    setUserLesions((prev) => [
      ...prev,
      {
        id: `lesion-${Date.now()}-${prev.length}`,
        position: [local.x, local.y, local.z],
      },
    ]);
    setPlacingLesion(false);
  }, []);

  useEffect(() => {
    if (!isPresenting || sceneVariant !== "vr") return;
    setMeshDragOffset([0, 0, 0]);
    setMeshRotation(XR_MESH_DEFAULT_VIEW_ROTATION);
  }, [isPresenting, sceneVariant, vrSpawnNonce]);

  const [arPlaced, setArPlaced] = useState(false);
  const pinchStateRef = React.useRef<{ active: boolean; distance: number }>({
    active: false,
    distance: 0,
  });

  const placeArContentInFrontOfUser = React.useCallback(() => {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < 1e-6) {
      direction.set(0, 0, -1);
    } else {
      direction.normalize();
    }
    const target = new THREE.Vector3()
      .copy(camera.position)
      .addScaledVector(direction, 1.15);
    target.y = XR_CLINICAL_ZONE.center[1];
    setArAnchor([target.x, target.y, target.z]);
    setArPlaced(true);
  }, [camera]);

  const handleReset = () => {
    setMeshDragOffset([0, 0, 0]);
    setMeshRotation(XR_MESH_DEFAULT_VIEW_ROTATION);
    const ctrl = controlsRef.current as { reset?: () => void } | null;
    ctrl?.reset?.();
    onResetView?.();
  };

  useEffect(() => {
    if (focusStackNonce === 0) return;
    const [dx, dy, dz] = clinicalWorldPosition("dicom");
    camera.position.set(dx - 0.35, dy + 0.12, dz + 1.55);
    const ctrl = controlsRef.current as
      | { target?: THREE.Vector3; update?: () => void }
      | null;
    ctrl?.target?.set(dx, dy, dz);
    ctrl?.update?.();
  }, [focusStackNonce, camera]);

  useEffect(() => {
    if (focusMeshNonce === 0) return;
    const [mx, my, mz] = clinicalWorldPosition("mesh");
    camera.position.set(mx + 0.35, my + 0.12, mz + 1.85);
    const ctrl = controlsRef.current as
      | { target?: THREE.Vector3; update?: () => void }
      | null;
    ctrl?.target?.set(mx, my, mz);
    ctrl?.update?.();
  }, [focusMeshNonce, camera]);

  useEffect(() => {
    if (focusBalancedNonce === 0) return;
    const { position, target } = xrPreviewCameraPose();
    camera.position.set(...position);
    const ctrl = controlsRef.current as
      | { target?: THREE.Vector3; update?: () => void }
      | null;
    ctrl?.target?.set(...target);
    ctrl?.update?.();
  }, [focusBalancedNonce, camera]);

  useEffect(() => {
    if (!(sceneVariant === "ar" && isPresenting)) return;
    const element = gl.domElement;
    const pinch = pinchStateRef.current;
    const touchState = arTouchRef.current;
    const ZOOM_STEP_PX = 22;
    const TAP_MOVE_THRESHOLD = 10;

    const distanceBetweenTouches = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.hypot(dx, dy);
    };

    const resetPinch = () => {
      pinch.active = false;
      pinch.distance = 0;
      touchState.hadPinch = false;
    };

    const onTouchStart = (event: TouchEvent) => {
      if ((event.target as HTMLElement | null)?.closest("button,input,select,textarea")) return;
      if (event.touches.length === 1) {
        touchState.startX = event.touches[0].clientX;
        touchState.startY = event.touches[0].clientY;
        touchState.moved = false;
      }
      if (event.touches.length === 2) {
        pinch.active = true;
        touchState.hadPinch = true;
        pinch.distance = distanceBetweenTouches(event.touches);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if ((event.target as HTMLElement | null)?.closest("button,input,select,textarea")) return;
      if (!pinch.active || event.touches.length !== 2) return;
      const nextDistance = distanceBetweenTouches(event.touches);
      const delta = nextDistance - pinch.distance;

      if (Math.abs(delta) >= ZOOM_STEP_PX) {
        if (delta > 0) {
          onZoomIn();
        } else {
          onZoomOut();
        }
        pinch.distance = nextDistance;
      }
      event.preventDefault();
    };

    const onTouchMoveSingle = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - touchState.startX;
      const dy = event.touches[0].clientY - touchState.startY;
      if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        touchState.moved = true;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!ENABLE_AR_TAP_PLACEMENT) return;
      if ((event.target as HTMLElement | null)?.closest("button,input,select,textarea")) return;
      if (touchState.hadPinch || touchState.moved) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const canvasRect = element.getBoundingClientRect();
      const x = ((touch.clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      const y = -((touch.clientY - canvasRect.top) / canvasRect.height) * 2 + 1;

      const raycaster = arRaycasterRef.current;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      const floorPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -XR_CLINICAL_ZONE.center[1],
      );
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) {
        placeArContentInFrontOfUser();
        return;
      }
      setArAnchor([hit.x, XR_CLINICAL_ZONE.center[1], hit.z]);
      setArPlaced(true);
    };

    if (!arPlaced) {
      placeArContentInFrontOfUser();
    }

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchmove", onTouchMoveSingle, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchend", resetPinch, { passive: true });
    element.addEventListener("touchcancel", resetPinch, { passive: true });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchmove", onTouchMoveSingle);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchend", resetPinch);
      element.removeEventListener("touchcancel", resetPinch);
      resetPinch();
    };
  }, [arPlaced, camera, gl, isPresenting, onZoomIn, onZoomOut, placeArContentInFrontOfUser, sceneVariant]);

  return (
    <>
      <ImmersiveClearColor sceneVariant={sceneVariant} />
      <ambientLight intensity={0.72} />
      <pointLight position={[10, 10, 10]} intensity={1.05} />
      <pointLight position={[-10, 5, -10]} intensity={0.65} />

      <XrEnvironmentLayer />
      <XRInteractionLayer />

      <XRControllers onResetView={handleReset}>
        <Suspense fallback={<XrSceneLoadingFallback />}>
          <group name="clinical-zone" position={clinicalZonePosition}>
          {showImmersive3DControls && (
            <group position={IMMERSIVE_CONTROLS_OFFSET}>
              <ImmersiveButton
                label="+"
                position={[-0.14, 0.46, 0]}
                color="#0ea5e9"
                onSelect={onZoomIn}
              />
              <ImmersiveButton
                label="-"
                position={[0.14, 0.46, 0]}
                color="#475569"
                onSelect={onZoomOut}
              />

              <ImmersiveButton
                label="All"
                position={[-0.24, 0.26, 0]}
                color="#0284c7"
                onSelect={onPresetAll}
              />
              <ImmersiveButton
                label="Lesions"
                position={[0, 0.26, 0]}
                color="#7c3aed"
                onSelect={onPresetLesions}
              />
              <ImmersiveButton
                label="Shell"
                position={[0.24, 0.26, 0]}
                color="#334155"
                onSelect={onPresetShell}
              />

              <ImmersiveToggleButton
                label="GGO"
                active={classVisibility.ggo}
                position={[-0.39, 0.04, 0]}
                activeColor="#059669"
                onSelect={() => onToggleMeshClass("ggo")}
              />
              <ImmersiveToggleButton
                label="Retic"
                active={classVisibility.reticulation}
                position={[-0.13, 0.04, 0]}
                activeColor="#7c3aed"
                onSelect={() => onToggleMeshClass("reticulation")}
              />
              <ImmersiveToggleButton
                label="Cons"
                active={classVisibility.consolidation}
                position={[0.13, 0.04, 0]}
                activeColor="#d97706"
                onSelect={() => onToggleMeshClass("consolidation")}
              />
              <ImmersiveToggleButton
                label="Shell"
                active={classVisibility.lung_shell}
                position={[0.39, 0.04, 0]}
                activeColor="#334155"
                onSelect={() => onToggleMeshClass("lung_shell")}
              />

              {isArImmersive && (
                <>
                  <ImmersiveButton
                    label="Center"
                    position={[0, -0.22, 0]}
                    color="#0369a1"
                    width={0.28}
                    onSelect={placeArContentInFrontOfUser}
                  />
                  <ImmersiveToggleButton
                    label="Perf"
                    active={arQuality === "performance"}
                    position={[-0.28, -0.4, 0]}
                    activeColor="#0891b2"
                    onSelect={() => onArQualityChange("performance")}
                  />
                  <ImmersiveToggleButton
                    label="Bal"
                    active={arQuality === "balanced"}
                    position={[0, -0.4, 0]}
                    activeColor="#0891b2"
                    onSelect={() => onArQualityChange("balanced")}
                  />
                  <ImmersiveToggleButton
                    label="Qual"
                    active={arQuality === "quality"}
                    position={[0.28, -0.4, 0]}
                    activeColor="#0891b2"
                    onSelect={() => onArQualityChange("quality")}
                  />
                </>
              )}
            </group>
          )}

          <group
            ref={meshGroupRef}
            position={meshGroupPosition}
            scale={meshScale}
            rotation={meshDisplayRotation}
          >
            <LungMesh
              meshUrl={meshUrl}
              usePlaceholder={useMeshPlaceholder}
              clippingPlaneConstant={clippingValue}
              clippingPlaneNormal={[0, 1, 0]}
              classVisibility={classVisibility}
              autoRotate={false}
              allowDrag={false}
              layoutGroupPosition={[0, 0, 0]}
              surfacePickMode={placingLesion}
              onSurfacePick={handleSurfacePick}
            />

            {userLesions.map((lesion) => (
              <mesh key={lesion.id} position={lesion.position} renderOrder={2}>
                <sphereGeometry args={[0.045, 14, 14]} />
                <meshStandardMaterial
                  color="#4ade80"
                  emissive="#166534"
                  emissiveIntensity={0.65}
                  transparent
                  opacity={0.92}
                />
              </mesh>
            ))}

            {isPresenting && (
              <group position={[0, -0.95, 0.05]}>
                <ImmersiveButton
                  label="↺"
                  position={[-0.35, 0.38, 0]}
                  color="#475569"
                  width={0.2}
                  onSelect={() => rotateMeshY(-1)}
                />
                <ImmersiveButton
                  label="↻"
                  position={[0.35, 0.38, 0]}
                  color="#475569"
                  width={0.2}
                  onSelect={() => rotateMeshY(1)}
                />
                <ImmersiveButton
                  label="0°"
                  position={[0, 0.38, 0]}
                  color="#334155"
                  width={0.18}
                  onSelect={resetMeshRotation}
                />
                <ImmersiveButton
                  label="⇵"
                  position={[0, 0.05, 0]}
                  color="#0369a1"
                  width={0.22}
                  onSelect={flipMesh}
                />
                <ImmersiveButton
                  label="+Ecr"
                  position={[0.75, 0.38, 0]}
                  color="#0891b2"
                  width={0.24}
                  onSelect={addPanel}
                />
                <ImmersiveButton
                  label="Clr"
                  position={[0.75, 0.05, 0]}
                  color="#475569"
                  width={0.18}
                  onSelect={clearPanels}
                />
              </group>
            )}
          </group>

          {useHtmlControls && (
            <Html position={[0, -0.85, 0.72]} center style={{ pointerEvents: "auto" }}>
              <div className="flex flex-col items-center gap-1 select-none">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-teal-300/90">
                  Mesh 3D
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => rotateMeshY(-1)}
                    className="rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-white transition-all hover:bg-slate-600"
                    title="Tourner le mesh de 90° (sens antihoraire)"
                  >
                    ↺ 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateMeshY(1)}
                    className="rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-white transition-all hover:bg-slate-600"
                    title="Tourner le mesh de 90° (sens horaire)"
                  >
                    ↻ 90°
                  </button>
                  <button
                    type="button"
                    onClick={flipMesh}
                    className="rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-white transition-all hover:bg-slate-600"
                    title="Retourner le mesh (180°)"
                  >
                    ⇵ 180°
                  </button>
                  <button
                    type="button"
                    onClick={resetMeshRotation}
                    className="rounded-md bg-slate-600/80 px-2 py-1 text-[9px] font-semibold text-slate-200 transition-all hover:bg-slate-500"
                    title="Réinitialiser l’orientation du mesh"
                  >
                    Réinit.
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={onPresetLesions}
                    className="rounded-md bg-emerald-800/85 px-2 py-1 text-[9px] font-bold text-emerald-100 transition-all hover:bg-emerald-700"
                    title="Afficher les lésions détectées par l’IA (GGO, réticulation, consolidation)"
                  >
                    Lésions IA
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlacingLesion((v) => !v)}
                    className={`rounded-md px-2 py-1 text-[9px] font-bold transition-all ${
                      placingLesion
                        ? "bg-amber-500 text-black"
                        : "bg-slate-700/80 text-white hover:bg-slate-600"
                    }`}
                    title="Cliquer sur le poumon pour placer un marqueur"
                  >
                    {placingLesion ? "Clic sur poumon…" : "+ Marqueur"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserLesions([])}
                    disabled={userLesions.length === 0}
                    className="rounded-md bg-slate-700/80 px-2 py-1 text-[9px] font-semibold text-slate-200 transition-all hover:bg-slate-600 disabled:opacity-30"
                  >
                    Effacer ({userLesions.length})
                  </button>
                </div>
              </div>
            </Html>
          )}

          {studyId && dicomSliceCount > 0 && (
            <DicomSliceViewer
              studyId={studyId}
              maxSlices={dicomSliceCount}
              currentSlice={currentDicomSlice}
              onSliceChange={onDicomSliceChange}
              isPlaying={isDicomPlaying}
              onTogglePlay={onToggleDicomPlay}
              onPausePlayback={onPauseDicomPlay}
              layoutPosition={[...XR_SIDE_BY_SIDE.dicom]}
            />
          )}
          </group>

          {/* Panels: multiple screens rendered as textured planes in world space */}
          {isPresenting && panels.length > 0 && (
            <group name="xr-panels">
              {panels.map((p, i) => {
                const x = Math.sin(p.angle) * p.distance;
                const z = -Math.cos(p.angle) * p.distance;
                const y = 1.4;
                const tex = createPanelTexture(p.title);
                return (
                  <mesh
                    key={p.id}
                    position={[x, y, z]}
                    rotation={[0, p.angle, 0]}
                  >
                    <planeGeometry args={[p.size[0], p.size[1]]} />
                    <meshBasicMaterial map={tex || undefined} side={THREE.DoubleSide} />
                  </mesh>
                );
              })}
            </group>
          )}
        </Suspense>
      </XRControllers>

      <OrbitControls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={controlsRef as any}
        target={[...XR_CLINICAL_ZONE.center]}
        makeDefault
        enabled={!isPresenting}
        enableDamping
        dampingFactor={0.08}
        enableRotate
        enablePan={false}
        rotateSpeed={0.65}
        zoomSpeed={0.65}
        maxPolarAngle={Math.PI * 0.95}
      />

      {isPresenting && (
        <Html prepend fullscreen style={{ pointerEvents: "none" }}>
          <p className="fixed bottom-24 left-1/2 z-10 max-w-xs -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-center text-[9px] text-slate-400 backdrop-blur-sm">
            {sceneVariant === "vr"
              ? "Thumbstick move · Ray-select controls"
              : "Pinch zoom · Ray-select · Center to recenter"}
          </p>
        </Html>
      )}

      {isArImmersive && !arPlaced && (
        <Text
          position={[clinicalZonePosition[0], clinicalZonePosition[1] + 1.1, clinicalZonePosition[2]]}
          fontSize={0.045}
          color="#a5f3fc"
          anchorX="center"
          anchorY="middle"
          maxWidth={2.2}
        >
          Stabilize tracking, then Center
        </Text>
      )}
    </>
  );
}
