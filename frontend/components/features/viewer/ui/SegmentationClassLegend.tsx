"use client";

import React from "react";

type SegmentationClassLegendProps = {
  compact?: boolean;
  className?: string;
  palette?: "overlay2d" | "mesh3d";
};

const CLASS_ITEMS = [
  { label: "Lung Boundary", color: "bg-[#00C8C8]" },
  { label: "Emphysema", color: "bg-[#2B77FF]" },
  { label: "Fibrosis", color: "bg-[#FF8C00]" },
  { label: "Ground Glass", color: "bg-[#66CC66]" },
  { label: "Micronodules", color: "bg-[#DD44DD]" },
  { label: "Consolidation", color: "bg-[#FFE640]" },
] as const;

export function SegmentationClassLegend({
  compact = false,
  className = "",
  palette = "overlay2d",
}: SegmentationClassLegendProps) {
  const title = palette === "mesh3d" ? "3D Mesh Class Colors" : "2D Overlay Class Colors";
  return (
    <div
      className={`rounded-xl border border-border/70 bg-card/90 px-3 py-2 backdrop-blur ${className}`}
      aria-label="Segmentation class legend"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className={`flex ${compact ? "gap-2" : "gap-3"} flex-wrap`}>
        {CLASS_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1">
            <span className={`h-3 w-3 rounded-sm border border-black/20 ${item.color}`} />
            <span className="text-[11px] font-medium text-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
