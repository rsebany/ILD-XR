import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Clock,
  Eye,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Timer,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatVolumeMm3 } from "@/lib/metrics/format-volume-mm3";
import type { RecentStudyRow } from "@/lib/dashboard";

type WorklistFilter = "all" | "active" | "done";

function formatIldVolumeMm3(
  volumeMm3: number,
  hasSegmentation: boolean,
): string {
  if (!hasSegmentation || volumeMm3 <= 0) return "—";
  return formatVolumeMm3(volumeMm3);
}

function shortStudyId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

function isUrgentStudy(s: RecentStudyRow): boolean {
  const t = s.status.toLowerCase();
  return t.includes("urgent") || t.includes("critical") || t.includes("stat");
}

function getPrimaryReviewPath(
  study: RecentStudyRow,
  prefers3D: boolean,
  canOpen3d: boolean,
): string {
  if (prefers3D && canOpen3d) {
    return `/view3d?studyId=${encodeURIComponent(
      study.id,
    )}&patientId=${encodeURIComponent(study.patientId)}`;
  }
  return `/view2d?studyId=${encodeURIComponent(
    study.id,
  )}&patientId=${encodeURIComponent(study.patientId)}`;
}

interface RecentStudiesSectionProps {
  recentStudies: RecentStudyRow[];
  can: (permission: string) => boolean;
  defaultView?: string | null;
  listLoading?: boolean;
  /** Must match the slice used in `useRecentStudies(…, limit, …)` for copy accuracy. */
  worklistLimit?: number;
}

const getPriorityLevel = (
  status: string,
  hasSegmentation: boolean,
): { label: string; color: string; icon: React.ReactNode } => {
  const statusLower = status.toLowerCase();

  if (statusLower.includes("critical") || statusLower.includes("urgent")) {
    return {
      label: "URGENT",
      color: "bg-red-500/10 text-red-600 border-red-500/20",
      icon: <AlertCircle className="h-3 w-3" />,
    };
  }
  if (statusLower.includes("complete") || hasSegmentation) {
    return {
      label: "COMPLETE",
      color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  }
  if (statusLower.includes("processing")) {
    return {
      label: "PROCESSING",
      color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      icon: <Timer className="h-3 w-3" />,
    };
  }
  if (statusLower.includes("pending") || !hasSegmentation) {
    return {
      label: "PENDING",
      color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      icon: <Timer className="h-3 w-3" />,
    };
  }
  return {
    label: "STANDARD",
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    icon: <Calendar className="h-3 w-3" />,
  };
};

const formatAcqDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
};

const getRelativeTime = (dateString: string | null | undefined): string => {
  if (!dateString) return "—";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "—";
  }
};

function applyWorklistFilter(
  list: RecentStudyRow[],
  filter: WorklistFilter,
): RecentStudyRow[] {
  if (filter === "all") return list;
  if (filter === "active") {
    return list.filter((s) => {
      if (isUrgentStudy(s)) return true;
      const t = s.status.toLowerCase();
      return t === "pending" || t === "processing";
    });
  }
  if (filter === "done") {
    return list.filter((s) => s.status.toLowerCase().includes("complete"));
  }
  return list;
}

