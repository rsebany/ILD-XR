"use client";

import React, { Suspense, useMemo, useRef } from "react";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { XRControls } from "@/components/features/viewer/component/xr/core/XRControls";
import { XRInteractionLayer } from "@/components/features/viewer/component/xr/core/XRInteractionLayer";
import { XRCanvasContainer } from "@/components/features/viewer/component/xr/core/XRCanvasContainer";
import { DicomAxialStack3D } from "@/components/features/viewer/component/view3d/DicomAxialStack3D";
import { FitToSceneGroup, type OrbitControlsHandle, XrPresentingSync } from "./three-viewer-camera";
import { GltfMeshNoCamera, ProceduralLung } from "./three-viewer-mesh";
import { ZoomHud } from "./three-viewer-zoom-hud";
import {
  DEFAULT_MESH_CLASS_VISIBILITY,
  type MeshClassVisibility,
  type MeshVisualPreset,
  type ThreeViewerProps,
} from "./three-viewer.types";

export type {
  DicomContext3D,
  MeshClassKey,
  MeshClassVisibility,
  ThreeViewerProps,
} from "./three-viewer.types";
export { DEFAULT_MESH_CLASS_VISIBILITY } from "./three-viewer.types";

const DICOM_OFFSET_X_DESKTOP = 0;
const DICOM_OFFSET_X_WEBXR = -1.42;
const MESH_OFFSET_SIDE_BY_SIDE: [number, number, number] = [0, 0, 0];
const MESH_OFFSET_WEBXR_CENTER: [number, number, number] = [0, 1.2, 0];
const MESH_OFFSET_WEBXR_MESH_ONLY: [number, number, number] = [0, 1.0, 0];

const MIN_DISTANCE = 0.18;
const MAX_DISTANCE = 450;

