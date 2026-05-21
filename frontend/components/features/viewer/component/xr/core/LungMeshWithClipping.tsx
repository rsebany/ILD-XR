import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useXR } from "@react-three/xr";
import * as THREE from "three";
import { applyLungPbrToScene } from "@/components/features/viewer/component/xr/viewers/three-viewer-mesh";
import type { MeshVisualPreset } from "@/components/features/viewer/component/xr/viewers/three-viewer.types";
import { applyLungAnatomicalOrientation } from "@/lib/xr/lung-orientation";

export type LungMeshCoreProps = {
  /** Ignored when `usePlaceholder` is true. */
  meshUrl: string;
  /** Procedural mesh (no glTF fetch) when no real mesh URL exists. */
  usePlaceholder?: boolean;
  clippingPlaneConstant: number;
  clippingPlaneNormal?: [number, number, number];
  classVisibility?: {
    ggo: boolean;
    reticulation: boolean;
    consolidation: boolean;
    lung_shell: boolean;
  };
  /**
   * When set, pointer drag applies world-space deltas here instead of moving the
   * built-in lung group (used by the XR lab to drag the whole mesh from the parent).
   */
  onWorldDragDelta?: (delta: THREE.Vector3) => void;
  /** Disable idle Y-axis spin to keep mesh static. */
  autoRotate?: boolean;
  /** Pointer / VR grab to move the mesh. */
  allowDrag?: boolean;
  /** Override inner group position (default [0, 1.2, 0.5] for legacy 3D viewer). */
  layoutGroupPosition?: [number, number, number];
  /** Click on the lung surface to place a marker (XR annotation). */
  surfacePickMode?: boolean;
  onSurfacePick?: (worldPoint: THREE.Vector3) => void;
};

type MeshClassKey = "ggo" | "reticulation" | "consolidation" | "lung_shell";

function classKeyOf(obj: THREE.Object3D): MeshClassKey | null {
  const candidates = [
    obj.name,
    typeof obj.userData?.name === "string" ? (obj.userData.name as string) : "",
    obj.parent?.name ?? "",
  ];
  for (const raw of candidates) {
    const key = raw.toLowerCase().trim();
    if (
      key === "ggo" ||
      key === "reticulation" ||
      key === "consolidation" ||
      key === "lung_shell"
    ) {
      return key;
    }
  }
  return null;
}

function LungMeshWithClippingInternal({
  scene,
  clippingPlane,
  classVisibility,
  visualPreset = "default",
}: {
  scene: THREE.Group;
  clippingPlane: THREE.Plane;
  classVisibility?: LungMeshCoreProps["classVisibility"];
  /** Same materials as View3D `GltfMeshNoCamera` (translucent lung shell, class colors). */
  visualPreset?: MeshVisualPreset;
}) {
  const preparedScene = useMemo(() => {
    const clone = scene.clone();
    applyLungPbrToScene(clone, visualPreset);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      const key = classKeyOf(child);
      if (key && classVisibility) {
        child.visible = classVisibility[key];
      }
      const mats = Array.isArray(child.material)
        ? (child.material as THREE.Material[])
        : [child.material as THREE.Material];
      mats.forEach((m) => {
        m.clippingPlanes = [clippingPlane];
        m.clipIntersection = false;
        m.side = THREE.DoubleSide;
      });
    });
    applyLungAnatomicalOrientation(clone);

    const bounds = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const normalizedScale = 1.6 / maxDim;

    return { clone, center, normalizedScale };
  }, [scene, clippingPlane, classVisibility, visualPreset]);

  const offset = preparedScene.center
    .clone()
    .multiplyScalar(-preparedScene.normalizedScale);

  return (
    <group scale={preparedScene.normalizedScale} position={offset}>
      <primitive object={preparedScene.clone} />
    </group>
  );
}

