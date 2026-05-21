"use client";

import { formatVolumeMm3 } from "@/lib/metrics/format-volume-mm3";

type Props = {
  volumeTotalMm3: number;
  showWhenPending?: boolean;
  isCompleted: boolean;
};

export function StudyIldBar({
  volumeTotalMm3,
  isCompleted,
  showWhenPending = false,
}: Props) {
  if (!isCompleted && !showWhenPending) {
    return <span className="text-xs text-muted-foreground italic">Calculating...</span>;
  }

  const volumeMm3 = Math.max(0, volumeTotalMm3);
  // Keep a compact progress cue using an approximate 5L lung volume range (5e6 mm³).
  const percent = Math.max(0, Math.min(100, (volumeMm3 / 5_000_000) * 100));

  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-24 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs font-mono text-foreground">{formatVolumeMm3(volumeMm3)}</span>
    </div>
  );
}

