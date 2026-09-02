"use client";

import { useEffect, useState } from "react";

export type WebXrSessionMode = "immersive-vr" | "immersive-ar";

export type WebXrUnsupportedReason =
  | "ssr"
  | "no-webxr"
  | "insecure-context"
  | "ios-safari"
  | "unsupported";

export type WebXrSessionSupport = {
  supported: boolean;
  isChecking: boolean;
  reason: WebXrUnsupportedReason | null;
};

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hasSecureWebXRContext(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.isSecureContext || isLocalhost(window.location.hostname);
}

function isIosSafariLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  return true;
}

function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Whether this browser/device supports a WebXR immersive session mode.
 *
 * On Android with WebXR available, we optimistically report supported=true
 * even when isSessionSupported() returns false — that API is unreliable on
 * many ARCore devices. The real gate is the browser's session request.
 */
export function useWebXrSessionSupport(mode: WebXrSessionMode): WebXrSessionSupport {
  const [state, setState] = useState<WebXrSessionSupport>({
    supported: false,
    isChecking: true,
    reason: null,
  });

  useEffect(() => {
    setState({ supported: false, isChecking: true, reason: null });

    if (typeof navigator === "undefined") {
      setState({ supported: false, isChecking: false, reason: "ssr" });
      return;
    }

    if (!("xr" in navigator)) {
      setState({
        supported: false,
        isChecking: false,
        reason: isIosSafariLike() ? "ios-safari" : "no-webxr",
      });
      return;
    }

    if (!hasSecureWebXRContext()) {
      setState({ supported: false, isChecking: false, reason: "insecure-context" });
      return;
    }

    const xr = (
      navigator as Navigator & {
        xr?: { isSessionSupported?: (m: string) => Promise<boolean> };
      }
    ).xr;

    xr?.isSessionSupported
      ?.call(xr, mode)
      .then((ok: boolean) => {
        if (ok) {
          setState({ supported: true, isChecking: false, reason: null });
          return;
        }
        if (mode === "immersive-ar" && isAndroidDevice()) {
          console.warn(`WebXR ${mode} isSessionSupported=false on Android — optimistically allowing enter`);
          setState({ supported: true, isChecking: false, reason: null });
          return;
        }
        setState({
          supported: false,
          isChecking: false,
          reason: mode === "immersive-ar" && isIosSafariLike() ? "ios-safari" : "unsupported",
        });
        console.warn(`WebXR ${mode} not supported on this device`);
      })
      .catch(() => {
        if (mode === "immersive-ar" && isAndroidDevice()) {
          console.warn(`WebXR ${mode} API threw on Android — optimistically allowing enter`);
          setState({ supported: true, isChecking: false, reason: null });
          return;
        }
        setState({
          supported: false,
          isChecking: false,
          reason: isIosSafariLike() ? "ios-safari" : "no-webxr",
        });
        console.warn("WebXR API not available");
      });
  }, [mode]);

  return state;
}

export function webXrUnsupportedMessage(
  mode: "ar" | "vr",
  reason: WebXrUnsupportedReason | null,
): string {
  if (mode === "ar") {
    switch (reason) {
      case "insecure-context":
        return "AR needs HTTPS on phones. Run npm run dev:phone and open https://<PC-IP>:3443/webxr in Android Chrome (or use an ngrok HTTPS URL).";
      case "ios-safari":
        return "iPhone/iPad Safari does not support WebXR AR. Use an ARCore Android phone with Chrome over HTTPS.";
      case "no-webxr":
        return "This browser has no WebXR. Use Android Chrome on an ARCore phone over HTTPS.";
      default:
        return "AR is not available on this browser. Open on an AR-capable Android Chrome device over HTTPS, or switch to VR.";
    }
  }

  switch (reason) {
    case "insecure-context":
      return "VR needs a secure context (HTTPS or localhost).";
    default:
      return "VR is not available on this browser. Use a compatible WebXR headset or open the desktop 3D view.";
  }
}
