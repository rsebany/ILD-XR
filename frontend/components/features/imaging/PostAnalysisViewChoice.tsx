"use client";

import Link from "next/link";
import { Box, Glasses, Layers, CheckCircle2 } from "lucide-react";

import { imagingContextQuery } from "@/lib/imaging";

type PostAnalysisViewChoiceProps = {
  patientId: string;
  studyId: string;
  /** Same mesh string as the XR lab `mesh` query (typically absolute URL) */
  meshPath: string;
  title?: string;
};

function webxrHref(patientId: string, studyId: string, meshPath: string): string {
  const sp = new URLSearchParams();
  sp.set("mesh", meshPath);
  sp.set("dicom", "1");
  sp.set("studyId", studyId);
  sp.set("patientId", patientId);
  return `/webxr?${sp.toString()}`;
}

const cardClass =
  "group flex flex-col items-start gap-2 rounded-xl border border-border/80 bg-card/80 p-4 text-left transition-all hover:border-cyan-500/40 hover:bg-cyan-500/[0.06] hover:shadow-md";

export function PostAnalysisViewChoice({
  patientId,
  studyId,
  meshPath,
  title = "AI ready",
}: PostAnalysisViewChoiceProps) {
  const ctx = imagingContextQuery({ patientId, studyId });
  const webxr = webxrHref(patientId, studyId, meshPath);

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.08] to-background/50 p-5 shadow-lg sm:p-6"
      role="region"
      aria-label="Choose a viewer"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            2D, 3D, or WebXR — same case.
          </p>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li>
          <Link href={`/view2d${ctx}`} className={cardClass}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-500">
              <Layers className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-foreground">View 2D</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Slices + AI overlay
            </span>
          </Link>
        </li>
        <li>
          <Link href={`/view3d${ctx}`} className={cardClass}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-500">
              <Box className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-foreground">View 3D</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              3D ILD mesh
            </span>
          </Link>
        </li>
        <li>
          <Link href={webxr} className={cardClass} target="_blank" rel="noopener noreferrer">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-400">
              <Glasses className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-foreground">WebXR</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Immersive lab
            </span>
            <span className="text-[10px] font-medium text-muted-foreground/80">New tab</span>
          </Link>
        </li>
      </ul>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        <Link href="/upload-dicom" className="font-medium text-primary hover:underline">
          Another upload
        </Link>
      </p>
    </div>
  );
}
