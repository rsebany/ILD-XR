"use client";

import { XrBottomToolbar } from "../toolbar";
import { XrImmersiveHud, XrLabHeader, XrMetricsPanel, XrStatusOverlays } from "../chrome";
import { SegmentationClassLegend } from "@/components/features/viewer/ui/SegmentationClassLegend";
import type { StudyMetrics } from "@/api/domain";
import type { MeshClassVisibility, XrExperienceMode } from "./types";

type Props = {
  mode: XrExperienceMode;
  isPresenting: boolean;
  studyId: string | null;
  syncConnected: boolean;
  metrics: StudyMetrics | null;
  xrError: string | null;
  meshError: string | null;
  isLoading: boolean;
  preparingImmersive: boolean;
  onExitImmersive: () => void;
  alternateLabHref: string;
  isImmersiveSupported: boolean;
  isCheckingSupport: boolean;
  meshClassVisibility: MeshClassVisibility;
  realLungEnabled: boolean;
  onFocusStack: () => void;
  onFocusMesh: () => void;
  onBalancedView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPresetAll: () => void;
  onPresetLesions: () => void;
  onPresetShell: () => void;
  onToggleMeshClass: (key: keyof MeshClassVisibility) => void;
  onToggleRealLung: () => void;
  onEnterImmersive: () => void | Promise<void>;
  onToggleFullscreen: () => void;
};

export function XrExperienceChrome(props: Props) {
  const {
    mode, isPresenting, studyId, syncConnected, metrics, xrError, meshError, isLoading,
    preparingImmersive, onExitImmersive, alternateLabHref, isImmersiveSupported, isCheckingSupport,
    meshClassVisibility, realLungEnabled, onFocusStack, onFocusMesh, onBalancedView, onZoomIn,
    onZoomOut, onPresetAll, onPresetLesions, onPresetShell, onToggleMeshClass, onToggleRealLung,
    onEnterImmersive, onToggleFullscreen,
  } = props;

  return (
    <>
      {!isPresenting && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 pb-3 pt-[calc(var(--safe-area-top)+0.75rem)] sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <XrLabHeader studyId={studyId} syncConnected={syncConnected} />
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              {metrics && <XrMetricsPanel metrics={metrics} />}
              <SegmentationClassLegend compact palette="mesh3d" className="max-w-[16rem] border-white/10 bg-slate-900/85 text-white [&_p]:text-slate-400 [&_span]:text-slate-200" />
            </div>
          </div>
        </div>
      )}
      <XrStatusOverlays xrError={xrError} meshError={meshError} isLoading={isLoading} studyId={studyId} />
      {isPresenting && <XrImmersiveHud mode={mode} onExit={onExitImmersive} />}
      {preparingImmersive && !isPresenting && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex justify-center">
          <p className="rounded-full border border-cyan-500/40 bg-black/70 px-3 py-1 text-[11px] font-medium text-cyan-200">
            Preparing VR…
          </p>
        </div>
      )}
      {!isPresenting && (
        <XrBottomToolbar
          onFocusStack={onFocusStack}
          onFocusMesh={onFocusMesh}
          onBalancedView={onBalancedView}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onPresetAll={onPresetAll}
          onPresetLesions={onPresetLesions}
          onPresetShell={onPresetShell}
          meshClassVisibility={meshClassVisibility}
          onToggleMeshClass={onToggleMeshClass}
          realLungEnabled={realLungEnabled}
          onToggleRealLung={onToggleRealLung}
          onEnterImmersiveCentered={onEnterImmersive}
          onToggleFullscreen={onToggleFullscreen}
          alternateLabHref={alternateLabHref}
          alternateLabShortLabel={mode === "ar" ? "VR" : "AR"}
          immersiveMode={mode}
          isImmersiveSupported={isImmersiveSupported}
          isCheckingSupport={isCheckingSupport}
        />
      )}
    </>
  );
}