export function RecentStudiesSection({
  recentStudies,
  can,
  defaultView,
  listLoading,
  worklistLimit = 10,
}: RecentStudiesSectionProps) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<WorklistFilter>("all");

  if (!can("quantitative_metrics") && !can("manage_patients")) {
    return null;
  }

  const prefers3D = defaultView === "3d";
  const canOpen3d = can("explore_3d_xr") || can("view_shared_3d");
  const canManage = can("manage_patients");
  const filteredStudies = applyWorklistFilter(recentStudies, filterStatus);

  const needAttention = recentStudies.filter((s) => {
    const t = s.status.toLowerCase();
    return t === "pending" || t === "processing" || isUrgentStudy(s);
  }).length;

  const worklistSummary = (() => {
    if (listLoading) return "…";
    if (recentStudies.length === 0) return "No recent studies yet.";
    const n = recentStudies.length;
    const need = needAttention;
    if (need > 0) return `${n} recent · ${need} open`;
    return `${n} recent`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Worklist</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{worklistSummary}</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all" as const, label: "All" },
              { id: "active" as const, label: "Open" },
              { id: "done" as const, label: "Done" },
            ] as const
          ).map((opt) => (
            <Button
              key={opt.id}
              variant={filterStatus === opt.id ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(opt.id)}
              className="h-8 shrink-0 text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ild-border bg-ild-card shadow-sm">
        <div className="divide-y divide-ild-border">
          {listLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 p-4 sm:p-5">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 max-w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted/80" />
                </div>
                <div className="hidden h-10 w-24 shrink-0 animate-pulse rounded-md bg-muted sm:block" />
              </div>
            ))
          ) : filteredStudies.length > 0 ? (
            filteredStudies.map((study) => {
              const priority = getPriorityLevel(
                study.status,
                study.hasSegmentation ?? false,
              );
              const timeAgo = getRelativeTime(study.acquisitionDate);
              const acq = formatAcqDate(study.acquisitionDate);
              const whenLabel = acq || timeAgo;
              const primaryPath = canManage
                ? getPrimaryReviewPath(study, prefers3D, canOpen3d)
                : null;

              const onRowActivate = () => {
                if (primaryPath) router.push(primaryPath);
              };

              const onRowKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowActivate();
                }
              };

              return (
                <div
                  key={study.id}
                  className={
                    canManage && primaryPath
                      ? "group flex cursor-pointer flex-col gap-3 p-4 transition-all hover:bg-ild-card-hover focus-within:bg-ild-card-hover sm:flex-row sm:items-center sm:justify-between sm:p-5"
                      : "group flex flex-col gap-3 p-4 transition-all hover:bg-ild-card-hover sm:flex-row sm:items-center sm:justify-between sm:p-5"
                  }
                  onClick={canManage && primaryPath ? onRowActivate : undefined}
                  onKeyDown={
                    canManage && primaryPath ? onRowKeyDown : undefined
                  }
                  role={canManage && primaryPath ? "link" : undefined}
                  tabIndex={canManage && primaryPath ? 0 : undefined}
                  aria-label={
                    canManage && primaryPath
                      ? `Open case ${study.patientName}, primary review`
                      : undefined
                  }
                >
                  <div className="flex min-w-0 w-full flex-1 items-start gap-3 sm:items-center sm:gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-sky-600/10 text-sm font-bold text-sky-600 shadow-sm">
                      {study.patientName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 truncate text-base font-semibold text-foreground">
                          {study.patientName}
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${priority.color}`}
                        >
                          {priority.icon}
                          {priority.label}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          title={study.id}
                        >
                          Study {shortStudyId(study.id)}
                        </span>
                        <span className="text-border">·</span>
                        <span className="uppercase">{study.type}</span>
                        <span className="text-border">·</span>
                        <span
                          className="flex min-w-0 items-center gap-1 tabular-nums"
                          title={study.acquisitionDate ?? undefined}
                        >
                          <Clock className="h-3 w-3 shrink-0" />
                          {whenLabel}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 sm:text-right">
                      <div className="text-xs font-medium text-muted-foreground">ILD vol.</div>
                      <div className="mt-1 text-base font-bold tabular-nums text-foreground sm:text-lg">
                        {formatIldVolumeMm3(
                          study.volumeTotalMm3,
                          study.hasSegmentation ?? false,
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex w-full shrink-0 flex-col gap-2 sm:ml-6 sm:w-auto sm:flex-row"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {canManage && (
                      <>
                        {prefers3D ? (
                          <>
                            {canOpen3d && (
                              <Button
                                asChild
                                size="sm"
                                className="h-9 w-full bg-sky-600 text-white shadow-sm hover:bg-sky-500 sm:w-auto"
                              >
                                <Link
                                  href={getPrimaryReviewPath(
                                    study,
                                    true,
                                    canOpen3d,
                                  )}
                                >
                                  <Box className="mr-2 h-4 w-4" />
                                  Review 3D
                                </Link>
                              </Button>
                            )}
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-9 w-full sm:w-auto"
                            >
                              <Link
                                href={`/view2d?studyId=${encodeURIComponent(
                                  study.id,
                                )}&patientId=${encodeURIComponent(
                                  study.patientId,
                                )}`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View 2D
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              asChild
                              size="sm"
                              className="h-9 w-full bg-sky-600 text-white shadow-sm hover:bg-sky-500 sm:w-auto"
                            >
                              <Link
                                href={getPrimaryReviewPath(
                                  study,
                                  false,
                                  canOpen3d,
                                )}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Review 2D
                              </Link>
                            </Button>
                            {canOpen3d && (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-9 w-full sm:w-auto"
                              >
                                <Link
                                  href={`/view3d?studyId=${encodeURIComponent(
                                    study.id,
                                  )}&patientId=${encodeURIComponent(
                                    study.patientId,
                                  )}`}
                                >
                                  <Box className="mr-2 h-4 w-4" />
                                  View 3D
                                </Link>
                              </Button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/60" aria-hidden />
              <h3 className="mt-3 text-sm font-medium text-foreground">
                {recentStudies.length === 0 ? "Nothing here yet" : "No matches"}
              </h3>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {recentStudies.length === 0
                  ? "Upload or add a case above."
                  : "Change filter or see all studies."}
              </p>
              {recentStudies.length > 0 && (
                <Button
                  variant="link"
                  className="mt-2 h-auto p-0 text-sky-600"
                  onClick={() => setFilterStatus("all")}
                >
                  Show all in list
                </Button>
              )}
            </div>
          )}
        </div>

        {recentStudies.length > 0 && (can("quantitative_metrics") || can("manage_patients")) && (
          <div className="border-t border-ild-border bg-ild-card-hover px-4 py-2.5 text-center text-xs text-muted-foreground">
            {can("quantitative_metrics") ? (
              <Link href="/studies" className="text-sky-600 hover:underline">
                All studies
                <ChevronRight className="ml-0.5 inline h-3 w-3" />
              </Link>
            ) : (
              <Link href="/patients" className="text-sky-600 hover:underline">
                Patients
                <ChevronRight className="ml-0.5 inline h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
