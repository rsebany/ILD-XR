import type { StudyMetrics } from "@/api/domain";
import type { MetricProgressItem } from "@/components/metrics";
import { formatVolumeFromMlAsMm3, formatVolumeMm3 } from "@/lib/metrics/format-volume-mm3";

export type MetricProgressGroup = {
  title: string;
  items: MetricProgressItem[];
};

/** Three groups: volumes & burden, lesion patterns, craniocaudal zones (same logic as legacy flat list). */
export function buildSegmentationMetricGroups(
  metrics: StudyMetrics | null | undefined,
): MetricProgressGroup[] {
  if (!metrics) return [];

  const ildBurden = metrics.ild_burden ?? metrics.ild_fraction;

  const volumes: MetricProgressItem[] = [
    {
      label: "Total ILD volume (mm³)",
      val: formatVolumeMm3(metrics.volume_total_mm3),
      color: "bg-red-500",
      progress: Math.min(100, ildBurden * 100),
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
    const burdenPct = burdenFrac * 100;

    patterns.push({
      label: `${c.name} (mm³)`,
      val: volumeMl != null ? formatVolumeFromMlAsMm3(volumeMl) : "—",
      color: c.color,
      progress: Math.min(100, burdenPct),
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
