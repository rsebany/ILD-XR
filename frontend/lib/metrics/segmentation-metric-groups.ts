import type { StudyMetrics } from "@/api/domain";
import {
  formatSegmentationVolume,
  metricLabelWithUnit,
} from "@/lib/metrics/format-segmentation-volume";
import {
  computeIldBarFillPercent,
  computeIldBarFillPercentFromMl,
} from "@/lib/metrics/ild-volume-bar";
import type {
  MetricProgressGroup,
  MetricProgressItem,
} from "@/lib/metrics/metric-progress-types";
import {
  normalizeVolumeDisplayUnit,
  type VolumeDisplayUnit,
} from "@/lib/metrics/volume-display-unit";

export type { MetricProgressGroup, MetricProgressItem };

/** Three groups: volumes & burden, lesion patterns, craniocaudal zones. */
export function buildSegmentationMetricGroups(
  metrics: StudyMetrics | null | undefined,
  unit: VolumeDisplayUnit = "mm",
): MetricProgressGroup[] {
  if (!metrics) return [];

  const displayUnit = normalizeVolumeDisplayUnit(unit);
  const ildBurden = metrics.ild_burden ?? metrics.ild_fraction;

  const volumes: MetricProgressItem[] = [
    {
      label: metricLabelWithUnit("Total ILD volume", displayUnit),
      val: formatSegmentationVolume(displayUnit, {
        volumeMm3: metrics.volume_total_mm3,
        burdenFraction: ildBurden,
      }),
      color: "bg-red-500",
      progress: computeIldBarFillPercent(metrics.volume_total_mm3 ?? 0),
    },
  ];

  const perClass: Array<{
    name: string;
    ml?: number | null;
    burden?: number | null;
    color: string;
  }> = [
    { name: "GGO", ml: metrics.ggo_volume_ml, burden: metrics.ggo_burden, color: "bg-emerald-500" },
    {
      name: "Reticulation",
      ml: metrics.reticulation_volume_ml,
      burden: metrics.reticulation_burden,
      color: "bg-sky-500",
    },
    {
      name: "Consolidation",
      ml: metrics.consolidation_volume_ml,
      burden: metrics.consolidation_burden,
      color: "bg-amber-500",
    },
  ];

  const lungMl = metrics.lung_volume_ml;
  const patterns: MetricProgressItem[] = [];
  for (const c of perClass) {
    if (c.ml == null && c.burden == null) continue;
    let volumeMl: number | null = c.ml ?? null;
    if (volumeMl == null && lungMl != null && lungMl > 0 && c.burden != null) {
      volumeMl = c.burden * lungMl;
    }
    if (volumeMl == null && c.burden === 0) volumeMl = 0;

    const burdenFrac =
      c.burden ??
      (lungMl != null && lungMl > 0 && volumeMl != null ? volumeMl / lungMl : 0);

    patterns.push({
      label: metricLabelWithUnit(c.name, displayUnit),
      val: formatSegmentationVolume(displayUnit, {
        volumeMl,
        burdenFraction: burdenFrac,
      }),
      color: c.color,
      progress: computeIldBarFillPercentFromMl(volumeMl ?? 0),
    });
  }

  const zones: MetricProgressItem[] = [];
  const zonal = metrics.zonal_distribution;
  if (zonal) {
    if (zonal.Upper !== undefined) {
      zones.push({
        label: "Upper zone",
        val: `${zonal.Upper.toFixed(1)}%`,
        color: "bg-cyan-500",
        progress: zonal.Upper,
      });
    }
    if (zonal.Middle !== undefined) {
      zones.push({
        label: "Middle zone",
        val: `${zonal.Middle.toFixed(1)}%`,
        color: "bg-yellow-500",
        progress: zonal.Middle,
      });
    }
    if (zonal.Lower !== undefined) {
      zones.push({
        label: "Lower zone",
        val: `${zonal.Lower.toFixed(1)}%`,
        color: "bg-orange-500",
        progress: zonal.Lower,
      });
    }
  }

  const groups: MetricProgressGroup[] = [
    { title: "Volumes & burden", items: volumes },
  ];
  if (patterns.length > 0) {
    groups.push({ title: "Patterns", items: patterns });
  }
  if (zones.length > 0) {
    groups.push({ title: "Craniocaudal zones", items: zones });
  }

  return groups;
}
