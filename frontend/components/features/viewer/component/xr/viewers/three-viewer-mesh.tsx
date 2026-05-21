"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { applyLungAnatomicalOrientation } from "@/lib/xr/lung-orientation";
import type { MeshClassKey, MeshClassVisibility, MeshVisualPreset } from "./three-viewer.types";

const SEGMENTATION_CLASS_COLORS: Record<Exclude<MeshClassKey, "lung_shell">, number> = {
  ggo: 0x66cc66,
  reticulation: 0x2b77ff,
  consolidation: 0xffe640,
};

/**
 * Pulls the class key out of an Object3D produced by the backend GLB exporter.
 * trimesh writes the geom name onto `userData.name` and the node name onto
 * `Object3D.name`, so check both before falling back to the parent's name.
 */
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

/** Soft tissue: vertex colors (from AI/lobe tint) or uniform lung-rose. */
export function applyLungPbrToScene(root: THREE.Object3D, visualPreset: MeshVisualPreset) {
  const lungFallback = 0xcc8c84;
  const sheenR = 0.85;
  const sheenG = 0.7;
  const sheenB = 0.68;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const g = child.geometry;
    g.computeVertexNormals();
    const classKey = classKeyOf(child);
    const classColor =
      classKey && classKey !== "lung_shell" ? SEGMENTATION_CLASS_COLORS[classKey] : undefined;
    const isLungShell = classKey === "lung_shell";
    const hasVc =
      visualPreset === "default" && !classColor && Boolean(g.getAttribute("color"));
    const baseColor =
      visualPreset === "segmentationWhite" ? 0xffffff : classColor ?? (hasVc ? 0xffffff : lungFallback);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseColor),
      vertexColors: hasVc,
      roughness: visualPreset === "segmentationWhite" ? 0.86 : 0.4,
      metalness: visualPreset === "segmentationWhite" ? 0.0 : 0.04,
      clearcoat: visualPreset === "segmentationWhite" ? 0.0 : 0.1,
      clearcoatRoughness: visualPreset === "segmentationWhite" ? 0.9 : 0.45,
      sheen: visualPreset === "segmentationWhite" ? 0.0 : 0.32,
      sheenRoughness: visualPreset === "segmentationWhite" ? 1.0 : 0.55,
      sheenColor: new THREE.Color(sheenR, sheenG, sheenB),
      envMapIntensity: visualPreset === "segmentationWhite" ? 0.25 : 1.1,
      transparent: isLungShell,
      opacity: isLungShell ? 0.44 : 1,
      depthWrite: !isLungShell,
    });
    if (Array.isArray(child.material)) {
      child.material.forEach((m) => m.dispose());
    } else {
      child.material?.dispose();
    }
    child.material = mat;
  });
}

export function GltfMeshNoCamera({
  meshUrl,
  visualPreset,
  classVisibility,
}: {
  meshUrl: string;
  visualPreset: MeshVisualPreset;
  classVisibility: Required<MeshClassVisibility>;
}) {
  const { scene } = useGLTF(meshUrl);
  const root = useRef<THREE.Group | null>(null);

  const prepared = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    applyLungPbrToScene(c, visualPreset);
    applyLungAnatomicalOrientation(c);
    return c;
  }, [scene, meshUrl, visualPreset]);

  useLayoutEffect(() => {
    prepared.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const key = classKeyOf(child);
      if (!key) return;
      child.visible = classVisibility[key];
    });
  }, [prepared, classVisibility]);

  useLayoutEffect(() => {
    return () => {
      prepared.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    };
  }, [prepared]);

  return (
    <group ref={root} userData={{ grabbable: true }}>
      <Center>
        <primitive object={prepared} dispose={null} />
      </Center>
    </group>
  );
}

export function ProceduralLung() {
  return (
    <group userData={{ grabbable: true }}>
      <mesh>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshPhysicalMaterial
          color="#b87870"
          roughness={0.45}
          metalness={0.04}
          clearcoat={0.1}
          sheen={0.3}
          sheenRoughness={0.55}
          sheenColor="#e8c4bc"
        />
      </mesh>
    </group>
  );
}
