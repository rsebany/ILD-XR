"use client";

import Link from "next/link";
import { Glasses } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  studyId: string;
  patientId?: string | null;
  /** `webxr` uses `/webxr`; set false for routes that use `/xr`. */
  webxrPath?: "webxr" | "xr";
};

/** Primary extra pipeline entry from the metrics sidebar — immersive XR lab. */
export function ViewerPipelineLinks({
  studyId,
  patientId,
  webxrPath = "webxr",
}: Props) {
  const qs = new URLSearchParams({ studyId });
  if (patientId) qs.set("patientId", patientId);
  const q = qs.toString();

  return (
    <Link href={`/${webxrPath}?${q}`} className="block">
      <Button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 text-sm font-bold text-white shadow-lg shadow-sky-500/30 transition-all duration-300 hover:from-sky-500 hover:to-cyan-500 hover:shadow-sky-500/50">
        <Glasses className="h-5 w-5" />
        Open WebXR lab
      </Button>
    </Link>
  );
}
