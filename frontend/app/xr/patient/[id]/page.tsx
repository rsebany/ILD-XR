/**
 * Legacy redirect — `/xr/patient/:id` → `/webxr?patientId=…`
 */
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function XRPatientRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/webxr?patientId=${encodeURIComponent(id)}`);
}
