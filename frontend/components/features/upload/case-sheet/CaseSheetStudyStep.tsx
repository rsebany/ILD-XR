import { Button } from "@/components/ui/button";
import { StudyLabelField } from "@/components/features/upload/StudyLabelField";
import { FileCheck, UploadCloud } from "lucide-react";

import type { StudyStepData } from "@/components/features/studies/AddCaseSheet";

type CaseSheetStudyStepProps = {
  study: StudyStepData;
  hasDicom: boolean;
  setStudy: (value: StudyStepData) => void;
};

export function CaseSheetStudyStep({ study, hasDicom, setStudy }: CaseSheetStudyStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      <StudyLabelField
        id="case-sheet-study-label"
        variant="sheet"
        value={study.description}
        onChange={(description) => setStudy({ ...study, description })}
        placeholder="e.g. Baseline HRCT"
      />

      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider">
          Imaging Modality
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "ct", label: "CT" },
            { key: "hrct", label: "HRCT" },
            { key: "mri", label: "MRI" },
            { key: "xray", label: "X-ray" },
            { key: "other", label: "Other" },
          ].map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={study.modality === m.key ? "default" : "outline"}
              className="rounded-lg text-xs"
              onClick={() => setStudy({ ...study, modality: m.key })}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider">
          Medical Notes
        </label>
        <textarea
          value={study.clinicalNotes}
          onChange={(e) => setStudy({ ...study, clinicalNotes: e.target.value })}
          placeholder="Relevant clinical history..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-background p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider">
          DICOM Acquisition
        </label>
        <div
          className={`relative group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all p-8 text-center
              ${
                hasDicom
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border bg-muted hover:border-sky-500/50 hover:bg-ild-card-hover"
              }
            `}
        >
          {hasDicom ? (
            <>
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                <FileCheck className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-foreground">{study.files!.length} Files Selected</p>
              <button
                type="button"
                onClick={() => setStudy({ ...study, files: null })}
                className="mt-2 text-xs text-muted-foreground hover:text-red-500 underline"
              >
                Clear selection
              </button>
            </>
          ) : (
            <>
              <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground group-hover:text-sky-500 transition-colors" />
              <p className="text-sm font-medium text-foreground">
                Click to upload imaging dataset
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 italic">
                ZIP archives or DICOM folders (no single .dcm files)
              </p>
            </>
          )}
          <input
            type="file"
            multiple
            className="absolute inset-0 cursor-pointer opacity-0"
            // Allow folder selection in supported browsers
            // @ts-expect-error directory upload support
            webkitdirectory=""
            onChange={(e) => {
              const all = e.target.files ? Array.from(e.target.files) : [];

              if (all.length === 0) {
                setStudy({ ...study, files: null });
                return;
              }

              const zipFiles = all.filter((f) => f.name.toLowerCase().endsWith(".zip"));

              if (zipFiles.length > 0) {
                // Prefer ZIP studies when present
                setStudy({ ...study, files: zipFiles });
                return;
              }

              const dicomFiles = all.filter(
                (f) =>
                  f.name.toLowerCase().endsWith(".dcm") ||
                  f.name.toLowerCase().endsWith(".dicom"),
              );

              // Enforce folder/series only: ignore single DICOM file selection
              if (dicomFiles.length <= 1) {
                setStudy({ ...study, files: null });
                return;
              }

              setStudy({ ...study, files: dicomFiles });
            }}
          />
        </div>
      </div>
    </div>
  );
}

