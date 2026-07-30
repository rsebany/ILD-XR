import type { ArQualityPreset } from "../experience/types";
import type { MeshClassKey } from "../experience/types";

export type MeshClassVisibility = Record<MeshClassKey, boolean>;

export type XRSceneContentProps = {
  meshUrl: string;
  useMeshPlaceholder: boolean;
  realLungEnabled?: boolean;
  onToggleRealLung?: () => void;
  onResetView: () => void;
  studyId: string | null;
  dicomSliceCount: number;
  currentDicomSlice: number;
  onDicomSliceChange: (slice: number) => void;
  focusStackNonce: number;
  focusMeshNonce: number;
  focusBalancedNonce: number;
  meshScale: number;
  classVisibility: MeshClassVisibility;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  onToggleMeshClass: (key: keyof MeshClassVisibility) => void;
  sceneVariant?: "vr" | "ar";
  arQuality?: ArQualityPreset;
  onArQualityChange: (next: ArQualityPreset) => void;
  syncConnected: boolean;
  isDicomPlaying: boolean;
  onToggleDicomPlay: () => void;
  onPauseDicomPlay: () => void;
  vrSpawnNonce?: number;
};
