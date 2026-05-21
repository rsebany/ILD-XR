"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  UserPlus,
  Activity,
  Eye,
  Edit2,
  Trash2,
  MoreHorizontal,
  UploadCloud,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UploadListPatient = {
  id: string;
  name: string;
  notes?: string;
};

export type UploadListStudy = {
  id: string;
  patientId: string;
  description: string;
  status?: string;
};

type ListTab = "all" | "patients" | "studies";

type UnifiedRow =
  | {
      type: "patient";
      id: string;
      name: string;
      subId: string;
      typeLabel: string;
      modality: string;
      status: string;
    }
  | {
      type: "study";
      id: string;
      name: string;
      subId: string;
      typeLabel: string;
      modality: string;
      status: string;
    };

const PAGE_SIZE = 10;

export type UploadListProps = {
  patients?: UploadListPatient[];
  studies?: UploadListStudy[];
  pageSize?: number;
};

export function UploadList({
  patients = [],
  studies = [],
  pageSize = PAGE_SIZE,
}: UploadListProps) {
  const [activeTab, setActiveTab] = useState<ListTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const unifiedRows = useMemo((): UnifiedRow[] => {
    const patientRows: UnifiedRow[] = patients.map((p) => ({
      type: "patient",
      id: p.id,
      name: p.name,
      subId: p.id,
      typeLabel: "Patient",
      modality: "—",
      status: "Active",
    }));
    const studyRows: UnifiedRow[] = studies.map((s) => ({
      type: "study",
      id: s.id,
      name: s.description,
      subId: s.id,
      typeLabel: "HRCT",
      modality: "CT",
      status: s.status ?? "Pending",
    }));

    if (activeTab === "patients") return patientRows;
    if (activeTab === "studies") return studyRows;
    return [...patientRows, ...studyRows];
  }, [patients, studies, activeTab]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return unifiedRows;
    const q = search.toLowerCase();
    return unifiedRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.subId.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [unifiedRows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const statusColor = (status: string) => {
    if (status === "Analyzed" || status === "Active" || status === "Confirmed")
      return "text-emerald-400";
    if (status === "Pending" || status === "Not Connected")
      return "text-amber-400";
    return "text-slate-400";
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Tabs */}
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-3 md:flex-row md:items-center md:justify-between">
        <nav className="flex gap-4 sm:gap-6" aria-label="Tabs">
          {(
            [
              { id: "all", label: "All" },
              { id: "patients", label: "Patients" },
              { id: "studies", label: "Studies" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                setPage(1);
              }}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === id
                  ? "border-emerald-500 text-slate-50"
                  : "border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-3 text-sm text-slate-50 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 sm:w-64"
            />
          </div>
          <Link href="/upload-dicom">
            <Button
              variant="outline"
              className="gap-2 border-emerald-600/60 bg-slate-900/80 text-emerald-300 hover:bg-emerald-900/30"
            >
              <UploadCloud className="h-4 w-4" />
              Upload DICOM
            </Button>
          </Link>
          <Link href={activeTab === "studies" ? "/studies" : "/patients"}>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {activeTab === "studies" ? (
                <>
                  <Activity className="h-4 w-4" />
                  Create Study
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Add Patient
                </>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-950/80">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Name / ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Type / Info
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Modality
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {paginatedRows.map((row, idx) => (
                <tr
                  key={`${row.type}-${row.id}`}
                  className={
                    idx === 0 && paginatedRows.length > 0
                      ? "bg-emerald-950/30"
                      : "hover:bg-slate-800/50"
                  }
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 rounded-full border border-slate-700 bg-slate-800">
                        <AvatarFallback className="bg-slate-700 text-xs text-slate-300">
                          {row.type === "patient" ? getInitials(row.name) : "ST"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-slate-50">{row.name}</div>
                        <div className="text-xs text-emerald-400/90">{row.subId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-300">
                    {row.typeLabel}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-400">
                    {row.modality}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={statusColor(row.status)}>{row.status}</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={row.type === "patient" ? "/patients" : "/studies"}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-600/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View
                        </Button>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-slate-400 hover:text-slate-200"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 border-slate-800 bg-slate-900"
                        >
                          <DropdownMenuItem className="text-slate-200 focus:bg-slate-800 focus:text-slate-50">
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-300 focus:bg-rose-950/50 focus:text-rose-200">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRows.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            No entries found. Try changing the tab or search.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            onClick={() => setPage(1)}
            disabled={currentPage <= 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 px-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = currentPage;
              if (totalPages <= 5) p = i + 1;
              else if (currentPage <= 3) p = i + 1;
              else if (currentPage >= totalPages - 2)
                p = totalPages - 4 + i;
              else p = currentPage - 2 + i;
              return (
                <Button
                  key={p}
                  variant={p === currentPage ? "default" : "outline"}
                  size="icon"
                  className={`h-10 w-10 ${
                    p === currentPage
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            onClick={() => setPage(totalPages)}
            disabled={currentPage >= totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Backwards-compatible alias
export const UnifiedList = UploadList;

