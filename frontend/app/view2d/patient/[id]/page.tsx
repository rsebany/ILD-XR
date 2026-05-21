"use client";

import { redirect } from "next/navigation";

type Params = {
  params: {
    id: string;
  };
};

export default function View2DPatientRedirect({ params }: Params) {
  const patientId = params.id;
  redirect(`/view2d?patientId=${encodeURIComponent(patientId)}`);
}

