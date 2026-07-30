"use client";

import { useCallback, useState } from "react";
import { DEFAULT_MESH_CLASS_VISIBILITY, type MeshClassVisibility } from "./types";

export function useMeshClassPresets() {
  const [meshClassVisibility, setMeshClassVisibility] = useState<MeshClassVisibility>(
    DEFAULT_MESH_CLASS_VISIBILITY,
  );

  const applyAllOnPreset = useCallback(() => setMeshClassVisibility(DEFAULT_MESH_CLASS_VISIBILITY), []);
  const applyLesionsOnlyPreset = useCallback(
    () =>
      setMeshClassVisibility({
        emphysema: true,
        fibrosis: true,
        ground_glass: true,
        micronodules: true,
        consolidation: true,
        lung_shell: false,
      }),
    [],
  );
  const applyShellOnlyPreset = useCallback(
    () =>
      setMeshClassVisibility({
        emphysema: false,
        fibrosis: false,
        ground_glass: false,
        micronodules: false,
        consolidation: false,
        lung_shell: true,
      }),
    [],
  );

  const toggleMeshClass = useCallback((key: keyof MeshClassVisibility) => {
    setMeshClassVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return {
    meshClassVisibility,
    setMeshClassVisibility,
    applyAllOnPreset,
    applyLesionsOnlyPreset,
    applyShellOnlyPreset,
    toggleMeshClass,
  };
}
