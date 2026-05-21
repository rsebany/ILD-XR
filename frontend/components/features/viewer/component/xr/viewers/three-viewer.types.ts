"use client";

import type { DicomSpacingMm, DicomVoxelCount } from "@/components/features/viewer/component/view3d/DicomAxialStack3D";

export type DicomContext3D = {
  studyId: string;
  maxSlices: number;
  currentSlice: number;
};

/**
 * GLB sub-mesh keys — must match `MESH_NODE_NAMES` in
 * `Backend-api/services/inference.py` so the per-class toggle in
 * `View3DReconstructionPanel` lines up with what trimesh exported.
 */
export type MeshClassKey = "ggo" | "reticulation" | "consolidation" | "lung_shell";

export type MeshClassVisibility = Partial<Record<MeshClassKey, boolean>>;

export const DEFAULT_MESH_CLASS_VISIBILITY: Required<MeshClassVisibility> = {
  ggo: true,
  reticulation: true,
  consolidation: true,
  lung_shell: true,
};

export type MeshVisualPreset = "default" | "segmentationWhite";

export type ThreeViewerProps = {
  /** GLTF/GLB URL. Ignored when `usePlaceholder` is true or `showMesh` is false. */
  meshUrl: string;
  /**
   * Optional second GLB (e.g. expert reference) shown beside ``meshUrl`` for comparison.
   * Same node naming as the primary mesh (ggo / reticulation / consolidation / lung_shell).
   */
  compareMeshUrl?: string | null;
  /** World-space offset for the primary mesh when ``compareMeshUrl`` is set. */
  comparePrimaryPosition?: [number, number, number];
  /** World-space offset for the compare (secondary) mesh. */
  compareSecondaryPosition?: [number, number, number];
  /** When no real mesh is available, show a procedural stand-in (no 404, no CORS). */
  usePlaceholder?: boolean;
  /** If false, only the DICOM stack (when `dicomContext` is set) is shown — no mesh. */
  showMesh?: boolean;
  backgroundColor?: string;
  /**
   * When set, shows the same axial DICOM stack in the WebGL scene (server /slices PNGs)
   * beside the lung mesh so the volume is visible in 3D, not only a surface patch.
   */
  dicomContext?: DicomContext3D | null;
  /** Overlay on slice PNGs (e.g. false for pure CT in 3D). */
  dicomIncludeOverlay?: boolean;
  /** Passed to DicomAxialStack3D to control stack density. */
  dicomMaxStackSlices?: number;
  /** DICOM (H,W) voxels and (z,y,x) mm spacing for lung-true 3D proportions. */
  dicomVoxelCount?: DicomVoxelCount | null;
  dicomSpacingMm?: DicomSpacingMm | null;
  /** Visual style for mesh rendering. */
  visualPreset?: MeshVisualPreset;
  /**
   * Per-class visibility for GLB sub-meshes (matched by node/geometry name —
   * see `MESH_NODE_NAMES` on the backend). Missing keys default to visible.
   */
  classVisibility?: MeshClassVisibility;
};
