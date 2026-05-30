import type * as THREE from "three";

export type LungMeshCoreProps = {
  /** Ignored when `usePlaceholder` is true. */
  meshUrl: string;
  /** Procedural mesh (no glTF fetch) when no real mesh URL exists. */
  usePlaceholder?: boolean;
  /** Opaque tissue-like shell; when false, semi-transparent shell (default XR lab). */
  realLungEnabled?: boolean;
  classVisibility?: {
    ggo: boolean;
    reticulation: boolean;
    consolidation: boolean;
    lung_shell: boolean;
  };
  /**
   * When set, pointer drag applies world-space deltas here instead of moving the
   * built-in lung group (used by the XR lab to drag the whole mesh from the parent).
   */
  onWorldDragDelta?: (delta: THREE.Vector3) => void;
  /** Disable idle Y-axis spin to keep mesh static. */
  autoRotate?: boolean;
  /** Pointer / VR grab to move the mesh. */
  allowDrag?: boolean;
  /** Override inner group position (default [0, 1.2, 0.5] for legacy 3D viewer). */
  layoutGroupPosition?: [number, number, number];
  /** Click on the lung surface to place a marker (XR annotation). */
  surfacePickMode?: boolean;
  onSurfacePick?: (worldPoint: THREE.Vector3) => void;
};

export type LungMeshClippingProps = {
  scene: THREE.Group;
  classVisibility?: LungMeshCoreProps["classVisibility"];
};
