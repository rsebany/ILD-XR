"use client";

import type { StudyMetrics } from "@/api/types/analytics";
import { TotalIldVolumeLine } from "@/components/metrics";
import { formatVolumeFromMlAsMm3 } from "@/lib/metrics/format-volume-mm3";

type Props = {
  metrics: StudyMetrics;
};

function resolveClassVolumeMl(
  lungMl: number | null | undefined,
  ml?: number | null,
  burden?: number | null,
): number | null {
  let volumeMl: number | null = ml ?? null;
  if (volumeMl == null && lungMl != null && lungMl > 0 && burden != null) {
    volumeMl = burden * lungMl;
  }
  if (volumeMl == null && burden === 0) volumeMl = 0;
  return volumeMl;
}

/** Minimal metrics strip for XR. */
export function XrMetricsPanel({ metrics }: Props) {
  const lungMl = metrics.lung_volume_ml;
  const classVolumeRows = [
    {
      key: "ggo",
      label: "GGO",
      ml: metrics.ggo_volume_ml,
      burden: metrics.ggo_burden,
      colorClass: "text-emerald-300",
    },
    {
      key: "reticulation",
      label: "Ret",
      ml: metrics.reticulation_volume_ml,
      burden: metrics.reticulation_burden,
      colorClass: "text-violet-300",
    },
    {
      key: "consolidation",
      label: "Cons",
      ml: metrics.consolidation_volume_ml,
      burden: metrics.consolidation_burden,
      colorClass: "text-amber-300",
    },
  ] as const;

  return (
    <div className="pointer-events-auto w-full max-w-[11rem] rounded-lg border border-white/10 bg-slate-900/85 px-2.5 py-2 backdrop-blur-md sm:max-w-[13rem]">
      <TotalIldVolumeLine
        volumeTotalMm3={metrics.volume_total_mm3}
        valueClassName="text-base font-bold leading-tight text-white sm:text-lg"
        unitClassName="ml-1 text-[10px] font-normal text-slate-400"
      />
      <div className="mt-1.5 grid grid-cols-3 gap-x-1 gap-y-0.5 border-t border-white/10 pt-1.5 text-[10px] leading-tight">
        {classVolumeRows.map((row) => {
          const vol = resolveClassVolumeMl(lungMl, row.ml, row.burden);
          return (
            <div key={row.key} className="min-w-0 text-center">
              <div className={`truncate font-medium ${row.colorClass}`}>{row.label}</div>
              <div className="truncate font-semibold text-white">
                {vol != null ? formatVolumeFromMlAsMm3(vol) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
