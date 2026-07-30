import * as THREE from "three";
import {
  type AnatomicalLungStyle,
  createAnatomicalLesionMaterial,
  createAnatomicalLungShellMaterial,
  createAnatomicalParenchymaFallbackMaterial,
} from "@/lib/xr/anatomical-lung-materials";
import { resolveMeshClassKey } from "@/lib/xr/resolve-mesh-class-key";
import type { MeshClassKey, MeshVisualPreset } from "../three-viewer.types";

const SEGMENTATION_CLASS_COLORS: Record<Exclude<MeshClassKey, "lung_shell">, number> = {
  emphysema: 0x2b77ff,
  fibrosis: 0xff8c00,
  ground_glass: 0x66cc66,
  micronodules: 0xdd44dd,
  consolidation: 0xffe640,
};
const SHELL_COLOR = 0xc4847a;

const CLASS_COLOR_VECTORS: Record<MeshClassKey, THREE.Color> = {
  emphysema: new THREE.Color(SEGMENTATION_CLASS_COLORS.emphysema),
  fibrosis: new THREE.Color(SEGMENTATION_CLASS_COLORS.fibrosis),
  ground_glass: new THREE.Color(SEGMENTATION_CLASS_COLORS.ground_glass),
  micronodules: new THREE.Color(SEGMENTATION_CLASS_COLORS.micronodules),
  consolidation: new THREE.Color(SEGMENTATION_CLASS_COLORS.consolidation),
  lung_shell: new THREE.Color(SHELL_COLOR),
};

function disposeMeshMaterials(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((m) => m.dispose());
  } else {
    mesh.material?.dispose();
  }
}

function inferClassKeyFromVertexColors(
  geometry: THREE.BufferGeometry | undefined,
): MeshClassKey | null {
  const colorAttr = geometry?.getAttribute("color");
  if (!(colorAttr instanceof THREE.BufferAttribute) || colorAttr.itemSize < 3) {
    return null;
  }
  const sampleCount = Math.min(colorAttr.count, 2048);
  if (sampleCount <= 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < sampleCount; i++) {
    r += colorAttr.getX(i);
    g += colorAttr.getY(i);
    b += colorAttr.getZ(i);
  }
  const avg = new THREE.Color(r / sampleCount, g / sampleCount, b / sampleCount);
  let best: MeshClassKey = "lung_shell";
  let minDist = Number.POSITIVE_INFINITY;
  (Object.keys(CLASS_COLOR_VECTORS) as MeshClassKey[]).forEach((key) => {
    const c = CLASS_COLOR_VECTORS[key];
    const dist =
      (avg.r - c.r) * (avg.r - c.r) +
      (avg.g - c.g) * (avg.g - c.g) +
      (avg.b - c.b) * (avg.b - c.b);
    if (dist < minDist) {
      minDist = dist;
      best = key;
    }
  });
  return best;
}

export function classKeyOf(mesh: THREE.Mesh): MeshClassKey | null {
  const tagged = mesh.userData?.ildClass;
  if (typeof tagged === "string" && tagged.length > 0) {
    return tagged as MeshClassKey;
  }
  const resolved = resolveMeshClassKey(mesh);
  if (resolved) return resolved;
  return inferClassKeyFromVertexColors(mesh.geometry);
}

function buildLungMeshMaterial(
  visualPreset: MeshVisualPreset,
  classKey: MeshClassKey | null,
  geometry: THREE.BufferGeometry,
): THREE.MeshPhysicalMaterial {
  const isLungShell = classKey === "lung_shell";
  const lesionKey =
    classKey && classKey !== "lung_shell" ? classKey : null;
  const hasVc =
    visualPreset === "default" && !lesionKey && Boolean(geometry.getAttribute("color"));

  if (visualPreset === "anatomicalLung" || visualPreset === "anatomicalSemi") {
    const anatomicalStyle: AnatomicalLungStyle =
      visualPreset === "anatomicalSemi" ? "semi" : "real";
    if (isLungShell) {
      return createAnatomicalLungShellMaterial(anatomicalStyle);
    }
    if (lesionKey) {
      return createAnatomicalLesionMaterial(lesionKey, anatomicalStyle);
    }
    return createAnatomicalParenchymaFallbackMaterial(hasVc, anatomicalStyle);
  }

  const lungFallback = 0xcc8c84;
  const sheenR = 0.85;
  const sheenG = 0.7;
  const sheenB = 0.68;
  const classColor = lesionKey ? SEGMENTATION_CLASS_COLORS[lesionKey] : undefined;
  const baseColor =
    visualPreset === "segmentationWhite" ? 0xffffff : classColor ?? (hasVc ? 0xffffff : lungFallback);

  return new THREE.MeshPhysicalMaterial({
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
}

/** Soft tissue: vertex colors (from AI/lobe tint) or uniform lung-rose. */
export function applyLungPbrToScene(root: THREE.Object3D, visualPreset: MeshVisualPreset) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const g = child.geometry;
    g.computeVertexNormals();
    const classKey = classKeyOf(child);
    if (classKey) {
      child.userData.ildClass = classKey;
    }
    const mat = buildLungMeshMaterial(visualPreset, classKey, g);
    disposeMeshMaterials(child);
    child.material = mat;
    child.userData.ildVisualPreset = visualPreset;
    if (classKey === "lung_shell") {
      child.renderOrder = 1;
    } else if (classKey) {
      child.renderOrder = 3;
    }
  });
}
