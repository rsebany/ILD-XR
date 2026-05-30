"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolbarCluster } from "./ToolbarCluster";

type Props = {
  onFocusStack: () => void;
  onFocusMesh: () => void;
  onBalancedView: () => void;
  realLungEnabled?: boolean;
  onToggleRealLung?: () => void;
};

export function CameraToolbarGroup({
  onFocusStack,
  onFocusMesh,
  onBalancedView,
  realLungEnabled,
  onToggleRealLung,
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
      {onToggleRealLung ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleRealLung}
          title="Opaque realistic lung tissue"
          className={cn(
            `${btn} border-amber-500/40 hover:bg-amber-950/80`,
            realLungEnabled ? "text-amber-100" : "text-slate-300",
          )}
        >
          Real lung
        </Button>
      ) : null}
    </ToolbarCluster>
  );
}
