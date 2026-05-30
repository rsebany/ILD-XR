import { useMemo } from "react";
import * as THREE from "three";
import { applyLungPbrToScene } from "@/components/features/viewer/xr/viewers/mesh/lung-pbr";
import type { MeshVisualPreset } from "@/components/features/viewer/xr/viewers/three-viewer.types";
import { applyLungAnatomicalOrientation } from "@/lib/xr/lung-orientation";
import { resolveMeshClassKey, tagMeshClassKeys } from "@/lib/xr/resolve-mesh-class-key";
import type { LungMeshClippingProps } from "./lung-mesh.types";

export function LungMeshClipping({
  scene,
  classVisibility,
  visualPreset = "default",
}: LungMeshClippingProps & {
  visualPreset?: MeshVisualPreset;
}) {
  const preparedScene = useMemo(() => {
    const clone = scene.clone();
    tagMeshClassKeys(clone);
    applyLungAnatomicalOrientation(clone);
    applyLungPbrToScene(clone, visualPreset);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      const key = resolveMeshClassKey(child);
      if (key && classVisibility) {
        child.visible = classVisibility[key];
      }
      const mats = Array.isArray(child.material)
        ? (child.material as THREE.Material[])
        : [child.material as THREE.Material];
      mats.forEach((m) => {
        m.clippingPlanes = [];
        m.clipIntersection = false;
        m.side = THREE.DoubleSide;
      });
    });

    const bounds = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const normalizedScale = 1.6 / maxDim;

    return { clone, center, normalizedScale };
  }, [scene, classVisibility, visualPreset]);

  const offset = preparedScene.center
    .clone()
    .multiplyScalar(-preparedScene.normalizedScale);

  return (
    <group scale={preparedScene.normalizedScale} position={offset}>
      <primitive object={preparedScene.clone} />
    </group>
  );
}
