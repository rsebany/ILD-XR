import * as THREE from "three";

import type { MeshClassKey } from "@/lib/xr/mesh-class-key";

const CLASS_KEYS: MeshClassKey[] = ["ggo", "reticulation", "consolidation", "lung_shell"];

function nameToClassKey(name: string): MeshClassKey | null {
  const key = name.toLowerCase().trim();
  return CLASS_KEYS.find((k) => key === k || key.includes(k)) ?? null;
}

function classFromMaterialName(obj: THREE.Object3D): MeshClassKey | null {
  if (!(obj instanceof THREE.Mesh)) return null;
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const mat of mats) {
    const maybeName = (mat as THREE.Material | undefined)?.name;
    if (typeof maybeName === "string" && maybeName.trim().length > 0) {
      const fromName = nameToClassKey(maybeName);
      if (fromName) return fromName;
    }
  }
  return null;
}

/** Match GLB node / geometry names from backend `MESH_NODE_NAMES`. */
export function resolveMeshClassKey(obj: THREE.Object3D): MeshClassKey | null {
  const tagged = (obj as { userData?: { ildClass?: unknown } }).userData?.ildClass;
  if (typeof tagged === "string") {
    const fromTagged = nameToClassKey(tagged);
    if (fromTagged) return fromTagged;
  }
  let current: THREE.Object3D | null = obj;
  while (current) {
    const fromName = nameToClassKey(current.name);
    if (fromName) return fromName;
    if (current instanceof THREE.Mesh) {
      const geomName = current.geometry?.name;
      if (typeof geomName === "string" && geomName.trim().length > 0) {
        const fromGeom = nameToClassKey(geomName);
        if (fromGeom) return fromGeom;
      }
      const fromMat = classFromMaterialName(current);
      if (fromMat) return fromMat;
    }
    const ud = current.userData?.name;
    if (typeof ud === "string") {
      const fromUd = nameToClassKey(ud);
      if (fromUd) return fromUd;
    }
    current = current.parent;
  }
  return null;
}

/** Tag every mesh so materials survive GLTF nesting quirks. */
export function tagMeshClassKeys(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const key = resolveMeshClassKey(child);
    if (key) {
      child.userData.ildClass = key;
    }
  });
}
