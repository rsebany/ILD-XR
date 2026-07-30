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

      if (mode === "vr") {
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
        return;
      }
      await store.enterAR();
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
            ? "AR session failed on this phone/browser. Use Android Chrome over HTTPS on an ARCore device (camera permission allowed), or switch to VR."
            : "No VR headset detected. Please connect a compatible WebXR device (e.g., Meta Quest, HTC Vive) or use desktop 3D view.";
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
