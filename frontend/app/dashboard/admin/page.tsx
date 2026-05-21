"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Users } from "lucide-react";
import { useRole } from "@/hooks/app";
import { WorkspaceShell, IldPanel } from "@/components/layout";

export default function AdminPage() {
  const { isAdmin } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <WorkspaceShell
      activePage="dashboard"
      title="System Administration"
      subtitle="Maintenance and user management"
      breadcrumb="Dashboard / Admin"
    >
      <div className="max-w-3xl space-y-6">
        <IldPanel title="System Maintenance" icon={Wrench}>
          <p className="text-sm text-muted-foreground">
            Perform system maintenance tasks. User management logs will be available here.
          </p>
        </IldPanel>
        <IldPanel title="User Management" icon={Users}>
          <p className="text-sm text-muted-foreground">
            View and manage user accounts. Audit logs for system access.
          </p>
        </IldPanel>
      </div>
    </WorkspaceShell>
  );
}
