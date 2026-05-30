import { useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { LungMeshClipping } from "./lung-mesh-clipping";
import type { LungMeshCoreProps } from "./lung-mesh.types";
import {
  useLungMeshAutoRotate,
  useLungMeshPointerHandlers,
} from "./use-lung-mesh-interaction";
import type { MeshVisualPreset } from "../viewers/three-viewer.types";

export function LungMeshGltf(
  props: Omit<LungMeshCoreProps, "usePlaceholder">,
) {
  const {
    meshUrl,
    realLungEnabled = false,
    classVisibility,
    onWorldDragDelta,
    autoRotate = true,
    allowDrag = true,
    layoutGroupPosition = [0, 1.2, 0.5],
    surfacePickMode = false,
    onSurfacePick,
  } = props;
  const { scene } = useGLTF(meshUrl);
  const lungRef = useRef<THREE.Group>(null);
  const visualPreset: MeshVisualPreset = realLungEnabled ? "anatomicalLung" : "anatomicalSemi";
  const { isGrabbing, handlers } = useLungMeshPointerHandlers({
    onWorldDragDelta,
    allowDrag,
    surfacePickMode,
    onSurfacePick,
    lungRef,
  });
  useLungMeshAutoRotate(lungRef, autoRotate, isGrabbing);

  return (
    <group
      ref={lungRef}
      userData={allowDrag ? { grabbable: true } : undefined}
      position={layoutGroupPosition}
      scale={0.5}
      {...handlers}
    >
      <LungMeshClipping
        scene={scene}
        classVisibility={classVisibility}
        visualPreset={visualPreset}
      />
    </group>
  );
}
