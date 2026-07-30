export type { Orientation } from "./volume-parse";
export type Colormap = "grayscale";

import type { Orientation, ParsedDicom } from "./volume-parse";
import { parseVolume } from "./volume-parse";

export type ViewerState = {
  /** [depth, height, width] */
  shape: [number, number, number];
  /** Parsed per-slice DICOM data */
  slices: ParsedDicom[];
  /** Voxel cache for MPR reconstruction (D * H * W) */
  voxelData?: Int16Array;
};

/**
 * Returns viewport dimensions based on orientation.
 */
export function getSliceInfo(
  shape: [number, number, number],
  orientation: Orientation,
): { numSlices: number; outWidth: number; outHeight: number } {
  const [d, h, w] = shape;
  switch (orientation) {
    case "axial":
      return { numSlices: d, outWidth: w, outHeight: h };
    case "coronal":
      return { numSlices: h, outWidth: w, outHeight: d };
    case "sagittal":
      return { numSlices: w, outWidth: h, outHeight: d };
    default:
      return { numSlices: d, outWidth: w, outHeight: h };
  }
}

/**
 * Parses raw files and caches voxels for fast MPR access.
 */
export async function loadDicomVolume(files: File[]): Promise<ViewerState | null> {
  if (!files || files.length === 0) return null;

  try {
    const parsed = await parseVolume(files);
    if (!parsed || parsed.slices.length === 0) return null;

    const [d, h, w] = [parsed.slices.length, parsed.slices[0].rows, parsed.slices[0].columns];

    // Build a continuous voxel buffer for MPR (Coronal/Sagittal views)
    const voxelData = new Int16Array(d * h * w);
    for (let z = 0; z < d; z++) {
      const slice = parsed.slices[z].pixelData;
      if (slice) voxelData.set(slice, z * h * w);
    }

    return {
      shape: [d, h, w],
      slices: parsed.slices,
      voxelData,
    };
  } catch (error) {
    console.error("Failed to parse DICOM volume:", error);
    return null;
  }
}

/**
 * Renders DICOM slices with orientation support (MPR).
 */
export function drawSliceToCanvas(
  canvas: HTMLCanvasElement,
  viewerState: ViewerState,
  shape: [number, number, number],
  orientation: Orientation,
  sliceIndex: number,
  windowCenter: number,
  windowWidth: number,
): void {
  const { outWidth, outHeight, numSlices } = getSliceInfo(shape, orientation);
  if (!canvas || !viewerState.voxelData) return;

  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const imageData = ctx.createImageData(outWidth, outHeight);
  const data = imageData.data;
  const [D, H, W] = shape;

  const lo = windowCenter - windowWidth / 2;
  const hi = windowCenter + windowWidth / 2;
  const range = hi - lo || 1;

  const voxels = viewerState.voxelData;
  const slice = viewerState.slices[0]; // Reference for rescale
  const slope = slice.rescaleSlope ?? 1;
  const intercept = slice.rescaleIntercept ?? 0;

  const clampedIdx = Math.max(0, Math.min(sliceIndex, numSlices - 1));

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let voxelIdx = 0;

      // Coordinate Mapping for MPR
      if (orientation === "axial") {
        voxelIdx = clampedIdx * (H * W) + y * W + x;
      } else if (orientation === "coronal") {
        voxelIdx = (outHeight - 1 - y) * (H * W) + clampedIdx * W + x;
      } else if (orientation === "sagittal") {
        voxelIdx = (outHeight - 1 - y) * (H * W) + x * W + clampedIdx;
      }

      const hu = (voxels[voxelIdx] * slope) + intercept;
      const v = Math.min(255, Math.max(0, ((hu - lo) / range) * 255));

      const pos = (y * outWidth + x) << 2;
      data[pos] = data[pos + 1] = data[pos + 2] = v;
      data[pos + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Per-class RGBA colors for the 2D segmentation overlay.
 * 0 = background (transparent), 1 = emphysema, 2 = fibrosis, 3 = ground_glass,
 * 4 = micronodules, 5 = consolidation.
 */
const CLASS_OVERLAY_COLORS: Record<number, [number, number, number, number]> = {
  1: [43, 119, 255, 180],   // Emphysema — blue
  2: [255, 140, 0, 180],    // Fibrosis — orange
  3: [102, 204, 102, 180],  // Ground Glass — green
  4: [221, 68, 221, 180],   // Micronodules — magenta
  5: [255, 230, 64, 180],   // Consolidation — yellow
};

/**
 * Technique 1: Independent Mask Layering
 * Draws a transparent per-class mask synced to the DICOM view.
 *
 * Alignment: Handles resolution mismatches via proportional scaling
 */
export function drawOverlayToCanvas(
  canvas: HTMLCanvasElement,
  maskSlices: Uint8Array[],
  shape: [number, number, number],
  orientation: Orientation,
  sliceIndex: number,
  maskShape?: [number, number, number],
): void {
  const { outWidth, outHeight, numSlices } = getSliceInfo(shape, orientation);
  if (!canvas || !maskSlices.length) return;

  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, outWidth, outHeight);

  const imageData = ctx.createImageData(outWidth, outHeight);
  const data = imageData.data;
  const [D, H, W] = shape;
  const [mD, mH, mW] = maskShape || shape;

  const clampedIdx = Math.max(0, Math.min(sliceIndex, numSlices - 1));

  // Determine scaling ratios if mask resolution differs from DICOM
  const scaleZ = mD / D;
  const scaleY = mH / H;
  const scaleX = mW / W;

  let pixelsDrawn = 0; // Debug counter

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let zCoord, yCoord, xCoord;

      if (orientation === "axial") {
        [zCoord, yCoord, xCoord] = [clampedIdx, y, x];
      } else if (orientation === "coronal") {
        [zCoord, yCoord, xCoord] = [outHeight - 1 - y, clampedIdx, x];
      } else {
        // Sagittal
        [zCoord, yCoord, xCoord] = [outHeight - 1 - y, x, clampedIdx];
      }

      // Map to Mask space
      const mz = Math.floor(zCoord * scaleZ);
      const my = Math.floor(yCoord * scaleY);
      const mx = Math.floor(xCoord * scaleX);

      const maskVal = maskSlices[mz]?.[my * mW + mx] ?? 0;
      const color = CLASS_OVERLAY_COLORS[maskVal];
      if (color) {
        const pos = (y * outWidth + x) << 2;
        data[pos] = color[0];
        data[pos + 1] = color[1];
        data[pos + 2] = color[2];
        data[pos + 3] = color[3];
        pixelsDrawn++;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Debug: Log if no mask pixels were drawn (helps identify alignment issues)
  if (pixelsDrawn === 0) {
    console.debug(
      `[Overlay] No mask pixels drawn for slice ${sliceIndex} (${orientation})`,
    );
  }
}
