"use client";

import type { StudyMetrics } from "@/api/types/analytics";
import { formatVolumeFromMlAsMm3, formatVolumeMm3Number } from "@/lib/metrics/format-volume-mm3";
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
  valueClassName = "text-2xl font-black text-white",
  unitClassName = "ml-1 text-sm font-normal text-slate-400",
  labelClassName = "text-[10px] font-medium text-slate-400",
}: {
  volumeTotalMm3: number;
  valueClassName?: string;
  unitClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div>
      <p className={labelClassName}>Total ILD Volume</p>
      <p className={valueClassName}>
        {formatVolumeMm3Number(volumeTotalMm3)}
        <span className={unitClassName}>mm³</span>
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
}: {
  metrics: StudyMetrics;
}) {
  const cells = [
    {
      key: "ggo",
      title: "GGO",
      burden: metrics.ggo_burden,
      volumeMl: metrics.ggo_volume_ml,
      titleClass: "text-emerald-300",
      boxClass: "bg-emerald-500/10",
    },
    {
      key: "retic",
      title: "Retic.",
      burden: metrics.reticulation_burden,
      volumeMl: metrics.reticulation_volume_ml,
      titleClass: "text-sky-300",
      boxClass: "bg-sky-500/10",
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
    <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
      {cells.map((c) => (
        <div key={c.key} className={cn("rounded-md px-2 py-1", c.boxClass)}>
          <p className={cn("font-semibold", c.titleClass)}>{c.title}</p>
          <p className="font-mono text-white">{((c.burden ?? 0) * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400">
            {formatVolumeFromMlAsMm3(c.volumeMl ?? 0)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function IldBurdenSummary({
  metrics,
  burdenClassName = "text-xl font-black text-sky-400",
}: {
  metrics: StudyMetrics;
  burdenClassName?: string;
}) {
  const pct = (metrics.ild_burden ?? metrics.ild_fraction) * 100;
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-400">ILD Burden</p>
      <p className={burdenClassName}>{pct.toFixed(2)}%</p>
      {metrics.lung_volume_ml != null && (
        <p className="text-[10px] text-slate-400">
          Lung volume: {formatVolumeFromMlAsMm3(metrics.lung_volume_ml)}
        </p>
      )}
    </div>
  );
}
