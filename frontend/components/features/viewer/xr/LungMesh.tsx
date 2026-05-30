"use client";

import React from "react";
import * as THREE from "three";
import { LungMeshCore, LungMeshErrorBoundary } from "./mesh";

type LungMeshProps = {
  meshUrl: string;
  usePlaceholder?: boolean;
  realLungEnabled?: boolean;
  classVisibility?: {
    ggo: boolean;
    reticulation: boolean;
    consolidation: boolean;
    lung_shell: boolean;
  };
  onLoadError?: (error: Error) => void;
  /** Parent-driven drag in world space (XR lab); omit for default local drag. */
  onWorldDragDelta?: (delta: THREE.Vector3) => void;
  /** Disable idle Y-axis spin to keep mesh static. */
  autoRotate?: boolean;
  /** Pointer / VR grab to move the mesh (off in XR lab — fixed clinical pose). */
  allowDrag?: boolean;
  layoutGroupPosition?: [number, number, number];
  surfacePickMode?: boolean;
  onSurfacePick?: (worldPoint: THREE.Vector3) => void;
};

const ErrorFallback = (
  <group position={[0, 1.2, 0.5]}>
    <mesh>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshBasicMaterial color="#ff4444" />
    </mesh>
  </group>
);

export function LungMesh(props: LungMeshProps) {
  return (
    <LungMeshErrorBoundary
      fallback={ErrorFallback}
      onError={props.onLoadError}
    >
      <LungMeshCore
        meshUrl={props.meshUrl}
        usePlaceholder={props.usePlaceholder}
        realLungEnabled={props.realLungEnabled}
        classVisibility={props.classVisibility}
        onWorldDragDelta={props.onWorldDragDelta}
        autoRotate={props.autoRotate}
        allowDrag={props.allowDrag}
        layoutGroupPosition={props.layoutGroupPosition}
        surfacePickMode={props.surfacePickMode}
        onSurfacePick={props.onSurfacePick}
      />
    </LungMeshErrorBoundary>
  );
}
