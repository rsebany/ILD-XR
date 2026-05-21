"use client";

import { WorkspaceShell } from "@/components/layout";
import { ImagingBackToUploadLink } from "@/components/features/imaging/ImagingBackToUploadLink";
import { View3DReconstructionPanel } from "@/components/features/viewer/View3DReconstructionPanel";

export default function View3DPage() {
  return (
    <WorkspaceShell
      activePage="upload_dicom"
      title="View 3D"
      subtitle="3D CT stack; optional AI mesh after analysis — View 2D for slices, metrics on the right"
      breadcrumb="Imaging / View 3D"
    >
      <ImagingBackToUploadLink />
      <View3DReconstructionPanel />
    </WorkspaceShell>
  );
}
