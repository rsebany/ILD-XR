"use client";

import { useDeleteStudy, useStudies } from "@/hooks/studies";
import { useSettings } from "@/hooks/settings";
import { WorkspaceShell, RegistryOverviewHeading } from "@/components/layout";
import { StudiesTableSection } from "@/components/features/studies/StudiesTableSection";

export default function StudiesPage() {
  const { data: studies = [], isLoading, isError, error } = useStudies();
  const deleteStudyMutation = useDeleteStudy();

  const { data: settings } = useSettings();

  return (
    <WorkspaceShell
      activePage="studies"
      title="Study Browser"
      subtitle="Review AI-processed imaging and quantitative reports"
      breadcrumb="Dashboard / Studies"
      mainClassName="flex flex-1 flex-col p-3 sm:p-4 md:p-6"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
        <RegistryOverviewHeading
          totalLabel="Registered Studies"
          count={studies.length}
          isLoading={isLoading}
        />

        <StudiesTableSection
          studies={studies}
          isLoading={isLoading}
          isError={isError}
          error={error}
          onDeleteStudy={(studyId) => deleteStudyMutation.mutateAsync(studyId)}
          isDeletingStudy={deleteStudyMutation.isPending}
          defaultView={
            settings?.default_view === "3d"
              ? "3d"
              : settings?.default_view === "2d"
                ? "2d"
                : undefined
          }
        />
      </div>
    </WorkspaceShell>
  );
}
