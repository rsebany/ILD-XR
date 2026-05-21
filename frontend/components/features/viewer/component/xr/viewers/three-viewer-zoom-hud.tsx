"use client";

import React from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControlsHandle } from "./three-viewer-camera";

export function ZoomHud({
  controlsRef,
  minDistance,
  maxDistance,
}: {
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
  minDistance: number;
  maxDistance: number;
}) {
  const { camera } = useThree();

  const applyZoom = (factor: number) => {
    const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);
    const toCamera = camera.position.clone().sub(target);
    const currentDistance = Math.max(0.0001, toCamera.length());
    const nextDistance = THREE.MathUtils.clamp(currentDistance * factor, minDistance, maxDistance);
    toCamera.setLength(nextDistance);
    camera.position.copy(target.clone().add(toCamera));
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  };

  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => applyZoom(0.85)}
          style={{
            pointerEvents: "auto",
            width: 34,
            height: 34,
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.45)",
            background: "rgba(2,6,23,0.74)",
            color: "#e2e8f0",
            fontSize: 20,
            lineHeight: "20px",
            cursor: "pointer",
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => applyZoom(1.15)}
          style={{
            pointerEvents: "auto",
            width: 34,
            height: 34,
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.45)",
            background: "rgba(2,6,23,0.74)",
            color: "#e2e8f0",
            fontSize: 20,
            lineHeight: "20px",
            cursor: "pointer",
          }}
        >
          -
        </button>
      </div>
    </Html>
  );
}
