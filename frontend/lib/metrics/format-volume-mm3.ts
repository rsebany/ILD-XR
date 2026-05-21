/** Numeric part only (no unit), for split typography with a separate unit span. */
export function formatVolumeMm3Number(mm3: number, maximumFractionDigits = 0): string {
  const n = Number(mm3);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

/** Format a volume already expressed in mm³. */
export function formatVolumeMm3(mm3: number, maximumFractionDigits = 0): string {
  const body = formatVolumeMm3Number(mm3, maximumFractionDigits);
  if (body === "—") return "—";
  return `${body} mm³`;
}

/**
 * API lesion / lung fields (`*_volume_ml`, `lung_volume_ml`) are stored as ml
 * (= cm³); multiply by 1000 for mm³ display.
 */
export function formatVolumeFromMlAsMm3(volumeMl: number, maximumFractionDigits = 0): string {
  return formatVolumeMm3(volumeMl * 1000, maximumFractionDigits);
}
