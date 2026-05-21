"use client";

import { useWebXrSessionSupport } from "./use-webxr-session-support";

/** WebXR immersive VR session support (headsets). */
export function useWebXrSupport(): boolean {
  return useWebXrSessionSupport("immersive-vr");
}
