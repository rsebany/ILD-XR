export type XrImmersiveToolbarMode = "vr" | "ar";
export type XrToolbarDock = "right";

export function parseXrToolbarDock(raw: string | null): XrToolbarDock {
  void raw;
  return "right";
}

export type MeshClassVisibility = {
  ggo: boolean;
  reticulation: boolean;
  consolidation: boolean;
  lung_shell: boolean;
};

export type XrBottomToolbarProps = {
  onFocusStack: () => void;
  onFocusMesh: () => void;
  onBalancedView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  onEnterImmersiveCentered: () => void | Promise<void>;
  onToggleFullscreen?: () => void;
  alternateLabHref: string;
  alternateLabShortLabel: string;
  immersiveMode: XrImmersiveToolbarMode;
  isImmersiveSupported: boolean;
  isCheckingSupport?: boolean;
  meshClassVisibility: MeshClassVisibility;
  onToggleMeshClass: (key: keyof MeshClassVisibility) => void;
  realLungEnabled?: boolean;
  onToggleRealLung?: () => void;
};
