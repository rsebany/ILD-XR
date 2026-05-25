from __future__ import annotations

import numpy as np
from scipy.ndimage import binary_closing, binary_opening, generate_binary_structure

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLD = 0.5
DEFAULT_ITERATIONS = 1
"""Opening/closing passes per class (or for the binarized float mask)."""

# 6-neighbor cross in 3D — conservative morphology (less aggressive than 26-connectivity).
_STRUCTURE_RANK = 3
_STRUCTURE_CONNECTIVITY = 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _structuring_element():
    return generate_binary_structure(_STRUCTURE_RANK, _STRUCTURE_CONNECTIVITY)


def _validate_mask(mask: np.ndarray, *, iterations: int) -> None:
    if mask.ndim != 3:
        raise ValueError(f"postprocess_mask expects (Z, Y, X), got shape {mask.shape}")
    if not np.all(np.isfinite(mask)):
        raise ValueError("postprocess_mask received non-finite values (NaN/Inf)")
    if iterations < 1:
        raise ValueError(f"iterations must be >= 1, got {iterations}")


def _is_integer_like(mask: np.ndarray) -> bool:
    return np.issubdtype(mask.dtype, np.integer) or np.allclose(mask, np.rint(mask))


def _apply_morphology(
    binary: np.ndarray,
    structure: np.ndarray,
    *,
    opening: bool,
    closing: bool,
    iterations: int,
) -> np.ndarray:
    """Opening then closing on a boolean volume."""
    out = binary
    if opening:
        out = binary_opening(out, structure=structure, iterations=iterations)
    if closing:
        out = binary_closing(out, structure=structure, iterations=iterations)
    return out


def _postprocess_probabilistic(
    mask: np.ndarray,
    structure: np.ndarray,
    *,
    threshold: float,
    opening: bool,
    closing: bool,
    iterations: int,
) -> np.ndarray:
    binary = mask >= threshold
    cleaned = _apply_morphology(
        binary, structure, opening=opening, closing=closing, iterations=iterations
    )
    return cleaned.astype(np.uint8)


def _postprocess_multiclass(
    labels: np.ndarray,
    structure: np.ndarray,
    *,
    opening: bool,
    closing: bool,
    iterations: int,
) -> np.ndarray:
    """Morphology per class; merge in ascending class-id order."""
    classes = [int(c) for c in np.unique(labels) if int(c) != 0]
    if not classes:
        return labels

    processed: dict[int, np.ndarray] = {}
    for class_id in classes:
        class_bin = labels == class_id
        processed[class_id] = _apply_morphology(
            class_bin, structure, opening=opening, closing=closing, iterations=iterations
        )

    out = np.zeros_like(labels, dtype=np.uint8)
    for class_id in sorted(classes):
        out[(out == 0) & processed[class_id]] = np.uint8(class_id)

    # Restore voxels where morphology erased a class entirely.
    out[(out == 0) & (labels > 0)] = labels[(out == 0) & (labels > 0)]
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def postprocess_mask(
    mask: np.ndarray,
    threshold: float = DEFAULT_THRESHOLD,
    opening: bool = True,
    closing: bool = True,
    iterations: int = DEFAULT_ITERATIONS,
) -> np.ndarray:
    """Clean a 3-D segmentation mask with optional opening and closing.

    Args:
        mask: (Z, Y, X) float probabilities or integer class labels.
        threshold: Binarization cutoff when ``mask`` is not integer-like.
        opening: Remove small foreground islands / thin protrusions.
        closing: Fill small holes.
        iterations: Number of morphological passes.

    Returns:
        uint8 mask, same shape as ``mask``.
    """
    _validate_mask(mask, iterations=iterations)
    structure = _structuring_element()

    if not _is_integer_like(mask):
        return _postprocess_probabilistic(
            mask,
            structure,
            threshold=threshold,
            opening=opening,
            closing=closing,
            iterations=iterations,
        )

    labels = np.rint(mask).astype(np.uint8, copy=False)
    return _postprocess_multiclass(
        labels,
        structure,
        opening=opening,
        closing=closing,
        iterations=iterations,
    )


__all__ = [
    "DEFAULT_THRESHOLD",
    "DEFAULT_ITERATIONS",
    "postprocess_mask",
]
