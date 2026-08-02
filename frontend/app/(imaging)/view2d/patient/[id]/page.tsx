/**
 * Legacy redirect — `/view2d/patient/:id` → `/view2d?patientId=…`
 */
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function View2DPatientRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/view2d?patientId=${encodeURIComponent(id)}`);
}
