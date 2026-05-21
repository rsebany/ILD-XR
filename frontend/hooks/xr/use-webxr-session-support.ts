"use client";

import { useEffect, useState } from "react";

export type WebXrSessionMode = "immersive-vr" | "immersive-ar";

/**
 * Whether this browser/device supports a WebXR immersive session mode.
 */
export function useWebXrSessionSupport(mode: WebXrSessionMode): boolean {
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("xr" in navigator)) {
      setSupported(false);
      return;
    }

    const xr = (
      navigator as Navigator & {
        xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
      }
    ).xr;

    xr?.isSessionSupported?.(mode)
      .then((ok: boolean) => {
        setSupported(ok);
        if (!ok) {
          console.warn(`WebXR ${mode} not supported on this device`);
        }
      })
      .catch(() => {
        setSupported(false);
        console.warn("WebXR API not available");
      });
  }, [mode]);

  return supported;
}
