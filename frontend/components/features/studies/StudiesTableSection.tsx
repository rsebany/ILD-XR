import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Box,
  Calendar,
  Database,
  FileDown,
  Glasses,
  Layers,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading";
import { StudyStatusBadge } from "@/components/features/studies/StudyStatusBadge";
import { StudyIldBar } from "@/components/features/studies/StudyIldBar";
import { getStudyReportPdf } from "@/api/clients";

type StudyStatus = "Processing" | "Pending" | "Completed";

type Study = {
  study_id: string;
  study_instance_uid?: string;
  patient_id: string;
  patient_name: string;
  acquisition_date?: string | null;
  status: StudyStatus;
  volume_total_mm3: number;
};

interface StudiesTableSectionProps {
  studies: Study[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onDeleteStudy?: (studyId: string) => Promise<void>;
  isDeletingStudy?: boolean;
  defaultView?: "2d" | "3d";
}

export function StudiesTableSection({
  studies,
  isLoading,
  isError,
  error,
  onDeleteStudy,
  isDeletingStudy = false,
  defaultView,
}: StudiesTableSectionProps) {
  const [downloadingReportStudyId, setDownloadingReportStudyId] = useState<
    string | null
  >(null);
  const [deletingStudyId, setDeletingStudyId] = useState<string | null>(null);

  const handleDownloadReport = async (studyId: string) => {
    try {
      setDownloadingReportStudyId(studyId);
      const blob = await getStudyReportPdf(studyId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `study_${studyId}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to download PDF report.";
      window.alert(message);
    } finally {
      setDownloadingReportStudyId(null);
    }
  };

  const handleDeleteStudy = async (studyId: string) => {
    if (!onDeleteStudy) return;
    const ok = window.confirm(
      "Delete this study? This will remove analysis outputs and stored study files.",
    );
    if (!ok) return;
    try {
      setDeletingStudyId(studyId);
      await onDeleteStudy(studyId);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to delete study.";
      window.alert(message);
    } finally {
      setDeletingStudyId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-ild-border bg-ild-card shadow-xl">
      <div className="flex flex-col gap-2 border-b border-ild-border bg-ild-card-hover px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-sky-500" />
          <span className="text-sm font-medium text-foreground">
            Imaging Archive
          </span>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Study UID..."
            className="h-10 w-full rounded-lg border border-border bg-background px-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-500 focus:outline-none sm:w-auto"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <LoadingState
            label="Loading studies..."
            className="py-16"
            iconClassName="h-5 w-5"
          />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <p className="text-sm">Failed to load studies.</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        ) : (
          <table className="min-w-[920px] w-full border-collapse text-left">
            <thead className="bg-ild-card-hover text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">Study Details</th>
                <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">AI Status</th>
                <th className="px-3 py-3 font-semibold sm:px-6 sm:py-4">ILD Volume</th>
                <th className="px-3 py-3 font-semibold text-right sm:px-6 sm:py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ild-border">
              {studies.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-sm text-muted-foreground sm:px-6 sm:py-12"
                  >
                    No studies yet. Upload DICOM via Patient Registry or Add
                    Case.
                  </td>
                </tr>
              ) : (
                studies.map((study) => (
                  <tr
                    key={study.study_id}
                    className="group transition-colors hover:bg-ild-card-hover"
                  >
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {study.patient_name}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono text-sky-500">
                            {study.study_id}
                          </span>
                          <span>•</span>
                          <Calendar className="h-3 w-3" />
                          <span>{study.acquisition_date || "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <StudyStatusBadge status={study.status} />
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <StudyIldBar
                        volumeTotalMm3={study.volume_total_mm3}
                        isCompleted={study.status === "Completed"}
                      />
                    </td>
                    <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                      <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 gap-2 rounded-lg border border-ild-border text-xs text-foreground hover:bg-ild-card-hover"
                          disabled={
                            study.status !== "Completed" ||
                            downloadingReportStudyId === study.study_id
                          }
                          onClick={() => handleDownloadReport(study.study_id)}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          {downloadingReportStudyId === study.study_id
                            ? "Downloading..."
                            : "Report PDF"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 gap-2 rounded-lg border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          onClick={() => handleDeleteStudy(study.study_id)}
                          disabled={
                            !onDeleteStudy ||
                            isDeletingStudy ||
                            deletingStudyId === study.study_id
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingStudyId === study.study_id
                            ? "Deleting..."
                            : "Delete"}
                        </Button>

                        {defaultView === "3d" ? (
                          <>
                            <Link
                              href={`/view3d?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                size="sm"
                                className="h-10 gap-2 rounded-lg bg-sky-600 text-xs font-bold hover:bg-sky-500"
                                disabled={study.status !== "Completed"}
                              >
                                <Box className="h-3.5 w-3.5" />
                                View 3D
                              </Button>
                            </Link>
                            <Link
                              href={`/webxr?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-2 rounded-lg border-border text-xs hover:bg-ild-card-hover"
                                disabled={study.status !== "Completed"}
                              >
                                <Glasses className="h-3.5 w-3.5" />
                                WebXR
                              </Button>
                            </Link>
                            <Link
                              href={`/view2d?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-2 rounded-lg border-border text-xs hover:bg-ild-card-hover"
                                disabled={study.status !== "Completed"}
                              >
                                <Layers className="h-3.5 w-3.5" />
                                2D View
                              </Button>
                            </Link>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/view2d?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-2 rounded-lg border-border text-xs hover:bg-ild-card-hover"
                                disabled={study.status !== "Completed"}
                              >
                                <Layers className="h-3.5 w-3.5" />
                                2D View
                              </Button>
                            </Link>
                            <Link
                              href={`/view3d?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-10 gap-2 rounded-lg border-border text-xs hover:bg-ild-card-hover"
                                disabled={study.status !== "Completed"}
                              >
                                <Box className="h-3.5 w-3.5" />
                                View 3D
                              </Button>
                            </Link>
                            <Link
                              href={`/webxr?studyId=${study.study_id}&patientId=${study.patient_id}`}
                            >
                              <Button
                                size="sm"
                                className="h-10 gap-2 rounded-lg bg-sky-600 text-xs font-bold hover:bg-sky-500"
                                disabled={study.status !== "Completed"}
                              >
                                <Glasses className="h-3.5 w-3.5" />
                                WebXR
                              </Button>
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

