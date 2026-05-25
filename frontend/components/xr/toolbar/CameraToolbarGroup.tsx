"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolbarCluster } from "./ToolbarCluster";

type Props = {
  onFocusStack: () => void;
  onFocusMesh: () => void;
  onBalancedView: () => void;
  cutawayEnabled?: boolean;
  onToggleCutaway?: () => void;
};

export function CameraToolbarGroup({
  onFocusStack,
  onFocusMesh,
  onBalancedView,
  cutawayEnabled,
  onToggleCutaway,
}: Props) {
  const btn =
    "h-8 shrink-0 bg-slate-950/70 px-2 text-xs sm:h-9 sm:px-3";
  return (
    <ToolbarCluster label="View">
      <Button type="button" variant="outline" size="sm" onClick={onFocusStack} className={`${btn} border-cyan-500/40 text-cyan-100 hover:bg-cyan-950/80`}>
        DICOM
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onFocusMesh} className={`${btn} border-emerald-500/40 text-emerald-100 hover:bg-emerald-950/80`}>
        Mesh
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onBalancedView} className={`${btn} border-sky-500/40 text-sky-100 hover:bg-sky-950/80`}>
        Balance
      </Button>
      {onToggleCutaway ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleCutaway}
          className={cn(
            `${btn} border-rose-500/40 hover:bg-rose-950/80`,
            cutawayEnabled ? "text-rose-100" : "text-slate-300",
          )}
        >
          Cutaway
        </Button>
      ) : null}
    </ToolbarCluster>
  );
}
