"use client";

import { useCallback, useState } from "react";
import type { XRStore } from "@react-three/xr";
import { preloadXrSessionAssets } from "../preload";
import {
  webXrUnsupportedMessage,
  type WebXrUnsupportedReason,
} from "@/hooks/xr";
import type { XrExperienceMode } from "./types";

type Args = {
  mode: XrExperienceMode;
  store: XRStore;
  isImmersiveSupported: boolean;
  isCheckingSupport: boolean;
  unsupportedReason?: WebXrUnsupportedReason | null;
  studyId: string | null;
  effectiveMeshUrl: string;
  currentDicomSlice: number;
  onVrSpawn: () => void;
};

export function useImmersiveEntry({
  mode,
  store,
  isImmersiveSupported,
  isCheckingSupport,
  unsupportedReason = null,
  studyId,
  effectiveMeshUrl,
  currentDicomSlice,
  onVrSpawn,
}: Args) {
  const [xrError, setXrError] = useState<string | null>(null);
  const [preparingImmersive, setPreparingImmersive] = useState(false);

  const runEnterImmersive = useCallback(async () => {
    try {
      setXrError(null);
      if (isCheckingSupport) {
        setXrError("Checking XR support… please try again in a moment.");
        return;
      }
      if (!isImmersiveSupported) {
        setXrError(webXrUnsupportedMessage(mode, unsupportedReason));
        return;
      }

      if (mode === "ar") {
        await store.enterAR();
        return;
      }

      setPreparingImmersive(true);
      try {
        await preloadXrSessionAssets({
          studyId,
          meshUrl: effectiveMeshUrl,
          dicomSlice: currentDicomSlice,
          skipHeavyAssets: false,
        });
      } catch (preloadErr) {
        console.warn("XR preload incomplete:", preloadErr);
      } finally {
        setPreparingImmersive(false);
      }
      onVrSpawn();
      await store.enterVR();
    } catch (err) {
      const label = mode === "ar" ? "AR" : "VR";
      let message = err instanceof Error ? err.message : `Failed to enter ${label}`;
      console.error("XR Error:", err);
      if (
        message.includes("NotSupportedError") ||
        message.includes("XRSession") ||
        message.includes("XRWebGLBinding") ||
        message.includes("not supported")
      ) {
        message =
          mode === "ar"
            ? "AR session failed. Ensure ARCore is enabled, camera permission is granted, and you are using Android Chrome over HTTPS."
            : "No VR headset detected. Connect a compatible WebXR device or use the desktop 3D view.";
      }
      if (message.includes("NotAllowedError") || message.includes("permission")) {
        message = "Camera or XR permission denied. Allow access in your browser settings and try again.";
      }
      if (message.includes("secure") || unsupportedReason === "insecure-context") {
        message = webXrUnsupportedMessage(mode, "insecure-context");
      }
      setXrError(message);
    }
  }, [
    mode,
    store,
    isImmersiveSupported,
    isCheckingSupport,
    unsupportedReason,
    studyId,
    effectiveMeshUrl,
    currentDicomSlice,
    onVrSpawn,
  ]);

  const handleEnterImmersive = useCallback(
    async (onBalancedFocus: () => void) => {
      onBalancedFocus();
      if (mode === "vr") onVrSpawn();
      await runEnterImmersive();
    },
    [mode, onVrSpawn, runEnterImmersive],
  );

  const handleExitImmersive = useCallback(() => {
    void store.getState().session?.end();
  }, [store]);

  return { xrError, preparingImmersive, handleEnterImmersive, handleExitImmersive };
}
