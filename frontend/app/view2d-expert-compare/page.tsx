"use client";

import { Suspense } from "react";

import { WorkspaceShell } from "@/components/layout";
import { ImagingBackToUploadLink } from "@/components/features/imaging/ImagingBackToUploadLink";
import { ExpertCompare2DPanel } from "@/components/features/upload/ExpertCompare2DPanel";

export default function View2dExpertComparePage() {
  return (
    <WorkspaceShell
      activePage="upload_dicom"
      title="Expert vs AI (2D)"
      subtitle="Axial CT with masks — same windowing as View 2D"
      breadcrumb="Imaging / Expert vs AI"
    >
      <ImagingBackToUploadLink />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading viewer…</p>
        }
      >
        <ExpertCompare2DPanel />
      </Suspense>
    </WorkspaceShell>
  );
}
