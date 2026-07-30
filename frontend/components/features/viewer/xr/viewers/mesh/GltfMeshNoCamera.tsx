"use client";

import React, { useLayoutEffect, useMemo, useRef } from "react";
import { Center, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { applyLungAnatomicalOrientation } from "@/lib/xr/lung-orientation";
import { tagMeshClassKeys } from "@/lib/xr/resolve-mesh-class-key";
import type { MeshClassVisibility, MeshVisualPreset, ZoneFilter } from "../three-viewer.types";
import { applyLungPbrToScene, classKeyOf } from "./lung-pbr";

/**
 * After anatomical orientation, Y is cranio-caudal with apex toward +Y.
 * Three.js keeps the half-space where normal·point + constant >= 0.
 */
function getZoneClipPlanesFromBox(box: THREE.Box3, zone: ZoneFilter): THREE.Plane[] {
  if (zone === "all") return [];
  const minY = box.min.y;
  const maxY = box.max.y;
  const range = maxY - minY;
  if (range <= 1e-6) return [];
  const third = range / 3;
  // Apex (+Y) = upper; base (−Y) = lower
  const lowerMax = minY + third;
  const middleMax = minY + 2 * third;
  const planes: THREE.Plane[] = [];
  if (zone === "upper") {
    // keep y >= middleMax and y <= maxY
    planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -middleMax));
    planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY));
  } else if (zone === "middle") {
    // keep y >= lowerMax and y <= middleMax
    planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -lowerMax));
    planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), middleMax));
  } else if (zone === "lower") {
    // keep y >= minY and y <= lowerMax
    planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY));
    planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), lowerMax));
  }
  return planes;
}

function applyClipPlanesToScene(scene: THREE.Object3D, planes: THREE.Plane[]) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material)
      ? (child.material as THREE.Material[])
      : [child.material as THREE.Material];
    mats.forEach((m) => {
      if (
        m instanceof THREE.MeshStandardMaterial ||
        m instanceof THREE.MeshPhysicalMaterial
      ) {
        m.clippingPlanes = planes;
        m.clipIntersection = false;
        m.clipShadows = true;
        m.needsUpdate = true;
      }
    });
  });
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
  const { gl } = useThree();

  const prepared = useMemo(() => {
    const c = scene.clone();
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.geometry) o.geometry.computeVertexNormals();
      }
    });
    tagMeshClassKeys(c);
    applyLungAnatomicalOrientation(c);
    applyLungPbrToScene(c, visualPreset);
    return c;
  }, [scene, meshUrl, visualPreset]);

  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  useLayoutEffect(() => {
    prepared.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const key = classKeyOf(child);
      if (!key) return;
      child.visible = classVisibility[key];
    });
  }, [prepared, classVisibility]);

  // Zone clipping — world-space planes after <Center> has laid out the mesh
  useLayoutEffect(() => {
    const apply = () => {
      if (!root.current) {
        applyClipPlanesToScene(prepared, []);
        return;
      }
      root.current.updateWorldMatrix(true, true);
      if (zoneFilter === "all") {
        applyClipPlanesToScene(prepared, []);
        return;
      }
      const box = new THREE.Box3().setFromObject(root.current);
      if (box.isEmpty()) {
        applyClipPlanesToScene(prepared, []);
        return;
      }
      applyClipPlanesToScene(prepared, getZoneClipPlanesFromBox(box, zoneFilter));
    };

    apply();
    // Center adjusts in its own layout effect; re-apply next frame so world AABB is final
    const id = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(id);
      applyClipPlanesToScene(prepared, []);
    };
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
