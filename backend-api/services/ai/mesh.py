"""Marching-cubes GLB export for ILD class meshes and lung shell."""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import trimesh
import trimesh.smoothing
from scipy.ndimage import binary_closing, binary_dilation, binary_opening, gaussian_filter
from skimage.measure import marching_cubes

from services.ai.constants import CLASS_LABELS
from services.ai.geometry import lung_mask_from_hu

MESH_NODE_NAMES: Dict[str, str] = {
    "emphysema": "emphysema",
    "fibrosis": "fibrosis",
    "ground_glass": "ground_glass",
    "micronodules": "micronodules",
    "consolidation": "consolidation",
    "lung_shell": "lung_shell",
}
_MESH_PALETTE: Dict[str, np.ndarray] = {
    "emphysema": np.array([0, 200, 255, 255], dtype=np.uint8),
    "fibrosis": np.array([255, 165, 0, 255], dtype=np.uint8),
    "ground_glass": np.array([0, 200, 170, 255], dtype=np.uint8),
    "micronodules": np.array([200, 0, 200, 255], dtype=np.uint8),
    "consolidation": np.array([255, 143, 77, 255], dtype=np.uint8),
    "lung_shell": np.array([180, 200, 220, 120], dtype=np.uint8),
}

_SHELL_LESION_DILATE_ITERS = 2
_MASK_MORPH_ITERS = 2
_TAUBIN_ITERATIONS_LUNG = 28
_TAUBIN_ITERATIONS_LESION = 8
_DECIMATE_MAX_FACES_LUNG = 70_000
_DECIMATE_MAX_FACES_LESION = 40_000
_LUNG_GAUSS_SIGMA = 0.75
_STRUCT_3 = np.ones((3, 3, 3), dtype=bool)

__all__ = ["MESH_NODE_NAMES", "generate_mesh_glb", "outer_lung_shell_volume"]


def _morph_binary_mask(mask: np.ndarray, *, close_iters: int = _MASK_MORPH_ITERS) -> np.ndarray:
    """Close small holes / smooth voxel stairs before marching cubes."""
    m = np.asarray(mask, dtype=bool)
    if not np.any(m) or close_iters <= 0:
        return m
    m = binary_closing(m, structure=_STRUCT_3, iterations=close_iters)
    m = binary_opening(m, structure=_STRUCT_3, iterations=1)
    return m


def _gaussian_soft_mask(mask: np.ndarray, *, sigma: float = _LUNG_GAUSS_SIGMA) -> np.ndarray:
    """Soft distance-like blur of a binary mask to reduce MC stair-steps."""
    m = np.asarray(mask, dtype=np.float32)
    if sigma <= 0 or not np.any(m):
        return (m > 0).astype(np.float32)
    blurred = gaussian_filter(m, sigma=sigma)
    return blurred.astype(np.float32)


def outer_lung_shell_volume(
    lung_mask: np.ndarray,
    lesion_mask: np.ndarray,
    *,
    lesion_dilate_iters: int = _SHELL_LESION_DILATE_ITERS,
) -> np.ndarray:
    """
    Outer lung envelope with lesion voxels carved out.

    Lesions are slightly dilated before subtraction so marching-cubes class
    meshes render inside the shell rather than on the same surface.
    """
    lung = _morph_binary_mask(np.asarray(lung_mask, dtype=bool) > 0)
    lesions = np.asarray(lesion_mask, dtype=bool)
    if lesion_dilate_iters > 0 and np.any(lesions):
        lesions = binary_dilation(lesions, structure=_STRUCT_3, iterations=lesion_dilate_iters)
    shell = lung & ~lesions
    if not np.any(shell):
        shell = lung
    return shell.astype(np.float32)


def _decimate_if_dense(mesh: trimesh.Trimesh, *, max_faces: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= max_faces:
        return mesh
    try:
        return mesh.simplify_quadric_decimation(max_faces)
    except Exception:
        return mesh


def _build_class_submesh(
    binary_mask: np.ndarray,
    spacing_arr: np.ndarray,
    color: np.ndarray,
    smooth: bool,
    *,
    morph_mask: bool = True,
    lung_shell: bool = False,
) -> Optional[trimesh.Trimesh]:
    vol = np.asarray(binary_mask)
    if morph_mask and vol.size > 0:
        vol = _morph_binary_mask(vol > 0).astype(np.float32)
    elif vol.dtype != np.float32:
        vol = (vol > 0).astype(np.float32)

    if lung_shell and np.any(vol):
        vol = _gaussian_soft_mask(vol > 0.5, sigma=_LUNG_GAUSS_SIGMA)

    if not np.any(vol):
        return None
    try:
        verts, faces, _, _ = marching_cubes(vol, level=0.5)
    except (ValueError, RuntimeError):
        return None
    if verts.size == 0 or faces.size == 0:
        return None

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    taubin_iters = _TAUBIN_ITERATIONS_LUNG if lung_shell else _TAUBIN_ITERATIONS_LESION
    max_faces = _DECIMATE_MAX_FACES_LUNG if lung_shell else _DECIMATE_MAX_FACES_LESION
    if smooth and taubin_iters > 0:
        try:
            trimesh.smoothing.filter_taubin(
                mesh, lamb=0.5, nu=-0.53, iterations=taubin_iters
            )
        except Exception:
            pass
    mesh = _decimate_if_dense(mesh, max_faces=max_faces)
    try:
        mesh.merge_vertices()
        mesh.fix_normals()
    except Exception:
        pass

    vertex_colors = np.tile(color, (mesh.vertices.shape[0], 1)).astype(np.uint8)
    return trimesh.Trimesh(
        vertices=mesh.vertices * spacing_arr,
        faces=mesh.faces,
        vertex_colors=vertex_colors,
        process=False,
    )


def _resolve_lung_bool(
    mask: np.ndarray,
    lung_mask: np.ndarray | None,
    volume_hu: np.ndarray | None,
) -> np.ndarray | None:
    if lung_mask is not None and lung_mask.shape == mask.shape and np.any(lung_mask):
        return np.asarray(lung_mask > 0, dtype=bool)
    if volume_hu is not None and volume_hu.shape == mask.shape:
        hu_lung = lung_mask_from_hu(volume_hu)
        if np.any(hu_lung):
            return np.asarray(hu_lung > 0, dtype=bool)
    return None


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
                morph_mask=False,
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
        lung_bool = _resolve_lung_bool(mask, lung_mask, volume_hu)
        if lung_bool is not None:
            sub = _build_class_submesh(
                lung_bool.astype(np.float32),
                spacing_arr,
                _MESH_PALETTE["lung_shell"],
                smooth=True,
                lung_shell=True,
            )
            if sub is not None:
                scene.add_geometry(
                    sub,
                    geom_name=MESH_NODE_NAMES["lung_shell"],
                    node_name=MESH_NODE_NAMES["lung_shell"],
                )
                contains_geometry = True

    lung_bool = _resolve_lung_bool(mask, lung_mask, volume_hu)
    if lung_bool is not None:
        lung_sub = _build_class_submesh(
            lung_bool.astype(np.float32),
            spacing_arr,
            _MESH_PALETTE["lung_shell"],
            smooth=True,
            lung_shell=True,
        )
        if lung_sub is not None:
            scene.add_geometry(
                lung_sub,
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
