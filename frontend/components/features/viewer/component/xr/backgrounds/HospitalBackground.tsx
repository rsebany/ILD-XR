"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { XR_CLINICAL_ZONE } from "@/components/xr/xr-layout";

const HOSPITAL_SCENE_URL = "/xr/backgrounds/hospital/scene.gltf";
const HOSPITAL_RESOURCE_PATH = "/xr/backgrounds/hospital/";
const TARGET_FOOTPRINT_METERS = 22;
/** GLTF glass uses ~0.04 alpha; lower values break WebGL validation in WebXR on some GPUs. */
const MIN_HOSPITAL_GLASS_OPACITY = 0.12;

function hasUsableTexture(map: THREE.Texture | null | undefined): map is THREE.Texture {
  const image = map?.image as { width?: number; height?: number } | undefined;
  return Boolean(image && image.width && image.height);
}

/** Stabilize GLTF unlit/blend materials for WebXR (Quest, mobile AR) and local clipping. */
function sanitizeHospitalMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    const apply = (mat: THREE.Material) => {
      const m = mat.clone();
      m.clippingPlanes = [];
      m.clipShadows = false;

      if (m instanceof THREE.MeshBasicMaterial) {
        if (m.map && !hasUsableTexture(m.map)) {
          m.map = null;
        }
        if (m.alphaMap && !hasUsableTexture(m.alphaMap)) {
          m.alphaMap = null;
        }

        const needsBlend = m.transparent || m.opacity < 1;
        if (needsBlend) {
          m.transparent = true;
          m.depthWrite = false;
          if (m.opacity < MIN_HOSPITAL_GLASS_OPACITY) {
            m.opacity = MIN_HOSPITAL_GLASS_OPACITY;
            m.alphaTest = 0.02;
          }
        }
      }

      m.needsUpdate = true;
      return m;
    };

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(apply);
    } else if (obj.material) {
      obj.material = apply(obj.material);
    }
  });
}

/** World-space anchor for the operative table / workspace inside the GLB. */
function resolveOrInteriorAnchor(
  root: THREE.Object3D,
  fittedBox: THREE.Box3,
): THREE.Vector3 {
  const opBox = new THREE.Box3();
  let matched = false;
  root.traverse((obj) => {
    if (obj.name === "OP_Mitte" || obj.name?.startsWith("OP_Mitte_")) {
      opBox.expandByObject(obj);
      matched = true;
    }
  });
  if (matched && !opBox.isEmpty()) {
    return opBox.getCenter(new THREE.Vector3());
  }

  const fallback = new THREE.Vector3();
  fittedBox.getCenter(fallback);
  const size = new THREE.Vector3();
  fittedBox.getSize(size);
  fallback.y = fittedBox.min.y + size.y * 0.38;
  return fallback;
}

export function HospitalBackground() {
  const { scene } = useGLTF(HOSPITAL_SCENE_URL, false, false, (loader) => {
    (loader as unknown as GLTFLoader).setResourcePath(HOSPITAL_RESOURCE_PATH);
  });
  const { preparedScene, position, scale } = useMemo(() => {
    const clone = scene.clone(true);
    sanitizeHospitalMaterials(clone);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const footprint = Math.max(size.x, size.z, 1e-3);
    const fittedScale = TARGET_FOOTPRINT_METERS / footprint;
    const floorY = box.min.y * fittedScale;
    const basePosition = new THREE.Vector3(
      -center.x * fittedScale,
      -floorY,
      -center.z * fittedScale,
    );

    clone.scale.setScalar(fittedScale);
    clone.position.copy(basePosition);
    clone.updateMatrixWorld(true);

    const fittedBox = new THREE.Box3().setFromObject(clone);
    const roomAnchor = resolveOrInteriorAnchor(clone, fittedBox);
    const [tx, ty, tz] = XR_CLINICAL_ZONE.center;

    clone.scale.setScalar(1);
    clone.position.set(0, 0, 0);

    return {
      preparedScene: clone,
      scale: fittedScale,
      position: [
        basePosition.x + (tx - roomAnchor.x),
        basePosition.y + (ty - roomAnchor.y),
        basePosition.z + (tz - roomAnchor.z),
      ] as [number, number, number],
    };
  }, [scene]);

  return (
    <group position={position} scale={scale}>
      <primitive object={preparedScene} />
    </group>
  );
}

// Preload hospital environment for smoother XR entry
useGLTF.preload(HOSPITAL_SCENE_URL);
