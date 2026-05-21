import { Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SegmentationResultDTO } from "@/api/types";
import { ThreeViewer } from "@/components/features/viewer/component/xr/viewers/ThreeViewer";
import { getApiBaseUrl } from "@/api/http/client";
import { formatVolumeMm3Number } from "@/lib/metrics/format-volume-mm3";

type UploadXrPreviewSectionProps = {
  segmentation: SegmentationResultDTO | null;
  xrLoading: boolean;
  onOpenWebXR: () => void;
};

export function UploadXrPreviewSection({
  segmentation,
  xrLoading,
  onOpenWebXR,
}: UploadXrPreviewSectionProps) {
  const meshPath = segmentation?.xr_view?.mesh_url ?? "";
  const meshUrl =
    meshPath && !(meshPath.startsWith("http://") || meshPath.startsWith("https://"))
      ? `${getApiBaseUrl()}${meshPath}`
      : meshPath;

  return (
    <aside className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-tighter">
            Spatial Reconstruction
          </h2>
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        </div>

        <div className="relative flex-1 bg-[#05070a]">
          {!segmentation ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-6 flex h-40 w-40 items-center justify-center rounded-full border border-primary/10 bg-primary/5">
                <Box className="h-12 w-12 text-primary/20" />
              </div>
              <h3 className="text-sm font-bold text-white">No Active Model</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Reconstruction will appear here once the 3D U-Net segmentation is
                complete.
              </p>
            </div>
          ) : !meshUrl ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-6 flex h-40 w-40 items-center justify-center rounded-full border border-primary/10 bg-primary/5">
                <Box className="h-12 w-12 text-primary/20" />
              </div>
              <h3 className="text-sm font-bold text-white">No 3D Mesh Generated</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                No ILD regions were detected, so a 3D mesh was not generated. You
                can still review quantitative metrics and 2D slices.
              </p>
            </div>
          ) : (
            <div className="h-full">
              <ThreeViewer meshUrl={meshUrl} />

              <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur-md">
                  <p className="text-[9px] font-bold uppercase text-sky-400">
                    Total ILD Volume
                  </p>
                  <p className="text-lg font-black text-white">
                    {formatVolumeMm3Number(segmentation.total_ild_volume_ml * 1000)}{" "}
                    <span className="text-[10px] font-normal text-slate-400">mm³</span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur-md">
                  <p className="text-[9px] font-bold uppercase text-blue-400">
                    Lower zone
                  </p>
                  <p className="text-lg font-black text-white">
                    {(segmentation.zonal_distribution?.Lower ?? 0).toFixed(1)}
                    <span className="text-[10px] font-normal text-slate-400">
                      %
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur-md">
                  <p className="text-[9px] font-bold uppercase text-emerald-400">
                    Upper zone
                  </p>
                  <p className="text-lg font-black text-white">
                    {(segmentation.zonal_distribution?.Upper ?? 0).toFixed(1)}
                    <span className="text-[10px] font-normal text-slate-400">
                      %
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button
            disabled={!segmentation || xrLoading}
            onClick={onOpenWebXR}
            className="group h-12 w-full rounded-xl bg-white font-black text-black transition-all hover:bg-slate-100"
          >
            {xrLoading ? "INITIALIZING..." : "ENTER IMMERSIVE XR"}
            <Box className="ml-2 h-4 w-4 transition-transform group-hover:rotate-12" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

