import * as THREE from "three";

const BAND_FRACTION = 0.12;

/**
 * Backend meshes: marching_cubes on mask [Z,Y,X] → vertex (x,y,z) = (Z_mm, Y_mm, X_mm).
 * Cranio-caudal is always vertex X → rotate +90° around Z so SI aligns with world +Y.
 */
const BACKEND_SI_TO_WORLD_Y = new THREE.Euler(0, 0, Math.PI / 2, "XYZ");

function bandCrossSectionArea(
  root: THREE.Object3D,
  yLow: number,
  yHigh: number,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;
  const v = new THREE.Vector3();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i);
      child.localToWorld(v);
      if (v.y < yLow || v.y > yHigh) continue;
      count += 1;
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  });

  if (count === 0) return 0;
  return Math.max(maxX - minX, 0) * Math.max(maxZ - minZ, 0);
}

/** Apex is narrower than the base; if the top band is wider, flip 180° around Y. */
function isUpsideDownAfterYAlign(root: THREE.Object3D): boolean {
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  if (height <= 1e-6) return false;

  const band = height * BAND_FRACTION;
  const topArea = bandCrossSectionArea(root, box.max.y - band, box.max.y);
  const bottomArea = bandCrossSectionArea(root, box.min.y, box.min.y + band);
  if (topArea <= 0 || bottomArea <= 0) return false;

  return topArea > bottomArea;
}

/** Upright lung: apex toward world +Y (standing in the OR). */
export function applyLungAnatomicalOrientation(root: THREE.Object3D): void {
  root.rotation.copy(BACKEND_SI_TO_WORLD_Y);
  root.updateMatrixWorld(true);

  // Inverse du test apex/base : retourne le mesh de 180° par rapport à la version précédente.
  if (!isUpsideDownAfterYAlign(root)) {
    root.rotateY(Math.PI);
    root.updateMatrixWorld(true);
  }
}
