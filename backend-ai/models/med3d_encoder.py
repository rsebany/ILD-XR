"""Hierarchical 3D ResNet-18 encoder with SE blocks + 3 Softmax heads"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


def _gn(ch: int, num_groups: int = 8) -> nn.GroupNorm:
    for g in (num_groups, 4, 2, 1):
        if ch % g == 0:
            return nn.GroupNorm(g, ch)
    return nn.GroupNorm(1, ch)


# ---------------------------------------------------------------------------
# Basic ResBlock3D (no SE)
# ---------------------------------------------------------------------------


class ResBlock3D(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, stride: int = 1):
        super().__init__()
        self.conv1 = nn.Conv3d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
        self.bn1 = _gn(out_ch)
        self.conv2 = nn.Conv3d(out_ch, out_ch, 3, padding=1, bias=False)
        self.bn2 = _gn(out_ch)
        self.skip = (
            nn.Sequential(
                nn.Conv3d(in_ch, out_ch, 1, stride=stride, bias=False),
                _gn(out_ch),
            )
            if in_ch != out_ch or stride != 1
            else nn.Identity()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = self.bn2(self.conv2(out))
        return F.relu(out + self.skip(x), inplace=True)


# ---------------------------------------------------------------------------
# Squeeze-and-Excitation blocks
# ---------------------------------------------------------------------------


class SEBlock3D(nn.Module):
    def __init__(self, channels: int, reduction: int = 16):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool3d(1),
            nn.Conv3d(channels, channels // reduction, kernel_size=1),
            nn.ReLU(inplace=True),
            nn.Conv3d(channels // reduction, channels, kernel_size=1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x * self.fc(x)


class SE_ResBlock3D(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, stride: int = 1):
        super().__init__()
        self.conv1 = nn.Conv3d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
        self.bn1 = _gn(out_ch)
        self.conv2 = nn.Conv3d(out_ch, out_ch, 3, padding=1, bias=False)
        self.bn2 = _gn(out_ch)
        self.se = SEBlock3D(out_ch)
        self.skip = nn.Identity()
        if in_ch != out_ch or stride != 1:
            self.skip = nn.Sequential(
                nn.Conv3d(in_ch, out_ch, 1, stride=stride, bias=False),
                _gn(out_ch),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = self.bn2(self.conv2(out))
        out = self.se(out)
        return F.relu(out + self.skip(x), inplace=True)


# ---------------------------------------------------------------------------
# Original Med3DPathologyEncoder3D
# ---------------------------------------------------------------------------


class Med3DPathologyEncoder3D(nn.Module):
    """3D ResNet-18-style encoder initialized from Med3D weights (paper v3.0).

    Input: (B, 1, 16, 64, 64) -> Features: (B, 512)
    Kept for backward compatibility with fold0 encoder/head weights.
    """

    def __init__(self, in_ch: int = 1, feat_dim: int = 512):
        super().__init__()
        self.feat_dim = feat_dim
        self.stem = nn.Sequential(
            nn.Conv3d(in_ch, 64, kernel_size=(1, 7, 7), stride=(1, 2, 2), padding=(0, 3, 3), bias=False),
            _gn(64),
            nn.ReLU(inplace=True),
            nn.MaxPool3d(kernel_size=(1, 3, 3), stride=(1, 2, 2), padding=(0, 1, 1)),
        )
        self.layer1 = self._make_layer(64, 64, 2)
        self.layer2 = self._make_layer(64, 128, 2, stride=2)
        self.layer3 = self._make_layer(128, 256, 2, stride=2)
        self.layer4 = self._make_layer(256, 512, 2, stride=2)
        self.avgpool = nn.AdaptiveAvgPool3d((1, 1, 1))

    def _make_layer(self, in_ch: int, out_ch: int, blocks: int, stride: int = 1) -> nn.Sequential:
        layers = [ResBlock3D(in_ch, out_ch, stride=stride)]
        for _ in range(1, blocks):
            layers.append(ResBlock3D(out_ch, out_ch))
        return nn.Sequential(*layers)

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        return self.avgpool(x).flatten(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.extract_features(x)

    def _try_load_state_dict_flexible(self, state: Dict[str, Any]) -> int:
        if isinstance(state, dict) and "encoder" in state:
            state = state["encoder"]
        if isinstance(state, dict) and "state_dict" in state:
            state = state["state_dict"]
        if isinstance(state, dict) and "model" in state and isinstance(state["model"], dict):
            state = state["model"]
        cleaned: Dict[str, torch.Tensor] = {}
        for key, value in state.items():
            nk = key
            for pref in ("module.", "backbone.", "encoder."):
                if nk.startswith(pref):
                    nk = nk[len(pref) :]
            cleaned[nk] = value
        model_sd = self.state_dict()
        matched = 0
        for key, value in cleaned.items():
            if key in model_sd and model_sd[key].shape == value.shape:
                model_sd[key] = value
                matched += 1
            if key == "conv1.weight" and "stem.0.weight" in model_sd and model_sd["stem.0.weight"].shape == value.shape:
                model_sd["stem.0.weight"] = value
                matched += 1
        self.load_state_dict(model_sd, strict=False)
        return matched

    def load_med3d_weights(self, path: Path | str, *, min_match: int = 8) -> int:
        ckpt = torch.load(str(path), map_location="cpu", weights_only=False)
        matched = self._try_load_state_dict_flexible(ckpt)
        if matched < min_match:
            raise RuntimeError(f"Med3D weights at {path} matched only {matched} tensors (< {min_match})")
        return matched


def build_softmax_head(feat_dim: int = 512, num_classes: int = 6, dropout: float = 0.4) -> nn.Sequential:
    return nn.Sequential(nn.Dropout(dropout), nn.Linear(feat_dim, num_classes))


def _extract_state_dict(ckpt: Any) -> Dict[str, Any]:
    if isinstance(ckpt, dict):
        for key in ("state_dict", "model", "encoder", "head"):
            if key in ckpt and isinstance(ckpt[key], dict):
                return ckpt[key]
    return ckpt


def load_encoder_from_checkpoint(encoder: Med3DPathologyEncoder3D, path: Path | str) -> None:
    ckpt = torch.load(str(path), map_location="cpu", weights_only=False)
    if isinstance(ckpt, dict) and "encoder" in ckpt:
        encoder._try_load_state_dict_flexible(ckpt["encoder"])
        return
    encoder._try_load_state_dict_flexible(ckpt)


def load_softmax_head_from_checkpoint(
    head: nn.Sequential, path: Path | str, *, encoder_ckpt: Path | str | None = None
) -> None:
    ckpt = torch.load(str(path), map_location="cpu", weights_only=False)
    if isinstance(ckpt, dict) and "head" in ckpt:
        head.load_state_dict(ckpt["head"], strict=False)
        return
    if encoder_ckpt is not None:
        enc_ckpt = torch.load(str(encoder_ckpt), map_location="cpu", weights_only=False)
        if isinstance(enc_ckpt, dict) and "head" in enc_ckpt:
            head.load_state_dict(enc_ckpt["head"], strict=False)
            return
    head.load_state_dict(_extract_state_dict(ckpt), strict=False)


# ---------------------------------------------------------------------------
# HierarchicalEncoder3D
# ---------------------------------------------------------------------------

N_BINARY_CLASSES = 2   # Normal, ILD
N_HIER_CLASSES = 3     # Normal, Fibrotic, NonFibrotic
N_PATH_CLASSES = 5     # Emphysema, Fibrosis, Ground Glass, Micronodules, Consolidation
HEAD_DROPOUT = 0.4
HIERARCHY_MAP = {0: 0, 1: 2, 2: 1, 3: 2, 4: 2, 5: 1}  # orig -> hier


class HierarchicalEncoder3D(nn.Module):
    """Shared 3D ResNet-18 encoder with SE blocks + three classification heads.

    Heads:
      - binary_head: Normal (0) vs ILD (1)
      - hier_head: Normal (0) / Fibrotic (1) / Non-fibrotic (2)
      - path_head: 5-class pathology (Emphysema/Fibrosis/Ground Glass/Micronodules/Consolidation)

    Input: (B, 1, 16, 64, 64) -> features + per-head logits.
    """

    def __init__(self, in_ch: int = 1, use_se: bool = True):
        super().__init__()
        block_cls = SE_ResBlock3D if use_se else ResBlock3D
        self.stem = nn.Sequential(
            nn.Conv3d(in_ch, 64, kernel_size=(1, 7, 7), stride=(1, 2, 2), padding=(0, 3, 3), bias=False),
            nn.GroupNorm(8, 64),
            nn.ReLU(inplace=True),
            nn.MaxPool3d(kernel_size=(1, 3, 3), stride=(1, 2, 2), padding=(0, 1, 1)),
        )
        self.layer1 = self._make_layer(64, 64, 2, block_cls)
        self.layer2 = self._make_layer(64, 128, 2, block_cls, stride=2)
        self.layer3 = self._make_layer(128, 256, 2, block_cls, stride=2)
        self.layer4 = self._make_layer(256, 512, 2, block_cls, stride=2)
        self.avgpool = nn.AdaptiveAvgPool3d((1, 1, 1))
        self.feat_dim = 512

        self.binary_head = nn.Sequential(
            nn.Dropout(HEAD_DROPOUT),
            nn.Linear(self.feat_dim, N_BINARY_CLASSES),
        )
        self.hier_head = nn.Sequential(
            nn.Dropout(HEAD_DROPOUT),
            nn.Linear(self.feat_dim, N_HIER_CLASSES),
        )
        self.path_head = nn.Sequential(
            nn.Dropout(HEAD_DROPOUT),
            nn.Linear(self.feat_dim, N_PATH_CLASSES),
        )

    @staticmethod
    def _make_layer(in_ch: int, out_ch: int, blocks: int, block_cls: type, stride: int = 1) -> nn.Sequential:
        layers = [block_cls(in_ch, out_ch, stride=stride)]
        for _ in range(1, blocks):
            layers.append(block_cls(out_ch, out_ch))
        return nn.Sequential(*layers)

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        return self.avgpool(x).flatten(1)

    def forward(self, x: torch.Tensor, head: str = "binary") -> torch.Tensor:
        features = self.extract_features(x)
        if head == "binary":
            return self.binary_head(features)
        elif head == "hier":
            return self.hier_head(features)
        elif head == "path":
            return self.path_head(features)
        else:
            return features

    def load_hierarchical_checkpoint(self, path: Path | str) -> int:
        """Load a trained hierarchical checkpoint (single .pth with all heads)."""
        ckpt = torch.load(str(path), map_location="cpu", weights_only=False)
        state = ckpt if isinstance(ckpt, dict) and "model" in ckpt else {"model": ckpt}
        state_dict = state["model"] if "model" in state else state
        cleaned: Dict[str, torch.Tensor] = {}
        for key, value in state_dict.items():
            nk = key
            for pref in ("module.", "backbone.", "encoder."):
                if nk.startswith(pref):
                    nk = nk[len(pref) :]
            cleaned[nk] = value
        matched = 0
        model_sd = self.state_dict()
        for key, value in cleaned.items():
            if key in model_sd and model_sd[key].shape == value.shape:
                model_sd[key] = value
                matched += 1
            elif key == "conv1.weight" and "stem.0.weight" in model_sd:
                if model_sd["stem.0.weight"].shape == value.shape:
                    model_sd["stem.0.weight"] = value
                    matched += 1
        self.load_state_dict(model_sd, strict=False)
        return matched


def build_hierarchical_model(in_ch: int = 1, use_se: bool = True) -> HierarchicalEncoder3D:
    return HierarchicalEncoder3D(in_ch=in_ch, use_se=use_se)


def set_trainable_blocks(model: nn.Module, unfreeze: List[str] | Tuple[str, ...]) -> None:
    """Freeze all parameters, then unfreeze named submodules."""
    for prm in model.parameters():
        prm.requires_grad = False
    for name in unfreeze:
        mod = getattr(model, name, None)
        if mod is not None:
            for prm in mod.parameters():
                prm.requires_grad = True


def load_hierarchical_checkpoint(
    model: HierarchicalEncoder3D, path: Path | str
) -> int:
    """Convenience wrapper for loading a hierarchical checkpoint."""
    return model.load_hierarchical_checkpoint(path)


__all__ = [
    "ResBlock3D",
    "SEBlock3D",
    "SE_ResBlock3D",
    "Med3DPathologyEncoder3D",
    "HierarchicalEncoder3D",
    "build_softmax_head",
    "build_hierarchical_model",
    "load_encoder_from_checkpoint",
    "load_softmax_head_from_checkpoint",
    "load_hierarchical_checkpoint",
    "set_trainable_blocks",
    "N_BINARY_CLASSES",
    "N_HIER_CLASSES",
    "N_PATH_CLASSES",
    "HIERARCHY_MAP",
    "HEAD_DROPOUT",
]
