"use client";

import { ContactShadows } from "@react-three/drei";

type ThreeViewerLightingProps = {
  useStudioWhiteLighting: boolean;
  useAnatomicalLighting: boolean;
};

/**
 * Local lights only — no drei `<Environment preset=…>` (those fetch HDR from a CDN
 * and crash View3D when offline / blocked, e.g. lebombo_1k.hdr).
 */
export function ThreeViewerLighting({
  useStudioWhiteLighting,
  useAnatomicalLighting,
}: ThreeViewerLightingProps) {
  const shadowOpacity = useStudioWhiteLighting ? 0.2 : useAnatomicalLighting ? 0.32 : 0.28;
  const shadowBlur = useStudioWhiteLighting ? 2.8 : useAnatomicalLighting ? 2.4 : 2.2;

  return (
    <>
      {useStudioWhiteLighting ? (
        <>
          <ambientLight intensity={0.72} color="#ffffff" />
          <directionalLight position={[2.8, 4.6, 2.6]} intensity={1.4} color="#ffffff" />
          <directionalLight position={[-2.2, 1.5, -1.8]} intensity={0.45} color="#e5ecff" />
          <directionalLight position={[0.5, 2.0, -3.0]} intensity={0.25} color="#ffffff" />
        </>
      ) : useAnatomicalLighting ? (
        <>
          <hemisphereLight args={["#fff6f0", "#182030", 0.9]} position={[0, 8, 0]} />
          <directionalLight position={[2.6, 5.8, 3.0]} intensity={1.65} color="#fffaf5" />
          <directionalLight position={[-3.0, 3.4, -1.4]} intensity={0.55} color="#c4d4f0" />
          <directionalLight position={[0.2, -0.8, 3.8]} intensity={0.32} color="#ffc8bc" />
          <ambientLight intensity={0.4} color="#8e9ebc" />
        </>
      ) : (
        <>
          <hemisphereLight args={["#f0e8e0", "#1a1a2e", 0.7]} position={[0, 5, 0]} />
          <directionalLight position={[3.2, 6, 2.2]} intensity={1.8} color="#fff5ed" />
          <directionalLight position={[-2.2, 2, -1.2]} intensity={0.55} color="#9eb8d8" />
          <directionalLight position={[-0.2, 0, 4.5]} intensity={0.4} color="#ffe0dc" />
          <ambientLight intensity={0.28} color="#5c6a8a" />
        </>
      )}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={shadowOpacity}
        scale={10}
        blur={shadowBlur}
        far={3.2}
        color="#0b1020"
      />
    </>
  );
}
