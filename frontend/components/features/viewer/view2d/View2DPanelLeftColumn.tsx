import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { View2DLeftPanel } from "@/components/features/viewer/view2d/View2DLeftPanel";

type Props = {
  files: File[] | null;
  dicomLoadStatus: "idle" | "loading" | "loaded" | "failed";
  dicomLoadError: string | null;
  hasDicomInDb: boolean;
  hasVolume: boolean;
  patientName?: string | null;
  studyLine?: string | null;
  windowPreset: "lung_ai" | "bone" | "mediastinum" | "soft_tissue";
  orientation: "axial" | "coronal" | "sagittal";
  onFolderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWindowPresetChange: (
    key: string,
    center: number,
    width: number,
  ) => void;
  onOrientationChange: (orientation: "axial" | "coronal" | "sagittal") => void;
  onResetSliceIndex: () => void;
};

export function View2DPanelLeftColumn({
  files,
  dicomLoadStatus,
  dicomLoadError,
  hasDicomInDb,
  hasVolume,
  patientName,
  studyLine,
  windowPreset,
  orientation,
  onFolderChange,
  onWindowPresetChange,
  onOrientationChange,
  onResetSliceIndex,
}: Props) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  return (
    <div className="flex items-stretch shrink-0 mr-2">
      {leftPanelOpen ? (
        <>
          <div className="flex w-[13.5rem] min-w-[13.5rem] max-w-[13.5rem] flex-col overflow-hidden sm:w-[14.5rem] sm:min-w-[14.5rem] sm:max-w-[14.5rem]">
            <View2DLeftPanel
              files={files}
              dicomLoadStatus={dicomLoadStatus}
              dicomLoadError={dicomLoadError}
              hasDicomInDb={hasDicomInDb}
              hasVolume={hasVolume}
              patientName={patientName}
              studyLine={studyLine}
              windowPreset={windowPreset}
              orientation={orientation}
              onFolderChange={onFolderChange}
              onWindowPresetChange={onWindowPresetChange}
              onOrientationChange={onOrientationChange}
              onResetSliceIndex={onResetSliceIndex}
            />
          </div>
          <button
            type="button"
            onClick={() => setLeftPanelOpen(false)}
            className="flex flex-col items-center justify-center w-8 shrink-0 rounded-r-lg border border-l-0 border-ild-border bg-ild-card hover:bg-ild-card-hover text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close patient DICOM stack panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setLeftPanelOpen(true)}
          className="flex flex-col items-center justify-center w-8 shrink-0 rounded-r-xl border border-ild-border bg-ild-card hover:bg-ild-card-hover text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Open patient DICOM stack panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

