from __future__ import annotations

from typing import Iterable, Optional, Sequence, Tuple, Union

import torch
import torch.nn as nn
import torch.nn.functional as F

# Trade-off between false positives and false negatives
class TverskyLoss(nn.Module):
    
    def __init__(self, alpha: float = 0.3, beta: float = 0.7, smooth: float = 1e-6):
        super().__init__()
        self.alpha, self.beta, self.smooth = alpha, beta, smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)[:, 1]
        targets = targets.float()
        tp = (probs * targets).sum()
        fp = (probs * (1 - targets)).sum()
        fn = ((1 - probs) * targets).sum()
        return 1.0 - (tp + self.smooth) / (
            tp + self.alpha * fp + self.beta * fn + self.smooth
        )


class MultiClassFocalTverskyLoss(nn.Module):

    def __init__(
        self,
        alpha: float = 0.3,
        beta: float = 0.7,
        gamma: float = 0.75,
        n_classes: int = 4, # 0=background, 1=GGO, 2=Reticulation, 3=Consolidation
        smooth: float = 1e-6,
    ):
        super().__init__()
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.n_classes = n_classes
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        inputs = F.softmax(logits, dim=1)
        targets = torch.clamp(targets, 0, self.n_classes - 1)
        # one-hot then move the class axis to dim 1 to align with `inputs`
        targets_one_hot = (
            F.one_hot(targets, self.n_classes)
            .permute(0, 4, 1, 2, 3)
            .float()
        )
        # Reduce over batch + spatial axes; keep one Tversky term per class.
        tp = (inputs * targets_one_hot).sum(dim=(0, 2, 3, 4))
        fp = (inputs * (1 - targets_one_hot)).sum(dim=(0, 2, 3, 4))
        fn = ((1 - inputs) * targets_one_hot).sum(dim=(0, 2, 3, 4))
        tversky = (tp + self.smooth) / (
            tp + self.alpha * fp + self.beta * fn + self.smooth
        )
        return torch.pow(1.0 - tversky, self.gamma).mean()


class HybridMulticlassLoss(nn.Module):

    DEFAULT_CLASS_WEIGHTS: Tuple[float, ...] = (1.0, 15.0, 15.0, 15.0)

    def __init__(
        self,
        class_weights: Optional[Sequence[float]] = None,
        n_classes: int = 4,
        tversky_scale: float = 1.5,
        focal_tversky_alpha: float = 0.3,
        focal_tversky_beta: float = 0.7,
        focal_tversky_gamma: float = 0.75,
    ):
        super().__init__()
        weights = (
            torch.tensor(class_weights, dtype=torch.float32)
            if class_weights is not None
            else torch.tensor(self.DEFAULT_CLASS_WEIGHTS, dtype=torch.float32)
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


class DeepSupervisionLoss(nn.Module):

    def __init__(
        self,
        loss_fn: nn.Module,
        weights: Iterable[float] = (1.0, 0.5, 0.25),
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
            raise ValueError("DeepSupervisionLoss received empty outputs tuple")
        total: Optional[torch.Tensor] = None
        for w, head in zip(self.weights, outputs):
            term = w * self.loss_fn(head, targets)
            total = term if total is None else total + term
        # If the model returns more heads than we have weights for, ignore the rest.
        return total  # type: ignore[return-value]


__all__ = [
    "TverskyLoss",
    "MultiClassFocalTverskyLoss",
    "HybridMulticlassLoss",
    "HybridSegmentationLoss",
    "DeepSupervisionLoss",
]
