import * as THREE from "three";

const BAND_FRACTION = 0.12;

/**
 * Marching-cubes verts are (z, y, x) indices × spacing → stored in GLB as
 * Three.js (x, y, z) = (z_mm, y_mm, x_mm). Map to clinical Y-up:
 *   X = left–right (x_mm), Y = cranio-caudal (z_mm), Z = anterior–posterior (−y_mm).
 */
export const BACKEND_MM_TO_THREEJS = new THREE.Matrix4().set(
  0, 0, 1, 0,
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
);

function bandCrossSectionAreaXZ(
  positions: THREE.BufferAttribute,
  yLow: number,
  yHigh: number,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let count = 0;

  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    if (y < yLow || y > yHigh) continue;
    count += 1;
    const x = positions.getX(i);
    const z = positions.getZ(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  if (count === 0) return 0;
  return Math.max(maxX - minX, 0) * Math.max(maxZ - minZ, 0);
}

/** Apex is narrower; if the +Y band is wider than the −Y band, reflect Y. */
function reflectVerticesIfApexDown(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos || pos.count === 0) return;

  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const height = yMax - yMin;
  if (height <= 1e-6) return;

  const band = height * BAND_FRACTION;
  const topArea = bandCrossSectionAreaXZ(pos, yMax - band, yMax);
  const bottomArea = bandCrossSectionAreaXZ(pos, yMin, yMin + band);
  if (topArea <= 0 || bottomArea <= 0) return;
  if (topArea <= bottomArea) return;

  const mid = (yMin + yMax) / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setY(i, 2 * mid - y);
  }
  pos.needsUpdate = true;
}

export function orientLungMeshGeometry(geometry: THREE.BufferGeometry): void {
  geometry.applyMatrix4(BACKEND_MM_TO_THREEJS);
  reflectVerticesIfApexDown(geometry);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** Upright lung in View3D / XR: apex toward +Y. */
export function applyLungAnatomicalOrientation(root: THREE.Object3D): void {
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const oriented = child.geometry.clone();
    orientLungMeshGeometry(oriented);
    child.geometry.dispose();
    child.geometry = oriented;
  });

  root.updateMatrixWorld(true);
}
