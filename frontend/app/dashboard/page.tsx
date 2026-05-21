"use client";

import { useState } from "react";

import { WorkspaceShell } from "@/components/layout";
import { AddCaseSheet } from "@/components/features/studies/AddCaseSheet";
import { DashboardOverview } from "@/components/features/dashboard/DashboardOverview";
import { RecentStudiesSection } from "@/components/features/dashboard/RecentStudiesSection";
import { DashboardEmptyBanner } from "@/components/features/dashboard/DashboardEmptyBanner";
import { usePatients } from "@/hooks/patients";
import { useRecentStudies } from "@/hooks/dashboard";
import { useRole } from "@/hooks/app";
import { useSettings } from "@/hooks/settings";
import { useStudies } from "@/hooks/studies";
import { useDashboardMetrics } from "@/hooks/analytics";

export default function DoctorDashboard() {
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const { can } = useRole();
  const { data: patientsData, isPending: patientsPending } = usePatients();
  const { data: studiesData, isPending: studiesPending } = useStudies();
  const patients = Array.isArray(patientsData) ? patientsData : [];
  const studies = Array.isArray(studiesData) ? studiesData : [];
  const recentStudies = useRecentStudies(patients, 10, studies);
  const { data: settings } = useSettings();
  const { data: dashboardMetrics, isPending: metricsPending } =
    useDashboardMetrics();

  const listsLoading = patientsPending || studiesPending;
  const workspaceEmpty =
    !listsLoading && patients.length === 0 && studies.length === 0;

  const kpiSkeletonCount =
    (can("manage_patients") ? 1 : 0) + (can("quantitative_metrics") ? 3 : 0);

  const kpiLoading =
    kpiSkeletonCount > 0 &&
    (listsLoading || (metricsPending && dashboardMetrics === undefined));

  return (
    <>
      <WorkspaceShell
        activePage="dashboard"
        title="Dashboard"
        subtitle="ILD review"
        breadcrumb="Dashboard"
      >
        {workspaceEmpty && (
          <DashboardEmptyBanner
            canUpload={can("upload_hrct") && can("trigger_ai")}
            canManagePatients={can("manage_patients")}
          />
        )}
        <DashboardOverview
          can={can}
          patientsCount={patients.length}
          studiesCount={dashboardMetrics?.studies_count ?? studies.length}
          dashboardMetrics={dashboardMetrics}
          onStartAnalysis={() => setAddCaseOpen(true)}
          kpiLoading={kpiLoading}
          kpiSkeletonCount={kpiSkeletonCount}
          workflowChartLoading={listsLoading}
          workspaceEmpty={workspaceEmpty}
        />
        <RecentStudiesSection
          recentStudies={recentStudies}
          can={can}
          defaultView={settings?.default_view}
          listLoading={listsLoading}
          worklistLimit={10}
        />
      </WorkspaceShell>
      <AddCaseSheet open={addCaseOpen} onOpenChange={setAddCaseOpen} />
    </>
  );
}
