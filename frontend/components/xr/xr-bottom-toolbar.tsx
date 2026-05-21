"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type XrImmersiveToolbarMode = "vr" | "ar";

/** Where the XR control groups sit on screen. */
export type XrToolbarDock = "right";

export function parseXrToolbarDock(raw: string | null): XrToolbarDock {
  void raw;
  return "right";
}

/** Loose row of controls — no panel chrome so each button reads on its own. */
function ToolbarCluster({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2"
    >
      {children}
    </div>
  );
}

type Props = {
  onFocusStack: () => void;
  onFocusMesh: () => void;
  onBalancedView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  /** Center toolbar layout, balanced camera, then request immersive session. */
  onEnterImmersiveCentered: () => void | Promise<void>;
  /** Toggle browser fullscreen for immersive preview (hides navbar) */
  onToggleFullscreen?: () => void;
  alternateLabHref: string;
  alternateLabShortLabel: string;
  immersiveMode: XrImmersiveToolbarMode;
  isImmersiveSupported: boolean;
  meshClassVisibility: {
    ggo: boolean;
    reticulation: boolean;
    consolidation: boolean;
    lung_shell: boolean;
  };
  onToggleMeshClass: (key: "ggo" | "reticulation" | "consolidation" | "lung_shell") => void;
};

export function XrBottomToolbar({
  onFocusStack,
  onFocusMesh,
  onBalancedView,
  onZoomIn,
  onZoomOut,
  onPresetAll,
  onPresetLesions,
  onPresetShell,
  onEnterImmersiveCentered,
  onToggleFullscreen,
  alternateLabHref,
  alternateLabShortLabel,
  immersiveMode,
  isImmersiveSupported,
  meshClassVisibility,
  onToggleMeshClass,
}: Props) {
  const classButtons = [
    { key: "ggo", label: "GGO", activeClass: "border-emerald-500/60 text-emerald-100" },
    {
      key: "reticulation",
      label: "Retic",
      activeClass: "border-violet-500/60 text-violet-100",
    },
    {
      key: "consolidation",
      label: "Cons",
      activeClass: "border-amber-500/60 text-amber-100",
    },
    { key: "lung_shell", label: "Shell", activeClass: "border-slate-500/70 text-slate-100" },
  ] as const;

  const cameraGroup = (
    <ToolbarCluster label="View">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onFocusStack}
        className="h-8 shrink-0 border-cyan-500/40 bg-slate-950/70 px-2 text-xs text-cyan-100 hover:bg-cyan-950/80 sm:h-9 sm:px-3"
      >
        DICOM
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onFocusMesh}
        className="h-8 shrink-0 border-emerald-500/40 bg-slate-950/70 px-2 text-xs text-emerald-100 hover:bg-emerald-950/80 sm:h-9 sm:px-3"
      >
        Mesh
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onBalancedView}
        className="h-8 shrink-0 border-sky-500/40 bg-slate-950/70 px-2 text-xs text-sky-100 hover:bg-sky-950/80 sm:h-9 sm:px-3"
      >
        Balance
      </Button>
    </ToolbarCluster>
  );

  const zoomGroup = (
    <ToolbarCluster label="Zoom">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onZoomOut}
        className="h-8 shrink-0 border-slate-500/40 bg-slate-950/70 px-2.5 text-xs text-slate-100 hover:bg-slate-800/80 sm:h-9"
      >
        -
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onZoomIn}
        className="h-8 shrink-0 border-slate-500/40 bg-slate-950/70 px-2.5 text-xs text-slate-100 hover:bg-slate-800/80 sm:h-9"
      >
        +
      </Button>
    </ToolbarCluster>
  );

  const layersGroup = (
    <ToolbarCluster label="Layers">
      {classButtons.map((item) => {
        const isActive = meshClassVisibility[item.key];
        return (
          <Button
            key={item.key}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onToggleMeshClass(item.key)}
            className={`h-8 shrink-0 px-2 text-xs sm:h-9 sm:px-2.5 bg-slate-950/70 hover:bg-slate-900/85 ${
              isActive ? item.activeClass : "border-white/20 text-slate-300"
            }`}
          >
            {item.label}
          </Button>
        );
      })}
    </ToolbarCluster>
  );

  const presetsGroup = (
    <ToolbarCluster label="Presets">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPresetAll}
        className="h-8 shrink-0 border-sky-500/40 bg-slate-950/70 px-2 text-xs text-sky-100 hover:bg-sky-950/80 sm:h-9 sm:px-2.5"
      >
        All
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPresetLesions}
        className="h-8 shrink-0 border-violet-500/40 bg-slate-950/70 px-2 text-xs text-violet-100 hover:bg-violet-950/80 sm:h-9 sm:px-2.5"
      >
        Lesions
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onPresetShell}
        className="h-8 shrink-0 border-slate-500/40 bg-slate-950/70 px-2 text-xs text-slate-100 hover:bg-slate-800/80 sm:h-9 sm:px-2.5"
      >
        Shell
      </Button>
    </ToolbarCluster>
  );

  const enterLabel = immersiveMode === "ar" ? "Enter AR" : "Enter VR";
  const immersiveRow = (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center",
      )}
    >
      <div className="flex gap-2 w-full max-w-xs sm:flex-1">
        {isImmersiveSupported ? (
          <Button
            type="button"
            onClick={() => void onEnterImmersiveCentered()}
            className={cn(
              "h-10 shrink-0 rounded-full bg-sky-600 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-500 sm:h-11",
              "flex-1",
            )}
          >
            {enterLabel}
          </Button>
        ) : (
          <Button
            type="button"
            asChild
            className={cn(
              "h-10 shrink-0 rounded-full bg-sky-600 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-500 sm:h-11",
              "flex-1",
            )}
          >
            <Link href={alternateLabHref} prefetch>
              Open {alternateLabShortLabel}
            </Link>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleFullscreen}
          className={cn(
            "h-10 shrink-0 border-white/20 bg-slate-950/50 text-xs text-slate-200 hover:bg-slate-900/80 sm:h-11",
            "w-24"
          )}
        >
          Plein écran
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        asChild
        className={cn(
          "h-10 shrink-0 border-white/20 bg-slate-950/50 text-xs text-slate-200 hover:bg-slate-900/80 sm:h-11",
          "w-full max-w-xs sm:flex-1",
        )}
      >
        <Link href={alternateLabHref} prefetch>
          {alternateLabShortLabel} lab
        </Link>
      </Button>
    </div>
  );

  const unsupportedNote = !isImmersiveSupported ? (
    <p
      className="max-w-[14rem] text-center text-[10px] leading-snug text-amber-400/90"
      title={
        immersiveMode === "ar"
          ? "AR needs a supported device and HTTPS."
          : "Connect a WebXR headset or use desktop view."
      }
    >
      Immersive not available in this browser.
    </p>
  ) : null;

  return (
    <div
      className={cn(
        "safe-bottom pointer-events-auto absolute z-20 flex max-h-[min(45vh,22rem)] flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-2 sm:bottom-4 sm:gap-2.5 sm:px-4 sm:pb-0",
        "bottom-2 right-3 left-auto w-[min(100%,22rem)] sm:right-4",
      )}
    >
      {cameraGroup}
      {zoomGroup}
      {layersGroup}
      {presetsGroup}
      {immersiveRow}
      {unsupportedNote}
    </div>
  );
}
