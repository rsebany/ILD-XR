/**
 * Admin dashboard — system status, user directory, CLI for passwords (admin role only).
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AdminDashboard } from "@/components/features/admin";
import { WorkspaceShell } from "@/components/layout";
import { useRole } from "@/hooks/app";

export default function AdminPage() {
  const { isAdmin, can } = useRole();
  const router = useRouter();
  const canManageUsers = can("user_management");

  useEffect(() => {
    if (!isAdmin && !canManageUsers) {
      router.replace("/dashboard");
    }
  }, [isAdmin, canManageUsers, router]);

  if (!isAdmin && !canManageUsers) {
    return null;
  }

  return (
    <WorkspaceShell
      activePage="dashboard"
      title="System Administration"
      breadcrumb="Dashboard / Admin"
    >
      <AdminDashboard />
    </WorkspaceShell>
  );
}
