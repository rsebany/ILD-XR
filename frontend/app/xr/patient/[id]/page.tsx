"use client";

import { redirect } from "next/navigation";

type Params = {
  params: {
    id: string;
  };
};

export default function XRPatientRedirect({ params }: Params) {
  const patientId = params.id;
  redirect(`/webxr?patientId=${encodeURIComponent(patientId)}`);
}

