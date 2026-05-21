"use client";

import React, { Component, Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { HospitalBackground } from "@/components/features/viewer/component/xr/backgrounds/HospitalBackground";
import { XR_CLINICAL_ZONE } from "@/components/xr/xr-layout";

/** Dark procedural room so VR never shows an empty white void when GLTF assets are missing. */
export function DarkFallbackRoom() {
  const [cx, cy, cz] = XR_CLINICAL_ZONE.center;
  return (
    <group position={[cx, cy - 0.6, cz]}>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[14, 5, 14]} />
        <meshBasicMaterial color="#111827" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color="#2a3441" roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 40]} />
        <meshBasicMaterial color="#5b6674" transparent opacity={0.35} />
      </mesh>
      <pointLight position={[0, 2.8, 1.2]} intensity={0.35} color="#7dd3fc" />
      <pointLight position={[-2, 1.6, -1]} intensity={0.2} color="#94a3b8" />
    </group>
  );
}

type BoundaryProps = {
  children: React.ReactNode;
  onFailed?: () => void;
};

type BoundaryState = { failed: boolean };

class HospitalLoadBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Hospital environment failed to load; using dark fallback room.", error);
    this.props.onFailed?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

async function hospitalBinAvailable(): Promise<boolean> {
  try {
    const response = await fetch("/xr/backgrounds/hospital/scene.bin", { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

/** Hospital GLTF when assets exist; dark procedural room only if the GLB is missing. */
export function XrEnvironmentLayer() {
  const [assetsReady, setAssetsReady] = useState<boolean | null>(null);
  const [hospitalFailed, setHospitalFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hospitalBinAvailable().then((ok) => {
      if (!cancelled) setAssetsReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showHospital = assetsReady === true && !hospitalFailed;

  return (
    <>
      {!showHospital && <DarkFallbackRoom />}
      {assetsReady === true && (
        <HospitalLoadBoundary onFailed={() => setHospitalFailed(true)}>
          <Suspense fallback={null}>
            <HospitalBackground />
          </Suspense>
        </HospitalLoadBoundary>
      )}
    </>
  );
}
