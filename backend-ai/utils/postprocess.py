from __future__ import annotations
import numpy as np
from scipy.ndimage import binary_opening, binary_closing, generate_binary_structure


def postprocess_mask(
    mask: np.ndarray,
    threshold: float = 0.5,
    opening: bool = True,
    closing: bool = True,
    iterations: int = 1,
) -> np.ndarray:
    if mask.ndim != 3:
        raise ValueError(f"postprocess_mask expects a 3D mask, got shape {mask.shape}")
    if not np.all(np.isfinite(mask)):
        raise ValueError("postprocess_mask received non-finite values (NaN/Inf)")
    if iterations < 1:
        raise ValueError(f"iterations must be >= 1, got {iterations}")

    # 6-neighbor cross in 3D keeps morphology conservative.
    se = generate_binary_structure(3, 1)


    is_integer_like = np.issubdtype(mask.dtype, np.integer) or np.allclose(
        mask, np.rint(mask)
    )
    if not is_integer_like:
        out = (mask >= threshold).astype(np.uint8)
        if opening:
            out = binary_opening(
                out.astype(bool), structure=se, iterations=iterations
            ).astype(np.uint8)
        if closing:
            out = binary_closing(
                out.astype(bool), structure=se, iterations=iterations
            ).astype(np.uint8)
        return out

    # Multiclass-safe path: process each non-background class independently.
    labels = np.rint(mask).astype(np.uint8, copy=False)
    classes = [int(c) for c in np.unique(labels) if int(c) != 0]
    if not classes:
        return labels

    processed = {}
    for class_id in classes:
        class_bin = labels == class_id
        if opening:
            class_bin = binary_opening(class_bin, structure=se, iterations=iterations)
        if closing:
            class_bin = binary_closing(class_bin, structure=se, iterations=iterations)
        processed[class_id] = class_bin

    class_order = sorted(classes)
    out = np.zeros_like(labels, dtype=np.uint8)
    for class_id in class_order:
        out[(out == 0) & processed[class_id]] = np.uint8(class_id)

    # Keep original labels where morphology removed everything.
    out[(out == 0) & (labels > 0)] = labels[(out == 0) & (labels > 0)]
    return out