export const ThreeViewer: React.FC<ThreeViewerProps> = ({
  meshUrl,
  compareMeshUrl = null,
  comparePrimaryPosition = [-0.38, 0, 0],
  compareSecondaryPosition = [0.38, 0, 0],
  usePlaceholder = false,
  showMesh = true,
  backgroundColor = "#020617",
  dicomContext = null,
  dicomIncludeOverlay = true,
  dicomMaxStackSlices,
  dicomVoxelCount = null,
  dicomSpacingMm = null,
  visualPreset = "default",
  classVisibility,
}) => {
  const sceneGroupRef = useRef<THREE.Group | null>(null);
  const orbitRef = useRef<OrbitControlsHandle | null>(null);
  const hasDualMeshes =
    showMesh &&
    Boolean(compareMeshUrl?.trim()) &&
    Boolean(meshUrl?.trim()) &&
    !usePlaceholder;
  const showMeshBlock =
    showMesh &&
    (usePlaceholder ||
      hasDualMeshes ||
      (Boolean(meshUrl?.trim()) && !compareMeshUrl?.trim()));
  const resolvedClassVisibility = useMemo<Required<MeshClassVisibility>>(
    () => ({ ...DEFAULT_MESH_CLASS_VISIBILITY, ...(classVisibility ?? {}) }),
    [classVisibility],
  );
  const fitKey = `${meshUrl}-${compareMeshUrl ?? ""}-${dicomContext?.studyId ?? ""}-${dicomContext?.maxSlices ?? 0}-m${showMesh ? 1 : 0}-o${dicomIncludeOverlay ? 1 : 0}`;
  const hasDicomStack = Boolean(dicomContext && dicomContext.maxSlices > 0);

  const [xrPresenting, setXrPresenting] = React.useState(false);
  const dicomPositionX =
    hasDicomStack && xrPresenting ? DICOM_OFFSET_X_WEBXR : DICOM_OFFSET_X_DESKTOP;

  const meshGroupPosition: [number, number, number] = (() => {
    if (!showMeshBlock) return [0, 0, 0];
    if (xrPresenting) return hasDicomStack ? MESH_OFFSET_WEBXR_CENTER : MESH_OFFSET_WEBXR_MESH_ONLY;
    return hasDicomStack ? MESH_OFFSET_SIDE_BY_SIDE : [0, 0, 0];
  })();

  const meshMaterialPreset: MeshVisualPreset =
    xrPresenting && visualPreset === "segmentationWhite" ? "default" : visualPreset;
  const useStudioWhiteLighting = visualPreset === "segmentationWhite" && !xrPresenting;

  return (
    <XRCanvasContainer backgroundColor={backgroundColor}>
      <XrPresentingSync onPresentingChange={setXrPresenting} />
      {useStudioWhiteLighting ? (
        <>
          <ambientLight intensity={0.65} color="#ffffff" />
          <directionalLight position={[2.8, 4.6, 2.6]} intensity={1.25} color="#ffffff" />
          <directionalLight position={[-2.2, 1.5, -1.8]} intensity={0.35} color="#e5ecff" />
          <Environment preset="studio" />
        </>
      ) : (
        <>
          <hemisphereLight args={["#f0e8e0", "#1a1a2e", 0.6]} position={[0, 5, 0]} />
          <directionalLight position={[3.2, 6, 2.2]} intensity={1.65} color="#fff5ed" />
          <directionalLight position={[-2.2, 2, -1.2]} intensity={0.5} color="#9eb8d8" />
          <directionalLight position={[-0.2, 0, 4.5]} intensity={0.35} color="#ffe0dc" />
          <ambientLight intensity={0.2} color="#5c6a8a" />
          <Environment preset="dawn" />
        </>
      )}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={useStudioWhiteLighting ? 0.2 : 0.28}
        scale={10}
        blur={useStudioWhiteLighting ? 2.8 : 2.2}
        far={3.2}
        color="#0b1020"
      />
      <group ref={sceneGroupRef}>
        {dicomContext && dicomContext.maxSlices > 0 && (
          <DicomAxialStack3D
            studyId={dicomContext.studyId}
            maxSlices={dicomContext.maxSlices}
            currentSlice={dicomContext.currentSlice}
            positionX={dicomPositionX}
            planeScale={1.3}
            includeOverlay={dicomIncludeOverlay}
            maxRenderedStackSlices={dicomMaxStackSlices}
            spacingMm={dicomSpacingMm ?? undefined}
            voxelCount={dicomVoxelCount ?? undefined}
          />
        )}
        {showMeshBlock && (
          <>
            {hasDualMeshes ? (
              <>
                <group position={comparePrimaryPosition}>
                  <Suspense fallback={null}>
                    <GltfMeshNoCamera
                      meshUrl={meshUrl}
                      visualPreset={meshMaterialPreset}
                      classVisibility={resolvedClassVisibility}
                    />
                  </Suspense>
                </group>
                <group position={compareSecondaryPosition}>
                  <Suspense fallback={null}>
                    <GltfMeshNoCamera
                      meshUrl={compareMeshUrl!}
                      visualPreset={meshMaterialPreset}
                      classVisibility={resolvedClassVisibility}
                    />
                  </Suspense>
                </group>
              </>
            ) : (
              <group position={meshGroupPosition}>
                <Suspense fallback={null}>
                  {usePlaceholder ? (
                    <ProceduralLung />
                  ) : (
                    <GltfMeshNoCamera
                      meshUrl={meshUrl}
                      visualPreset={meshMaterialPreset}
                      classVisibility={resolvedClassVisibility}
                    />
                  )}
                </Suspense>
              </group>
            )}
          </>
        )}
      </group>
      <FitToSceneGroup
        groupRef={sceneGroupRef}
        resetKey={fitKey}
        controlsRef={orbitRef as React.RefObject<OrbitControlsHandle | null>}
      />
      <OrbitControls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={orbitRef as any}
        makeDefault
        enabled={!xrPresenting}
        enableZoom
        zoomSpeed={1}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        minPolarAngle={0.2}
        maxPolarAngle={2.85}
        enableDamping
        dampingFactor={0.05}
        target={[0, 0, 0]}
      />
      {!xrPresenting && (
        <ZoomHud controlsRef={orbitRef} minDistance={MIN_DISTANCE} maxDistance={MAX_DISTANCE} />
      )}
      <XRInteractionLayer />
      <XRControls />
    </XRCanvasContainer>
  );
};
