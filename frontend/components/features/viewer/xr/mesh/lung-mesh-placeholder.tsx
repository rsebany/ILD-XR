import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { LungMeshCoreProps } from "./lung-mesh.types";
import {
  useClippingPlane,
  useLungMeshAutoRotate,
  useLungMeshPointerHandlers,
} from "./use-lung-mesh-interaction";

type PlaceholderProps = Pick<
  LungMeshCoreProps,
  | "clippingPlaneConstant"
  | "clippingPlaneNormal"
  | "onWorldDragDelta"
  | "autoRotate"
  | "allowDrag"
  | "layoutGroupPosition"
>;

export function LungMeshPlaceholder({
  clippingPlaneConstant,
  clippingPlaneNormal = [0, 1, 0],
  onWorldDragDelta,
  autoRotate = true,
  allowDrag = true,
  layoutGroupPosition = [0, 1.2, 0.5],
}: PlaceholderProps) {
  const lungRef = useRef<THREE.Group>(null);
  const clippingPlane = useClippingPlane(clippingPlaneConstant, clippingPlaneNormal);
  const { isGrabbing, handlers } = useLungMeshPointerHandlers({
    onWorldDragDelta,
    allowDrag,
    lungRef,
  });
  useLungMeshAutoRotate(lungRef, autoRotate, isGrabbing);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0d9488"),
        emissive: new THREE.Color("#134e4a"),
        emissiveIntensity: 0.2,
        metalness: 0.15,
        roughness: 0.7,
        clippingPlanes: [clippingPlane],
        clipIntersection: false,
        side: THREE.DoubleSide,
      }),
    [clippingPlane],
  );

  return (
    <group
      ref={lungRef}
      userData={allowDrag ? { grabbable: true } : undefined}
      position={layoutGroupPosition}
      scale={0.5}
      {...handlers}
    >
      <mesh material={material}>
        <icosahedronGeometry args={[0.4, 1]} />
      </mesh>
    </group>
  );
}
