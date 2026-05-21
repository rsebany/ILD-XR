"use client";

import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  UserPlus,
  Clock,
  CheckCircle2,
  FileText,
  Box,
  Upload,
  Sparkles,
  MonitorPlay,
  FileDown,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/ui/KPICard";
import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "@/api/domain";

type CanFn = (permission: string) => boolean;

interface DashboardOverviewProps {
  can: CanFn;
  patientsCount: number;
  studiesCount: number;
  dashboardMetrics?: DashboardMetrics | null;
  onStartAnalysis: () => void;
  kpiLoading?: boolean;
  kpiSkeletonCount?: number;
  workflowChartLoading?: boolean;
  /** True when there are no patients and no studies — CTAs live in the welcome row above. */
  workspaceEmpty?: boolean;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  can,
  patientsCount,
  studiesCount,
  dashboardMetrics,
  onStartAnalysis,
  kpiLoading,
  kpiSkeletonCount = 4,
  workflowChartLoading,
  workspaceEmpty = false,
}) => {
  const pendingCount = dashboardMetrics?.pending_count ?? 0;
  const completedToday = dashboardMetrics?.completed_today ?? 0;
  const processedCount = Math.max(studiesCount - pendingCount, 0);
  const avgTurnaroundHours = dashboardMetrics?.avg_turnaround_hours;
  const pendingPct =
    studiesCount > 0 ? (pendingCount / studiesCount) * 100 : 0;
  const processedPct =
    studiesCount > 0 ? (processedCount / studiesCount) * 100 : 0;

  const showNewCase = can("upload_hrct") && can("trigger_ai");
  const showXrLab = can("explore_3d_xr") || can("view_shared_3d");
  const showVolumeRow = can("quantitative_metrics");
  const pipelineHasStudies = studiesCount > 0;

  /** Icon-only pipeline for empty state (upload → … → report). */
  const pipelineVisualSteps = (() => {
    type Step = { key: string; Icon: LucideIcon; label: string; className: string };
    const steps: Step[] = [
      {
        key: "upload",
        Icon: Upload,
        label: "Upload DICOM",
        className: "border-sky-500/25 bg-sky-500/10 text-sky-700",
      },
      {
        key: "ai",
        Icon: Sparkles,
        label: "Run AI",
        className: "border-violet-500/25 bg-violet-500/10 text-violet-700",
      },
      {
        key: "read",
        Icon: MonitorPlay,
        label: "Read 2D",
        className: "border-amber-500/25 bg-amber-500/10 text-amber-800",
      },
      ...(showXrLab
        ? [
            {
              key: "xr",
              Icon: Box,
              label: "View 3D/XR",
              className: "border-sky-600/30 bg-sky-600/10 text-sky-800",
            },
          ]
        : []),
      {
        key: "report",
        Icon: FileDown,
        label: "Get Report",
        className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800",
      },
    ];

    return (
      <div
        className="flex min-h-[10rem] w-full flex-col justify-center px-3 py-6 sm:min-h-[11rem] sm:px-5"
        role="img"
        aria-label="Pipeline: Upload DICOM, Run AI, Read 2D, View 3D or XR, Get Report"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max items-center gap-0 sm:min-w-0 sm:w-full">
          {steps.map((step, index) => (
            <React.Fragment key={step.key}>
              {index > 0 ? (
                <div
                  className="flex h-10 w-5 shrink-0 items-center justify-center sm:w-6"
                  aria-hidden
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground/45" />
                </div>
              ) : null}
              <div
                className="flex w-[4.2rem] shrink-0 flex-col items-center gap-1.5 sm:min-w-0 sm:flex-1 sm:basis-0"
                aria-label={`Step ${index + 1}: ${step.label}`}
              >
                <span
                  className="text-[11px] font-semibold tabular-nums leading-none text-foreground sm:text-xs"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm sm:h-12 sm:w-12 ${step.className}`}
                >
                  <step.Icon className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
                </div>
                <span className="w-full px-0.5 text-center text-[9px] font-medium leading-snug text-muted-foreground sm:text-[10px]">
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          ))}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="space-y-6">
      {kpiLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: kpiSkeletonCount }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-xl border border-ild-border bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <KPICard
            icon={<Users className="text-blue-500" />}
            label="Active Patients"
            value={patientsCount}
            href="/patients"
            color="blue"
            can={can("manage_patients")}
          />
          <KPICard
            icon={<FileText className="text-sky-500" />}
            label="Total Studies"
            value={studiesCount}
            href="/studies"
            color="sky"
            can={can("quantitative_metrics")}
          />
          <KPICard
            icon={<Clock className="text-amber-500" />}
            label="Awaiting Review"
            value={pendingCount}
            badge="PENDING"
            color="amber"
            can={can("quantitative_metrics")}
          />
          <KPICard
            icon={<CheckCircle2 className="text-emerald-500" />}
            label="Done today"
            value={completedToday}
            badge="TODAY"
            color="emerald"
            can={can("quantitative_metrics")}
          />
        </div>
      )}

      {showVolumeRow && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div
            className={cn(
              "md:col-span-3 rounded-xl border border-ild-border bg-ild-card p-5",
              !workflowChartLoading &&
                !pipelineHasStudies &&
                "flex min-h-[248px] flex-col md:min-h-[260px]",
            )}
          >
            <div className="mb-3 flex shrink-0 items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Pipeline</h3>
              {!workflowChartLoading && pipelineHasStudies && can("quantitative_metrics") && (
                <Link
                  href="/studies"
                  className="shrink-0 text-xs text-sky-600 hover:underline"
                >
                  All studies
                </Link>
              )}
            </div>
            {workflowChartLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-muted/50" aria-hidden />
            ) : !pipelineHasStudies ? (
              workspaceEmpty ? (
                <div className="flex min-h-0 flex-1 flex-col justify-center">
                  {pipelineVisualSteps}
                </div>
              ) : (
                <div className="space-y-4">
                  {pipelineVisualSteps}
                  <div className="space-y-2 border-t border-ild-border/80 pt-3">
                    <p className="text-xs text-muted-foreground">
                      No study on file yet for your current patients.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {showNewCase && (
                        <Button
                          asChild
                          size="sm"
                          className="h-8 bg-sky-600 hover:bg-sky-500"
                        >
                          <Link href="/upload-dicom">
                            <Upload className="mr-2 h-3.5 w-3.5" />
                            Upload HRCT
                          </Link>
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href="/studies">Study browser</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex h-3 w-full max-w-md overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full shrink-0 bg-amber-500"
                      style={{ width: `${pendingPct}%` }}
                    />
                    <div
                      className="h-full shrink-0 bg-emerald-500"
                      style={{ width: `${processedPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Pending{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {pendingCount}
                      </span>
                    </span>
                    <span>
                      Processed{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {processedCount}
                      </span>
                    </span>
                  </div>
                </div>
                {typeof avgTurnaroundHours === "number" &&
                Number.isFinite(avgTurnaroundHours) &&
                avgTurnaroundHours > 0 ? (
                  <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                    Avg turnaround{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {avgTurnaroundHours.toFixed(1)}h
                    </span>
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center gap-2 rounded-xl border border-ild-border bg-ild-card p-4">
            {showNewCase && (
              <Button
                onClick={onStartAnalysis}
                className="w-full bg-sky-600 hover:bg-sky-500"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                New study
              </Button>
            )}
            {showXrLab && (
              <Button asChild variant="outline" className="w-full">
                <Link href="/webxr">
                  <Box className="mr-2 h-4 w-4" />
                  3D & XR
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
