import * as THREE from "three";

import type { MeshClassKey } from "@/lib/xr/mesh-class-key";

const LESION_COLORS: Record<Exclude<MeshClassKey, "lung_shell">, number> = {
  emphysema: 0x1a5fcc,
  fibrosis: 0xcc7000,
  ground_glass: 0x4a9e4a,
  micronodules: 0xbb33bb,
  consolidation: 0xd4a020,
};

export type AnatomicalLungStyle = "semi" | "real";

/** Lung envelope: either semi-transparent shell or opaque tissue-like shell. */
export function createAnatomicalLungShellMaterial(
  style: AnatomicalLungStyle = "real",
): THREE.MeshPhysicalMaterial {
  if (style === "semi") {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xcf9389),
      roughness: 0.62,
      metalness: 0,
      transmission: 0.22,
      thickness: 0.95,
      ior: 1.36,
      attenuationColor: new THREE.Color(0xffd9d2),
      attenuationDistance: 0.95,
      clearcoat: 0.05,
      clearcoatRoughness: 0.82,
      sheen: 0.42,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xffe7e0),
      envMapIntensity: 1.05,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xc4847a),
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.78,
    sheen: 0.48,
    sheenRoughness: 0.68,
    sheenColor: new THREE.Color(0xffddd4),
    envMapIntensity: 1.15,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

/** Solid ILD foci inside the parenchyma. */
export function createAnatomicalLesionMaterial(
  classKey: Exclude<MeshClassKey, "lung_shell">,
  style: AnatomicalLungStyle = "real",
): THREE.MeshPhysicalMaterial {
  const emphasizeInsideShell = style === "semi";
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(LESION_COLORS[classKey]),
    roughness: emphasizeInsideShell ? 0.62 : 0.72,
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.9,
    sheen: emphasizeInsideShell ? 0.24 : 0.18,
    sheenRoughness: emphasizeInsideShell ? 0.72 : 0.8,
    sheenColor: new THREE.Color(0xfff8f2),
    envMapIntensity: emphasizeInsideShell ? 0.9 : 0.75,
    emissive: emphasizeInsideShell ? new THREE.Color(LESION_COLORS[classKey]) : new THREE.Color(0x000000),
    emissiveIntensity: emphasizeInsideShell ? 0.07 : 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
}

export function createAnatomicalParenchymaFallbackMaterial(
  useVertexColors: boolean,
  style: AnatomicalLungStyle = "real",
): THREE.MeshPhysicalMaterial {
  if (style === "semi") {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xc98b82),
      vertexColors: useVertexColors,
      roughness: 0.66,
      metalness: 0,
      transmission: 0.14,
      thickness: 0.55,
      clearcoat: 0.04,
      clearcoatRoughness: 0.84,
      sheen: 0.34,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xffe3db),
      envMapIntensity: 0.98,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xbf7d72),
    vertexColors: useVertexColors,
    roughness: 0.76,
    metalness: 0,
    clearcoat: 0.05,
    clearcoatRoughness: 0.88,
    sheen: 0.35,
    sheenRoughness: 0.74,
    sheenColor: new THREE.Color(0xffe0d6),
    envMapIntensity: 0.9,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}
