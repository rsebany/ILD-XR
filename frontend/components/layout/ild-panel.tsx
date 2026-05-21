"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
};

/** Card-style panel using app design tokens (`ild-border`, `ild-card`, `ild-accent`). */
export function IldPanel({ title, icon: Icon, children, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ild-border bg-ild-card p-6",
        className,
      )}
    >
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        <Icon className="h-5 w-5 text-ild-accent" />
        {title}
      </h2>
      {children}
    </div>
  );
}
