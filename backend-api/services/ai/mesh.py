from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import trimesh
import trimesh.smoothing
from skimage.measure import marching_cubes

from services.ai.constants import CLASS_LABELS
from services.ai.geometry import lung_mask_from_hu

MESH_NODE_NAMES: Dict[str, str] = {
    "ggo": "ggo",
    "reticulation": "reticulation",
    "consolidation": "consolidation",
    "lung_shell": "lung_shell",
}
_MESH_PALETTE: Dict[str, np.ndarray] = {
    "ggo": np.array([0, 200, 170, 255], dtype=np.uint8),
    "reticulation": np.array([142, 92, 255, 255], dtype=np.uint8),
    "consolidation": np.array([255, 143, 77, 255], dtype=np.uint8),
    "lung_shell": np.array([204, 140, 132, 110], dtype=np.uint8),
}


def _build_class_submesh(
    binary_mask: np.ndarray,
    spacing_arr: np.ndarray,
    color: np.ndarray,
    smooth: bool,
) -> Optional[trimesh.Trimesh]:
    if binary_mask.dtype != np.float32:
        binary_mask = binary_mask.astype(np.float32)
    if not np.any(binary_mask):
        return None
    try:
        verts, faces, _, _ = marching_cubes(binary_mask, level=0.5)
    except (ValueError, RuntimeError):
        return None
    if verts.size == 0 or faces.size == 0:
        return None

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    if smooth:
        try:
            trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=6)
        except Exception:
            pass

    vertex_colors = np.tile(color, (mesh.vertices.shape[0], 1)).astype(np.uint8)
    return trimesh.Trimesh(
        vertices=mesh.vertices * spacing_arr,
        faces=mesh.faces,
        vertex_colors=vertex_colors,
        process=False,
    )


def generate_mesh_glb(
    mask: np.ndarray,
    output_dir: Path,
    spacing: Tuple[float, float, float],
    volume_hu: np.ndarray | None = None,
    lung_mask: np.ndarray | None = None,
    *,
    output_filename: str | None = None,
) -> str:
    output_dir.mkdir(parents=True, exist_ok=True)
    spacing_arr = np.array(spacing, dtype=np.float64)
    has_any_class = bool(np.any(mask))

    scene = trimesh.Scene()
    contains_geometry = False

    if has_any_class:
        for label_id, name in CLASS_LABELS.items():
            sub = _build_class_submesh(
                (mask == label_id),
                spacing_arr,
                _MESH_PALETTE[name],
                smooth=True,
            )
            if sub is None:
                continue
            scene.add_geometry(
                sub,
                geom_name=MESH_NODE_NAMES[name],
                node_name=MESH_NODE_NAMES[name],
            )
            contains_geometry = True
    else:
        if volume_hu is not None and volume_hu.shape == mask.shape:
            fallback = lung_mask_from_hu(volume_hu)
            sub = _build_class_submesh(
                fallback.astype(np.float32),
                spacing_arr,
                _MESH_PALETTE["lung_shell"],
                smooth=True,
            )
            if sub is not None:
                scene.add_geometry(
                    sub,
                    geom_name=MESH_NODE_NAMES["lung_shell"],
                    node_name=MESH_NODE_NAMES["lung_shell"],
                )
                contains_geometry = True

    if has_any_class:
        shell_source: Optional[np.ndarray] = None
        if lung_mask is not None and lung_mask.shape == mask.shape and np.any(lung_mask):
            shell_source = (lung_mask > 0).astype(np.float32)
        elif volume_hu is not None and volume_hu.shape == mask.shape:
            hu_lung = lung_mask_from_hu(volume_hu)
            if np.any(hu_lung):
                shell_source = hu_lung.astype(np.float32)

        if shell_source is not None:
            shell = _build_class_submesh(
                shell_source,
                spacing_arr,
                _MESH_PALETTE["lung_shell"],
                smooth=True,
            )
            if shell is not None:
                scene.add_geometry(
                    shell,
                    geom_name=MESH_NODE_NAMES["lung_shell"],
                    node_name=MESH_NODE_NAMES["lung_shell"],
                )
                contains_geometry = True

    if not contains_geometry:
        return ""

    if output_filename:
        fname = output_filename.strip()
        if not fname.lower().endswith(".glb"):
            fname = f"{fname}.glb"
    else:
        fname = f"lung_{uuid.uuid4().hex}.glb"
    scene.export(file_obj=str(output_dir / fname), file_type="glb")
    return f"/static/meshes/{fname}"
