"use client";

import { Toaster } from "sonner";

import { useTheme } from "@/components/theme-provider";

/**
 * Global toast host — place once under {@link ThemeProvider}.
 */
export function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      theme={theme}
      richColors
      closeButton
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            "border border-ild-border bg-ild-card text-foreground shadow-lg",
        },
      }}
    />
  );
}
