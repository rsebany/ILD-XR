"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Center, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { applyLungAnatomicalOrientation } from "@/lib/xr/lung-orientation";
import { tagMeshClassKeys } from "@/lib/xr/resolve-mesh-class-key";
import type { MeshClassVisibility, MeshVisualPreset, ZoneFilter } from "../three-viewer.types";
import { applyLungPbrToScene, classKeyOf } from "./lung-pbr";

function getZoneClipPlanes(scene: THREE.Object3D, zone: ZoneFilter): THREE.Plane[] {
  if (zone === "all") return [];
  const box = new THREE.Box3().setFromObject(scene);
  const minZ = box.min.z;
  const maxZ = box.max.z;
  const range = maxZ - minZ;
  if (range <= 0) return [];
  const third = range / 3;
  // In CT space: lower z = apex (upper zone), higher z = base (lower zone)
  const upperMax = minZ + third;
  const middleMax = minZ + 2 * third;
  const planes: THREE.Plane[] = [];
  if (zone === "upper") {
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), -minZ));   // keep z >= minZ
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), upperMax)); // keep z <= upperMax
  } else if (zone === "middle") {
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), -upperMax));  // keep z >= upperMax
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), middleMax));   // keep z <= middleMax
  } else if (zone === "lower") {
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), -middleMax)); // keep z >= middleMax
    planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), maxZ));        // keep z <= maxZ
  }
  return planes;
}

export function GltfMeshNoCamera({
  meshUrl,
  visualPreset,
  classVisibility,
  zoneFilter = "all",
}: {
  meshUrl: string;
  visualPreset: MeshVisualPreset;
  classVisibility: Required<MeshClassVisibility>;
  zoneFilter?: ZoneFilter;
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
    tagMeshClassKeys(c);
    applyLungAnatomicalOrientation(c);
    applyLungPbrToScene(c, visualPreset);
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

  // Zone clipping
  useLayoutEffect(() => {
    const planes = getZoneClipPlanes(prepared, zoneFilter);
    prepared.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material)
        ? (child.material as THREE.Material[])
        : [child.material as THREE.Material];
      mats.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
          m.clippingPlanes = planes;
          m.clipIntersection = false;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
      });
    });
  }, [prepared, zoneFilter]);

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
