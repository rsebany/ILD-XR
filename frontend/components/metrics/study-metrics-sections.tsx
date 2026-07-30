"use client";

import type { StudyMetrics } from "@/api/domain";
import { useVolumeDisplayUnit } from "@/hooks/settings/use-volume-display-unit";
import {
  formatSegmentationVolume,
  formatSegmentationVolumeNumber,
  formatSegmentationVolumeUnitLabel,
} from "@/lib/metrics/format-segmentation-volume";
import type { VolumeDisplayUnit } from "@/lib/metrics/volume-display-unit";
import { cn } from "@/lib/utils";

export function MetricsPanelDivider({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("h-px bg-white/10", className)} />;
}

export function TotalIldVolumeLine({
  volumeTotalMm3,
  burdenFraction,
  displayUnit: displayUnitProp,
  valueClassName = "text-2xl font-black text-white",
  unitClassName = "ml-1 text-sm font-normal text-slate-400",
  labelClassName = "text-[10px] font-medium text-slate-400",
}: {
  volumeTotalMm3: number;
  burdenFraction?: number | null;
  displayUnit?: VolumeDisplayUnit;
  valueClassName?: string;
  unitClassName?: string;
  labelClassName?: string;
}) {
  const displayUnitFromSettings = useVolumeDisplayUnit();
  const displayUnit = displayUnitProp ?? displayUnitFromSettings;
  const burden = burdenFraction;

  return (
    <div>
      <p className={labelClassName}>Total ILD Volume</p>
      <p className={valueClassName}>
        {formatSegmentationVolumeNumber(displayUnit, {
          volumeMm3: volumeTotalMm3,
          burdenFraction: burden,
        })}
        <span className={unitClassName}>
          {formatSegmentationVolumeUnitLabel(displayUnit)}
        </span>
      </p>
    </div>
  );
}

export function ZonalDistributionRows({
  distribution,
  rowLabelClassName = "text-xs",
}: {
  distribution: StudyMetrics["zonal_distribution"] | undefined | null;
  rowLabelClassName?: string;
}) {
  if (!distribution) return null;
  const rows = [
    { key: "Upper", label: "Upper" },
    { key: "Middle", label: "Middle" },
    { key: "Lower", label: "Lower" },
  ] as const;
  return (
    <div className="space-y-2">
      {rows.map(({ key, label }) => {
        const v = distribution[key];
        if (v === undefined) return null;
        return (
          <div key={key} className="flex items-center justify-between">
            <span className={cn(rowLabelClassName, ZONE_COLORS[key])}>{label}</span>
            <span className="font-bold text-white">{v.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

const ZONE_COLORS: Record<"Upper" | "Middle" | "Lower", string> = {
  Upper: "text-emerald-400",
  Middle: "text-yellow-400",
  Lower: "text-blue-400",
};

export function LesionClassBurdenGrid({
  metrics,
  displayUnit: displayUnitProp,
}: {
  metrics: StudyMetrics;
  displayUnit?: VolumeDisplayUnit;
}) {
  const displayUnitFromSettings = useVolumeDisplayUnit();
  const displayUnit = displayUnitProp ?? displayUnitFromSettings;
  const showBurdenPct = displayUnit !== "percent";

  const cells = [
    {
      key: "emphysema",
      title: "Emphy.",
      burden: metrics.emphysema_burden,
      volumeMl: metrics.emphysema_volume_ml,
      titleClass: "text-blue-300",
      boxClass: "bg-blue-500/10",
    },
    {
      key: "fibrosis",
      title: "Fibrosis",
      burden: metrics.fibrosis_burden,
      volumeMl: metrics.fibrosis_volume_ml,
      titleClass: "text-orange-300",
      boxClass: "bg-orange-500/10",
    },
    {
      key: "ggo",
      title: "GG",
      burden: metrics.ground_glass_burden,
      volumeMl: metrics.ground_glass_volume_ml,
      titleClass: "text-emerald-300",
      boxClass: "bg-emerald-500/10",
    },
    {
      key: "micronodules",
      title: "Micro.",
      burden: metrics.micronodules_burden,
      volumeMl: metrics.micronodules_volume_ml,
      titleClass: "text-fuchsia-300",
      boxClass: "bg-fuchsia-500/10",
    },
    {
      key: "cons",
      title: "Cons.",
      burden: metrics.consolidation_burden,
      volumeMl: metrics.consolidation_volume_ml,
      titleClass: "text-amber-300",
      boxClass: "bg-amber-500/10",
    },
  ] as const;

  return (
    <div className="mt-1 grid grid-cols-5 gap-2 text-[11px]">
      {cells.map((c) => (
        <div key={c.key} className={cn("rounded-md px-2 py-1", c.boxClass)}>
          <p className={cn("font-semibold", c.titleClass)}>{c.title}</p>
          {showBurdenPct && (
            <p className="font-mono text-white">{((c.burden ?? 0) * 100).toFixed(1)}%</p>
          )}
          <p className="text-[10px] text-slate-400">
            {formatSegmentationVolume(displayUnit, {
              volumeMl: c.volumeMl ?? 0,
              burdenFraction: c.burden,
            })}
          </p>
        </div>
      ))}
    </div>
  );
}

export function IldBurdenSummary({
  metrics,
  displayUnit: displayUnitProp,
  burdenClassName = "text-xl font-black text-sky-400",
}: {
  metrics: StudyMetrics;
  displayUnit?: VolumeDisplayUnit;
  burdenClassName?: string;
}) {
  const displayUnitFromSettings = useVolumeDisplayUnit();
  const displayUnit = displayUnitProp ?? displayUnitFromSettings;
  const pct = (metrics.ild_burden ?? metrics.ild_fraction) * 100;

  return (
    <div>
      <p className="text-[10px] font-medium text-slate-400">ILD Burden</p>
      <p className={burdenClassName}>{pct.toFixed(2)}%</p>
      {metrics.lung_volume_ml != null && displayUnit !== "percent" && (
        <p className="text-[10px] text-slate-400">
          Lung volume:{" "}
          {formatSegmentationVolume(displayUnit, {
            volumeMl: metrics.lung_volume_ml,
          })}
        </p>
      )}
    </div>
  );
}
