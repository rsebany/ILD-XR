"use client";

import { Suspense } from "react";

import { WorkspaceShell } from "@/components/layout";
import { ImagingBackToUploadLink } from "@/components/features/imaging/ImagingBackToUploadLink";
import { ExpertCompare3DPanel } from "@/components/features/upload/ExpertCompare3DPanel";

export default function View3dExpertComparePage() {
  return (
    <WorkspaceShell
      activePage="upload_dicom"
      title="Expert vs AI (3D)"
      subtitle="Dual lung meshes — same class colors as View 3D; run expert compare first"
      breadcrumb="Imaging / Expert vs AI (3D)"
    >
      <ImagingBackToUploadLink />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading 3D viewer…</p>
        }
      >
        <ExpertCompare3DPanel />
      </Suspense>
    </WorkspaceShell>
  );
}
