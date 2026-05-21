"use client";

import { WorkspaceShell } from "@/components/layout";
import { View2DPanel } from "@/components/features/viewer/View2DPanel";
import { ImagingBackToUploadLink } from "@/components/features/imaging/ImagingBackToUploadLink";

export default function View2DPage() {
  return (
    <WorkspaceShell
      activePage="upload_dicom"
      title="View 2D"
      subtitle="Slice-based review with AI segmentation overlay"
      breadcrumb="Imaging / View 2D"
    >
      <ImagingBackToUploadLink />
      <View2DPanel />
    </WorkspaceShell>
  );
}
