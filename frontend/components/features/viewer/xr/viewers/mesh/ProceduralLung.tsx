"use client";

import { useMemo } from "react";
import { createAnatomicalLungShellMaterial } from "@/lib/xr/anatomical-lung-materials";

export function ProceduralLung() {
  const shellMat = useMemo(() => createAnatomicalLungShellMaterial(), []);
  return (
    <group userData={{ grabbable: true }}>
      <mesh material={shellMat} castShadow receiveShadow>
        <icosahedronGeometry args={[0.55, 2]} />
      </mesh>
    </group>
  );
}
