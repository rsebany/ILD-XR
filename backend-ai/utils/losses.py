from __future__ import annotations

from typing import Iterable, Optional, Sequence, Tuple, Union

import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

NUM_CLASSES = 4
"""Background + three ILD foreground classes."""

# Tversky: alpha weights false positives, beta weights false negatives.
DEFAULT_TVERSKY_ALPHA = 0.3
DEFAULT_TVERSKY_BETA = 0.7
DEFAULT_FOCAL_GAMMA = 0.75
DEFAULT_TVERSKY_SMOOTH = 1e-6

# Foreground classes up-weighted vs background in cross-entropy.
DEFAULT_CLASS_WEIGHTS: Tuple[float, ...] = (1.0, 15.0, 15.0, 15.0)
DEFAULT_TVERSKY_SCALE = 1.5

# Deep-supervision head weights (main, ds3, ds2) — must match UNet training heads.
DEFAULT_DS_WEIGHTS: Tuple[float, ...] = (1.0, 0.5, 0.25)


# ---------------------------------------------------------------------------
# Tversky building blocks
# ---------------------------------------------------------------------------


class TverskyLoss(nn.Module):
    """Binary Tversky loss on foreground class (channel index 1 after softmax)."""

    def __init__(
        self,
        alpha: float = DEFAULT_TVERSKY_ALPHA,
        beta: float = DEFAULT_TVERSKY_BETA,
        smooth: float = DEFAULT_TVERSKY_SMOOTH,
    ):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)[:, 1]
        targets = targets.float()

        tp = (probs * targets).sum()
        fp = (probs * (1.0 - targets)).sum()
        fn = ((1.0 - probs) * targets).sum()

        tversky = (tp + self.smooth) / (
            tp + self.alpha * fp + self.beta * fn + self.smooth
        )
        return 1.0 - tversky


class MultiClassFocalTverskyLoss(nn.Module):
    """Per-class Tversky with focal sharpening: mean_c (1 - Tversky_c)^gamma."""

    def __init__(
        self,
        alpha: float = DEFAULT_TVERSKY_ALPHA,
        beta: float = DEFAULT_TVERSKY_BETA,
        gamma: float = DEFAULT_FOCAL_GAMMA,
        n_classes: int = NUM_CLASSES,
        smooth: float = DEFAULT_TVERSKY_SMOOTH,
    ):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.n_classes = n_classes
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)
        targets = torch.clamp(targets, 0, self.n_classes - 1)

        targets_one_hot = (
            F.one_hot(targets, self.n_classes).permute(0, 4, 1, 2, 3).float()
        )

        reduce_dims = (0, 2, 3, 4)
        tp = (probs * targets_one_hot).sum(dim=reduce_dims)
        fp = (probs * (1.0 - targets_one_hot)).sum(dim=reduce_dims)
        fn = ((1.0 - probs) * targets_one_hot).sum(dim=reduce_dims)

        tversky = (tp + self.smooth) / (
            tp + self.alpha * fp + self.beta * fn + self.smooth
        )
        return torch.pow(1.0 - tversky, self.gamma).mean()


# ---------------------------------------------------------------------------
# Training objectives
# ---------------------------------------------------------------------------


class HybridMulticlassLoss(nn.Module):
    """Cross-entropy (class-weighted) + scaled multiclass focal Tversky."""

    def __init__(
        self,
        class_weights: Optional[Sequence[float]] = None,
        n_classes: int = NUM_CLASSES,
        tversky_scale: float = DEFAULT_TVERSKY_SCALE,
        focal_tversky_alpha: float = DEFAULT_TVERSKY_ALPHA,
        focal_tversky_beta: float = DEFAULT_TVERSKY_BETA,
        focal_tversky_gamma: float = DEFAULT_FOCAL_GAMMA,
    ):
        super().__init__()
        weights = (
            torch.tensor(class_weights, dtype=torch.float32)
            if class_weights is not None
            else torch.tensor(DEFAULT_CLASS_WEIGHTS, dtype=torch.float32)
        )
        self.register_buffer("class_weights", weights)
        self.n_classes = n_classes
        self.tversky_scale = tversky_scale
        self.focal_tversky = MultiClassFocalTverskyLoss(
            alpha=focal_tversky_alpha,
            beta=focal_tversky_beta,
            gamma=focal_tversky_gamma,
            n_classes=n_classes,
        )

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = F.cross_entropy(logits, targets, weight=self.class_weights)
        ft = self.focal_tversky(logits, targets)
        return ce + self.tversky_scale * ft


HybridSegmentationLoss = HybridMulticlassLoss
"""Backward-compatible alias."""


class DeepSupervisionLoss(nn.Module):
    """Weighted sum of ``loss_fn`` over multiple decoder outputs.

    During training the UNet returns ``(main, ds3, ds2)``. Extra heads beyond
    ``weights`` are ignored.
    """

    def __init__(
        self,
        loss_fn: nn.Module,
        weights: Iterable[float] = DEFAULT_DS_WEIGHTS,
    ):
        super().__init__()
        self.loss_fn = loss_fn
        self.weights = tuple(weights)

    def forward(
        self,
        outputs: Union[torch.Tensor, Sequence[torch.Tensor]],
        targets: torch.Tensor,
    ) -> torch.Tensor:
        if isinstance(outputs, torch.Tensor):
            return self.loss_fn(outputs, targets)

        if len(outputs) == 0:
            raise ValueError("DeepSupervisionLoss received empty outputs")

        total: Optional[torch.Tensor] = None
        for weight, head_logits in zip(self.weights, outputs):
            term = weight * self.loss_fn(head_logits, targets)
            total = term if total is None else total + term
        return total  # type: ignore[return-value]


__all__ = [
    "NUM_CLASSES",
    "DEFAULT_CLASS_WEIGHTS",
    "DEFAULT_DS_WEIGHTS",
    "TverskyLoss",
    "MultiClassFocalTverskyLoss",
    "HybridMulticlassLoss",
    "HybridSegmentationLoss",
    "DeepSupervisionLoss",
]