function LungMeshGltfCore({
  meshUrl,
  clippingPlaneConstant,
  clippingPlaneNormal = [0, 1, 0],
  classVisibility,
  onWorldDragDelta,
  autoRotate = true,
  allowDrag = true,
  layoutGroupPosition = [0, 1.2, 0.5],
  surfacePickMode = false,
  onSurfacePick,
}: Omit<LungMeshCoreProps, "usePlaceholder">) {
  const { scene } = useGLTF(meshUrl);
  const lungRef = useRef<THREE.Group>(null);
  const isGrabbing = useRef(false);
  const prevPointRef = useRef(new THREE.Vector3());
  const xrSession = useXR((s) => s.session);

  const clippingPlane = useMemo(
    () =>
      new THREE.Plane(
        new THREE.Vector3(...clippingPlaneNormal),
        clippingPlaneConstant
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clippingPlaneNormal.join(",")],
  );
  clippingPlane.constant = clippingPlaneConstant;

  useFrame((_, delta) => {
    if (!lungRef.current || xrSession) return;
    if (autoRotate && !isGrabbing.current) {
      lungRef.current.rotation.y += delta * 0.045;
    }
  });

  const handlePointerDown = (e: any) => {
    if (surfacePickMode && onSurfacePick) {
      e.stopPropagation();
      onSurfacePick(e.point.clone());
      return;
    }
    if (isGrabbing.current) return;
    isGrabbing.current = true;
    prevPointRef.current.copy(e.point);
    (e.target as unknown as THREE.Object3D).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isGrabbing.current) return;
    const delta = e.point.clone().sub(prevPointRef.current);
    prevPointRef.current.copy(e.point);
    if (onWorldDragDelta) {
      onWorldDragDelta(delta);
      return;
    }
    if (!lungRef.current) return;
    lungRef.current.position.add(delta);
  };

  const handlePointerUp = (e: any) => {
    isGrabbing.current = false;
    (e.target as unknown as THREE.Object3D).releasePointerCapture(e.pointerId);
  };

  const pointerHandlers =
    surfacePickMode && onSurfacePick
      ? { onPointerDown: handlePointerDown }
      : allowDrag
        ? {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: handlePointerUp,
            onPointerLeave: handlePointerUp,
          }
        : {};

  return (
    <group
      ref={lungRef}
      userData={allowDrag ? { grabbable: true } : undefined}
      position={layoutGroupPosition}
      scale={0.5}
      {...pointerHandlers}
    >
      <LungMeshWithClippingInternal
        scene={scene}
        clippingPlane={clippingPlane}
        classVisibility={classVisibility}
        visualPreset="default"
      />
    </group>
  );
}

function LungMeshPlaceholderCore({
  clippingPlaneConstant,
  clippingPlaneNormal = [0, 1, 0],
  onWorldDragDelta,
  autoRotate = true,
  allowDrag = true,
  layoutGroupPosition = [0, 1.2, 0.5],
}: Pick<
  LungMeshCoreProps,
  | "clippingPlaneConstant"
  | "clippingPlaneNormal"
  | "onWorldDragDelta"
  | "autoRotate"
  | "allowDrag"
  | "layoutGroupPosition"
>) {
  const lungRef = useRef<THREE.Group>(null);
  const isGrabbing = useRef(false);
  const prevPointRef = useRef(new THREE.Vector3());
  const xrSession = useXR((s) => s.session);

  const clippingPlane = useMemo(
    () =>
      new THREE.Plane(
        new THREE.Vector3(...clippingPlaneNormal),
        clippingPlaneConstant,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clippingPlaneNormal.join(",")],
  );
  clippingPlane.constant = clippingPlaneConstant;

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

  useFrame((_, delta) => {
    if (!lungRef.current || xrSession) return;
    if (autoRotate && !isGrabbing.current) {
      lungRef.current.rotation.y += delta * 0.045;
    }
  });

  const handlePointerDown = (e: any) => {
    if (isGrabbing.current) return;
    isGrabbing.current = true;
    prevPointRef.current.copy(e.point);
    (e.target as unknown as THREE.Object3D).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!isGrabbing.current) return;
    const d = e.point.clone().sub(prevPointRef.current);
    prevPointRef.current.copy(e.point);
    if (onWorldDragDelta) {
      onWorldDragDelta(d);
      return;
    }
    if (!lungRef.current) return;
    lungRef.current.position.add(d);
  };

  const handlePointerUp = (e: any) => {
    isGrabbing.current = false;
    (e.target as unknown as THREE.Object3D).releasePointerCapture(e.pointerId);
  };

  const dragHandlers = allowDrag
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerLeave: handlePointerUp,
      }
    : {};

  return (
    <group
      ref={lungRef}
      userData={allowDrag ? { grabbable: true } : undefined}
      position={layoutGroupPosition}
      scale={0.5}
      {...dragHandlers}
    >
      <mesh material={material}>
        <icosahedronGeometry args={[0.4, 1]} />
      </mesh>
    </group>
  );
}

export function LungMeshCore(props: LungMeshCoreProps) {
  if (props.usePlaceholder) {
    return (
      <LungMeshPlaceholderCore
        clippingPlaneConstant={props.clippingPlaneConstant}
        clippingPlaneNormal={props.clippingPlaneNormal}
        onWorldDragDelta={props.onWorldDragDelta}
        autoRotate={props.autoRotate}
        allowDrag={props.allowDrag}
        layoutGroupPosition={props.layoutGroupPosition}
      />
    );
  }
  return (
    <LungMeshGltfCore
      meshUrl={props.meshUrl}
      clippingPlaneConstant={props.clippingPlaneConstant}
      clippingPlaneNormal={props.clippingPlaneNormal}
      classVisibility={props.classVisibility}
      onWorldDragDelta={props.onWorldDragDelta}
      autoRotate={props.autoRotate}
      allowDrag={props.allowDrag}
      layoutGroupPosition={props.layoutGroupPosition}
      surfacePickMode={props.surfacePickMode}
      onSurfacePick={props.onSurfacePick}
    />
  );
}

