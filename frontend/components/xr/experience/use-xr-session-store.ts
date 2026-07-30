"use client";

import { useEffect, useMemo, useRef } from "react";
import { createXRStore } from "@react-three/xr";
import { preloadXrSessionAssets } from "../preload";
import {
  useWebXrSessionSupport,
  useXrPresenting,
  type WebXrUnsupportedReason,
} from "@/hooks/xr";
import { isMobileArDevice, type XrExperienceMode } from "./types";

export function useXrSessionStore(
  mode: XrExperienceMode,
  opts: {
    studyId: string | null;
    meshUrl: string;
    dicomSlice: number;
    skipHeavyAssets: boolean;
  },
) {
  const sessionMode = mode === "ar" ? "immersive-ar" : "immersive-vr";
  const { supported, isChecking, reason } = useWebXrSessionSupport(sessionMode);
  const shouldOffer = supported && !isChecking;
  const mobileAr = mode === "ar" && isMobileArDevice();

  const store = useMemo(() => {
    // Phone Chrome ARCore is picky about optional feature lists; keep the session lean.
    if (mode === "ar") {
      return createXRStore({
        offerSession: shouldOffer ? "immersive-ar" : false,
        emulate: false,
        handTracking: false,
        bodyTracking: false,
        meshDetection: false,
        layers: false,
        anchors: true,
        hitTest: true,
        planeDetection: true,
        domOverlay: true,
        frameRate: mobileAr ? "mid" : "high",
        frameBufferScaling: mobileAr ? "mid" : undefined,
      });
    }

    return createXRStore({
      offerSession: shouldOffer ? "immersive-vr" : false,
      emulate: false,
    });
  }, [mode, shouldOffer, mobileAr]);

  const isPresenting = useXrPresenting(store);
  const preloadOnSessionRef = useRef(false);

  useEffect(() => {
    return store.subscribe((state, prev) => {
      if (prev.session == null && state.session != null && !preloadOnSessionRef.current) {
        preloadOnSessionRef.current = true;
        void preloadXrSessionAssets({
          studyId: opts.studyId,
          meshUrl: opts.meshUrl,
          dicomSlice: opts.dicomSlice,
          skipHeavyAssets: opts.skipHeavyAssets,
        }).catch((err) => console.warn("XR preload on session start:", err));
      }
      if (state.session == null) preloadOnSessionRef.current = false;
    });
  }, [store, opts.studyId, opts.meshUrl, opts.dicomSlice, opts.skipHeavyAssets]);

  return {
    store,
    isPresenting,
    isImmersiveSupported: supported,
    isCheckingSupport: isChecking,
    unsupportedReason: reason as WebXrUnsupportedReason | null,
  };
}
