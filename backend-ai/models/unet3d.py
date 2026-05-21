import torch
import torch.nn as nn
import torch.nn.functional as F

class ResidualBlock3D(nn.Module):

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv3d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm3d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv3d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm3d(out_channels),
        )
        self.shortcut = (
            nn.Conv3d(in_channels, out_channels, kernel_size=1)
            if in_channels != out_channels
            else nn.Identity()
        )
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.relu(self.conv(x) + self.shortcut(x))

class UNet3DResidual(nn.Module):
    def __init__(self, in_channels: int = 2, num_classes: int = 4, base_channels: int = 32):
        super().__init__()
        c1, c2, c3, c4 = base_channels, base_channels*2, base_channels*4, base_channels*8
        
        self.enc1 = ResidualBlock3D(in_channels, c1)
        self.enc2 = ResidualBlock3D(c1, c2)
        self.enc3 = ResidualBlock3D(c2, c3)
        self.pool = nn.MaxPool3d(kernel_size=2, stride=2)

        self.bottleneck = ResidualBlock3D(c3, c4)

        self.up3 = nn.ConvTranspose3d(c4, c3, kernel_size=2, stride=2)
        self.dec3 = ResidualBlock3D(c3 + c3, c3)
        self.ds3 = nn.Conv3d(c3, num_classes, kernel_size=1)
        self.up2 = nn.ConvTranspose3d(c3, c2, kernel_size=2, stride=2)
        self.dec2 = ResidualBlock3D(c2 + c2, c2)
        self.ds2 = nn.Conv3d(c2, num_classes, kernel_size=1)
        self.up1 = nn.ConvTranspose3d(c2, c1, kernel_size=2, stride=2)
        self.dec1 = ResidualBlock3D(c1 + c1, c1)

        self.final = nn.Conv3d(c1, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        b = self.bottleneck(self.pool(e3))

        d3 = F.interpolate(self.up3(b), size=e3.shape[2:], mode="trilinear", align_corners=False)
        d3 = self.dec3(torch.cat([d3, e3], dim=1))
        d2 = F.interpolate(self.up2(d3), size=e2.shape[2:], mode="trilinear", align_corners=False)
        d2 = self.dec2(torch.cat([d2, e2], dim=1))
        d1 = F.interpolate(self.up1(d2), size=e1.shape[2:], mode="trilinear", align_corners=False)
        d1 = self.dec1(torch.cat([d1, e1], dim=1))
        if self.training:
            out_ds2 = F.interpolate(self.ds2(d2), size=d1.shape[2:], mode="trilinear", align_corners=False)
            out_ds3 = F.interpolate(self.ds3(d3), size=d1.shape[2:], mode="trilinear", align_corners=False)
            return self.final(d1), out_ds2, out_ds3
        return self.final(d1)

__all__ = ["ResidualBlock3D", "UNet3DResidual"]