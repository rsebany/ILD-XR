"use client";

import { ImmersiveButton, ImmersiveToggleButton } from "../immersive-ui";
import type { ArQualityPreset } from "../experience/types";
import type { MeshClassVisibility } from "./types";

const OFFSET: [number, number, number] = [0, 0.25, 1.3];

type Props = {
  classVisibility: MeshClassVisibility;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  onToggleMeshClass: (key: keyof MeshClassVisibility) => void;
  isArImmersive: boolean;
  arQuality: ArQualityPreset;
  onArQualityChange: (next: ArQualityPreset) => void;
  onCenterAr: () => void;
};

export function ImmersiveSceneControls({
  classVisibility,
  onZoomIn,
  onZoomOut,
  onPresetAll,
  onPresetLesions,
  onPresetShell,
  onToggleMeshClass,
  isArImmersive,
  arQuality,
  onArQualityChange,
  onCenterAr,
}: Props) {
  return (
    <group position={OFFSET}>
      <ImmersiveButton label="+" position={[-0.14, 0.46, 0]} color="#0ea5e9" onSelect={onZoomIn} />
      <ImmersiveButton label="-" position={[0.14, 0.46, 0]} color="#475569" onSelect={onZoomOut} />
      <ImmersiveButton label="All" position={[-0.24, 0.26, 0]} color="#0284c7" onSelect={onPresetAll} />
      <ImmersiveButton label="Lesions" position={[0, 0.26, 0]} color="#7c3aed" onSelect={onPresetLesions} />
      <ImmersiveButton label="Shell" position={[0.24, 0.26, 0]} color="#334155" onSelect={onPresetShell} />
      <ImmersiveToggleButton label="GGO" active={classVisibility.ggo} position={[-0.39, 0.04, 0]} activeColor="#059669" onSelect={() => onToggleMeshClass("ggo")} />
      <ImmersiveToggleButton label="Retic" active={classVisibility.reticulation} position={[-0.13, 0.04, 0]} activeColor="#7c3aed" onSelect={() => onToggleMeshClass("reticulation")} />
      <ImmersiveToggleButton label="Cons" active={classVisibility.consolidation} position={[0.13, 0.04, 0]} activeColor="#d97706" onSelect={() => onToggleMeshClass("consolidation")} />
      <ImmersiveToggleButton label="Shell" active={classVisibility.lung_shell} position={[0.39, 0.04, 0]} activeColor="#334155" onSelect={() => onToggleMeshClass("lung_shell")} />
      {isArImmersive ? (
        <>
          <ImmersiveButton label="Center" position={[0, -0.22, 0]} color="#0369a1" width={0.28} onSelect={onCenterAr} />
          <ImmersiveToggleButton label="Perf" active={arQuality === "performance"} position={[-0.28, -0.4, 0]} activeColor="#0891b2" onSelect={() => onArQualityChange("performance")} />
          <ImmersiveToggleButton label="Bal" active={arQuality === "balanced"} position={[0, -0.4, 0]} activeColor="#0891b2" onSelect={() => onArQualityChange("balanced")} />
          <ImmersiveToggleButton label="Qual" active={arQuality === "quality"} position={[0.28, -0.4, 0]} activeColor="#0891b2" onSelect={() => onArQualityChange("quality")} />
        </>
      ) : null}
    </group>
  );
}
