import React from "react";
import Link from "next/link";
import { BarChart, Layers, RefreshCw, Scan } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MetricProgressRows,
  type MetricProgressGroup,
} from "@/components/metrics";


type View2DMetricsPanelProps = {
  metricGroups: MetricProgressGroup[];
  metricsLoading: boolean;
  reanalyzeError: string | null;
  canReanalyze: boolean;
  reanalyzeLoading: boolean;
  onRunAiAgain: () => void;
  /** Reserved for future viewer mode toggle (2D PNG vs 3D DICOM stack). */
  viewerMode?: "png" | "dicom3d";
  onViewerModeChange?: (mode: "png" | "dicom3d") => void;
  studyId?: string | null;
  patientId?: string | null;
  /** Which viewer this sidebar is shown on — drives the primary switch link. */
  activeViewer: "2d" | "3d";
};

export function View2DMetricsPanel({
  metricGroups,
  metricsLoading,
  reanalyzeError,
  canReanalyze,
  reanalyzeLoading,
  onRunAiAgain,
  viewerMode: _viewerMode,
  onViewerModeChange: _onViewerModeChange,
  studyId,
  patientId,
  activeViewer,
}: View2DMetricsPanelProps) {
  const qs = new URLSearchParams();
  if (studyId) qs.set("studyId", studyId);
  if (patientId) qs.set("patientId", patientId);
  const q = qs.toString();
  const switchHref =
    activeViewer === "3d" ? `/view2d?${q}` : `/view3d?${q}`;
  const switchLabel =
    activeViewer === "3d" ? "View 2D slices" : "View 3D reconstruction";
  const SwitchIcon = activeViewer === "3d" ? Scan : Layers;

  return (
    <div className="flex w-full max-w-xs flex-col gap-6">
      <section className="flex h-full flex-col rounded-2xl border border-ild-border bg-ild-card p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <BarChart className="h-4 w-4 shrink-0 text-sky-500" />{" "}
            <span className="truncate">Segmentation Results</span>
          </h3>
        </div>

        {studyId ? (
          <div className="mb-5">
            <Button
              asChild
              variant="outline"
              className="h-11 w-full justify-center gap-2 rounded-xl border-sky-500/40 bg-sky-500/5 text-sm font-semibold text-foreground hover:bg-sky-500/10"
            >
              <Link href={switchHref}>
                <SwitchIcon className="h-4 w-4 text-sky-600" />
                {switchLabel}
              </Link>
            </Button>
          </div>
        ) : null}

        <MetricProgressRows groups={metricGroups} loading={metricsLoading} />

        <div className="mt-auto space-y-3 border-t border-ild-border pt-6">
          {reanalyzeError && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              {reanalyzeError}
            </p>
          )}

          <Button
            onClick={onRunAiAgain}
            disabled={!canReanalyze || reanalyzeLoading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {reanalyzeLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Running AI…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Run AI analysis
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
