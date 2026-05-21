"use client";

import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddCaseSheet } from "@/components/features/studies/AddCaseSheet";
import type { AddCasePayload } from "@/components/features/studies/AddCaseSheet";
import { usePatients, usePatientMutations } from "@/hooks/patients";
import type { Patient } from "@/api/domain";
import { PatientTable } from "@/components/features/patients/PatientTable";
import { PatientQuickEditor } from "@/components/features/patients/PatientQuickEditor";
import { WorkspaceShell, RegistryOverviewHeading } from "@/components/layout";

export default function PatientsPage() {
  const [addCaseOpen, setAddCaseOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Patient>>({
    id: "",
    name: "",
    dateOfBirth: undefined,
    notes: "",
  });
  const [filter, setFilter] = useState("");

  const { data: patients = [], isLoading, error, refetch } = usePatients();
  const {
    createPatient,
    updatePatient,
    deletePatient,
    isCreating,
    isUpdating,
    isDeleting,
    createError,
    updateError,
    deleteError,
  } = usePatientMutations();

  function resetForm() {
    setForm({ id: "", name: "", dateOfBirth: undefined, notes: "" });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = form.name?.trim();
    if (!trimmedName) return;

    try {
      if (editingId) {
        await updatePatient({
          id: editingId,
          payload: {
            name: trimmedName,
            dateOfBirth: form.dateOfBirth ?? undefined,
            notes: form.notes ?? undefined,
          },
        });
      } else {
        await createPatient({
          name: trimmedName,
          dateOfBirth: form.dateOfBirth ?? undefined,
          notes: form.notes ?? undefined,
        });
      }
      resetForm();
    } catch (err) {
      console.error("Patient save failed:", err);
    }
  }

  function handleEdit(p: Patient) {
    setEditingId(p.id);
    setForm({
      id: p.id,
      name: p.name ?? "",
      dateOfBirth: p.dateOfBirth ?? undefined,
      notes: p.notes ?? undefined,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to remove this patient record?")) return;
    try {
      await deletePatient(id);
      if (editingId === id) resetForm();
      await refetch();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handleAddCaseSubmit(_payload: AddCasePayload) {
    // Patient and study are already persisted by upload-study API; refetch is triggered by useUploadStudy invalidation.
  }

  return (
    <>
      <WorkspaceShell
        activePage="patients"
        title="Patient Registry"
        subtitle="Manage records and clinical studies"
        breadcrumb="Dashboard / Patients"
        mainClassName="flex flex-1 flex-col p-3 sm:p-4 md:p-6"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <RegistryOverviewHeading
              totalLabel="Registered Patients"
              count={patients.length}
              isLoading={isLoading}
            />
            <Button
              onClick={() => setAddCaseOpen(true)}
              className="w-full rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-500 sm:w-auto"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Full Medical Intake
            </Button>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <PatientTable
                patients={patients}
                isLoading={isLoading}
                error={error}
                filter={filter}
                onFilterChange={setFilter}
                onRetry={refetch}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isUpdating={isUpdating}
                isDeleting={isDeleting}
                createError={createError}
                updateError={updateError}
                deleteError={deleteError}
              />
            </div>

            <PatientQuickEditor
              form={form}
              editingId={editingId}
              onChange={setForm}
              onSubmit={handleSubmit}
              onReset={resetForm}
              isCreating={isCreating}
              isUpdating={isUpdating}
            />
          </div>
        </div>
      </WorkspaceShell>
      <AddCaseSheet
        open={addCaseOpen}
        onOpenChange={setAddCaseOpen}
        onSubmit={handleAddCaseSubmit}
      />
    </>
  );
}
