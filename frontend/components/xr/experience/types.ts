export type XrExperienceMode = "vr" | "ar";
export type ArQualityPreset = "performance" | "balanced" | "quality";

export type MeshClassKey = "emphysema" | "fibrosis" | "ground_glass" | "micronodules" | "consolidation" | "lung_shell";
export type MeshClassVisibility = Record<MeshClassKey, boolean>;

export const DEFAULT_MESH_CLASS_VISIBILITY: MeshClassVisibility = {
  emphysema: true,
  fibrosis: true,
  ground_glass: true,
  micronodules: true,
  consolidation: true,
  lung_shell: true,
};

export function isMobileArDevice(): boolean {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent.toLowerCase();
  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coarsePointer || /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}
