"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Billboard, Html, Text } from "@react-three/drei";
import { Interactive, useXR } from "@react-three/xr";
import * as THREE from "three";
import { getApiBaseUrl } from "@/api/http/client";
import {
  SCENE_ROT_STEP_RAD,
  type SceneEulerRotation,
  stepRotationY,
  ZERO_ROTATION,
} from "@/lib/xr/scene-rotation";
import { ImmersiveButton } from "./xr-immersive-ui";

const DRAG_STEP_PX = 24;
const STACK_FOCUS_OPACITY = 0.95;
const STACK_PLANE_SIZE = 1.42;
const TEXTURE_CACHE_LIMIT = 24;

export function DicomSliceViewer({
  studyId,
  maxSlices,
  currentSlice,
  onSliceChange,
  isPlaying,
  onTogglePlay,
  onPausePlayback,
  anchorPosition,
  layoutPosition,
  sceneVariant = "vr",
}: {
  studyId: string;
  maxSlices: number;
  currentSlice: number;
  onSliceChange: (slice: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPausePlayback: () => void;
  anchorPosition?: [number, number, number];
  /** Fixed layout offset (side-by-side with mesh); used when not following AR anchor. */
  layoutPosition?: [number, number, number];
  sceneVariant?: "vr" | "ar";
}) {
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<[number, number, number]>(
    () => layoutPosition ?? [0, 1.2, 0],
  );
  const [planeRotation, setPlaneRotation] = useState<SceneEulerRotation>(ZERO_ROTATION);
  const currentSliceRef = useRef<number>(currentSlice);
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
  } | null>(null);
  const xr = useXR();
  const isPresenting = Boolean(xr.session);
  const isVrImmersive = isPresenting && sceneVariant === "vr";
  const useHtmlControls = !isVrImmersive;
  const loaderRef = useRef<THREE.TextureLoader | null>(null);
  const textureCacheRef = useRef(new Map<number, THREE.Texture>());
  const pendingLoadsRef = useRef(new Map<number, Promise<THREE.Texture>>());
  const latestRequestRef = useRef(0);

  useEffect(() => {
    currentSliceRef.current = currentSlice;
  }, [currentSlice]);

  const touchTextureLru = useCallback((slice: number) => {
    const cache = textureCacheRef.current;
    const cached = cache.get(slice);
    if (!cached) return;
    cache.delete(slice);
    cache.set(slice, cached);
  }, []);

  const evictTextureCache = useCallback(() => {
    const cache = textureCacheRef.current;
    while (cache.size > TEXTURE_CACHE_LIMIT) {
      const firstKey = cache.keys().next().value;
      if (typeof firstKey !== "number") break;
      const tex = cache.get(firstKey);
      cache.delete(firstKey);
      tex?.dispose();
    }
  }, []);

  const buildSliceUrl = useCallback(
    (slice: number) => {
      const params = new URLSearchParams({
        window_center: "-600",
        window_width: "1500",
        orientation: "axial",
        denoise: "false",
        include_overlay: "true",
      });
      return `${getApiBaseUrl()}/studies/${encodeURIComponent(studyId)}/slices/${slice}?${params}`;
    },
    [studyId],
  );

  const loadSliceTexture = useCallback(
    (slice: number): Promise<THREE.Texture> => {
      const cached = textureCacheRef.current.get(slice);
      if (cached) {
        touchTextureLru(slice);
        return Promise.resolve(cached);
      }
      const pending = pendingLoadsRef.current.get(slice);
      if (pending) return pending;

      if (!loaderRef.current) {
        loaderRef.current = new THREE.TextureLoader();
        loaderRef.current.setCrossOrigin("anonymous");
      }
      const loader = loaderRef.current;
      const promise = new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          buildSliceUrl(slice),
          (loaded) => {
            loaded.colorSpace = THREE.SRGBColorSpace;
            textureCacheRef.current.set(slice, loaded);
            touchTextureLru(slice);
            evictTextureCache();
            pendingLoadsRef.current.delete(slice);
            resolve(loaded);
          },
          undefined,
          () => {
            pendingLoadsRef.current.delete(slice);
            reject(new Error(`Failed loading slice ${slice}`));
          },
        );
      });
      pendingLoadsRef.current.set(slice, promise);
      return promise;
    },
    [buildSliceUrl, evictTextureCache, touchTextureLru],
  );

  useEffect(() => {
    if (!studyId || maxSlices === 0) {
      setTexture(null);
      setLoading(false);
      return;
    }
    const requestId = ++latestRequestRef.current;
    const cached = textureCacheRef.current.get(currentSlice);
    if (cached) {
      touchTextureLru(currentSlice);
      setTexture(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadSliceTexture(currentSlice)
      .then((loaded) => {
        if (latestRequestRef.current !== requestId) return;
        setTexture(loaded);
      })
      .catch(() => {
        if (latestRequestRef.current !== requestId) return;
        setTexture(null);
      })
      .finally(() => {
        if (latestRequestRef.current === requestId) setLoading(false);
      });

    const neighbors = [currentSlice - 1, currentSlice + 1].filter(
      (slice) => slice >= 0 && slice < maxSlices,
    );
    neighbors.forEach((slice) => {
      void loadSliceTexture(slice).catch(() => undefined);
    });
  }, [studyId, maxSlices, currentSlice, loadSliceTexture, touchTextureLru]);

  React.useEffect(() => {
    return () => {
      pendingLoadsRef.current.clear();
      textureCacheRef.current.forEach((tex) => tex.dispose());
      textureCacheRef.current.clear();
    };
  }, []);

  React.useEffect(() => {
    if (layoutPosition && !anchorPosition) {
      setPosition(layoutPosition);
    }
  }, [layoutPosition, anchorPosition]);

  React.useEffect(() => {
    if (!anchorPosition) return;
    setPosition(anchorPosition);
  }, [anchorPosition]);

  const clampSlice = useCallback(
    (next: number) => Math.max(0, Math.min(maxSlices - 1, next)),
    [maxSlices],
  );

  const updateSlice = useCallback(
    (next: number) => {
      const clamped = clampSlice(next);
      if (clamped === currentSliceRef.current) return;
      onSliceChange(clamped);
    },
    [clampSlice, onSliceChange],
  );

  const handlePrevSlice = () => {
    onPausePlayback();
    updateSlice(currentSliceRef.current - 1);
  };

  const handleNextSlice = () => {
    onPausePlayback();
    updateSlice(currentSliceRef.current + 1);
  };

  const rotatePlaneY = useCallback((direction: 1 | -1) => {
    setPlaneRotation((current) => stepRotationY(current, direction));
  }, []);

  const resetPlaneRotation = useCallback(() => {
    setPlaneRotation(ZERO_ROTATION);
  }, []);

  const onSlicePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onPausePlayback();
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.nativeEvent.clientX,
    };
    setIsDragging(true);
    (e.object as THREE.Mesh).setPointerCapture(e.pointerId);
  }, [onPausePlayback]);

  const onSlicePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== e.pointerId) return;
      const deltaX = e.nativeEvent.clientX - dragState.lastX;
      const absDelta = Math.abs(deltaX);
      if (absDelta < DRAG_STEP_PX) return;
      const steps = Math.trunc(absDelta / DRAG_STEP_PX);
      const direction = deltaX > 0 ? 1 : -1;
      dragState.lastX += steps * DRAG_STEP_PX * direction;
      updateSlice(currentSliceRef.current + steps * direction);
    },
    [updateSlice],
  );

  const onSlicePointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      (e.object as THREE.Mesh).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  if (loading && !texture) {
    if (isVrImmersive) {
      return (
        <group position={position}>
          <mesh>
            <planeGeometry args={[0.55, 0.14]} />
            <meshBasicMaterial color="#0c4a6e" transparent opacity={0.9} />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.035} color="#7dd3fc" anchorX="center" anchorY="middle">
            Loading slice…
          </Text>
        </group>
      );
    }
    return (
      <Html position={[0, 1.2, -0.2]} center>
        <div className="rounded-lg border border-blue-500/50 bg-blue-950/80 px-4 py-2 backdrop-blur-sm">
          <p className="text-xs font-medium text-blue-300">Loading DICOM slice...</p>
        </div>
      </Html>
    );
  }

  return (
    <Interactive
      onSelectStart={() => setIsDragging(true)}
      onSelectEnd={() => {
        dragRef.current = null;
        setIsDragging(false);
      }}
    >
      <group position={position}>
        {texture && (
          <>
            <group rotation={planeRotation}>
              <mesh
                position={[0, 0, 0]}
                renderOrder={1}
                onPointerDown={onSlicePointerDown}
                onPointerMove={onSlicePointerMove}
                onPointerUp={onSlicePointerUp}
              >
                <planeGeometry args={[STACK_PLANE_SIZE, STACK_PLANE_SIZE]} />
                <meshBasicMaterial
                  map={texture}
                  transparent
                  opacity={STACK_FOCUS_OPACITY}
                  side={THREE.DoubleSide}
                  depthWrite
                />
              </mesh>
            </group>

            {isDragging && useHtmlControls ? (
              <Html position={[0, 0.85, 0]} center>
                <div className="rounded-full border border-green-500/60 bg-green-950/90 px-2.5 py-0.5 backdrop-blur-md animate-pulse">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-green-200">
                    Scrubbing...
                  </p>
                </div>
              </Html>
            ) : null}

            {isPresenting && !isVrImmersive && (
              <Billboard position={[0.95, 0, 0]} follow={true}>
                <group>
                  <mesh
                    position={[0, 0.22, 0]}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePrevSlice();
                    }}
                  >
                    <planeGeometry args={[0.32, 0.32]} />
                    <meshBasicMaterial color="#1e3a8a" />
                  </mesh>
                  <mesh
                    position={[0, -0.22, 0]}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleNextSlice();
                    }}
                  >
                    <planeGeometry args={[0.32, 0.32]} />
                    <meshBasicMaterial color="#1d4ed8" />
                  </mesh>
                </group>
              </Billboard>
            )}
          </>
        )}

        {isVrImmersive && (
          <group position={[0, -0.95, 0.05]}>
            <Text position={[0, 0.22, 0.02]} fontSize={0.038} color="#93c5fd" anchorX="center" anchorY="middle">
              {`${currentSlice + 1} / ${maxSlices}`}
            </Text>
            <ImmersiveButton
              label="Prev"
              position={[-0.42, 0, 0]}
              color="#1e3a8a"
              width={0.22}
              onSelect={handlePrevSlice}
            />
            <ImmersiveButton
              label={isPlaying ? "Pause" : "Play"}
              position={[0, 0, 0]}
              color="#0891b2"
              width={0.26}
              onSelect={onTogglePlay}
            />
            <ImmersiveButton
              label="Next"
              position={[0.42, 0, 0]}
              color="#1d4ed8"
              width={0.22}
              onSelect={handleNextSlice}
            />
            <ImmersiveButton
              label="↺"
              position={[-0.55, -0.38, 0]}
              color="#475569"
              width={0.2}
              onSelect={() => rotatePlaneY(-1)}
            />
            <ImmersiveButton
              label="↻"
              position={[0.55, -0.38, 0]}
              color="#475569"
              width={0.2}
              onSelect={() => rotatePlaneY(1)}
            />
            <ImmersiveButton
              label="0°"
              position={[0, -0.38, 0]}
              color="#334155"
              width={0.18}
              onSelect={resetPlaneRotation}
            />
          </group>
        )}

        {useHtmlControls && (
        <Html position={[0, -0.85, 0]} center style={{ pointerEvents: "auto" }}>
          <div className="flex flex-col items-center gap-2 select-none">
            <div className="rounded-full border border-blue-500/40 bg-blue-950/95 px-3 py-1 backdrop-blur-md">
              <p className="text-[11px] font-semibold tabular-nums text-blue-200">
                {currentSlice + 1} / {maxSlices}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevSlice}
                disabled={currentSlice === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/90 shadow-lg transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                disabled={maxSlices <= 1}
                className="rounded-full bg-cyan-600/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg transition-all hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>

              <input
                type="range"
                min={0}
                max={Math.max(maxSlices - 1, 0)}
                value={currentSlice}
                onChange={(e) => {
                  onPausePlayback();
                  updateSlice(parseInt(e.target.value, 10));
                }}
                className="h-2 w-40 cursor-pointer appearance-none rounded-full bg-slate-700
                    [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-blue-500
                    [&::-moz-range-thumb]:shadow-lg
                    [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-blue-500
                    [&::-webkit-slider-thumb]:shadow-lg"
                style={{
                  background: `linear-gradient(to right, rgb(59 130 246) 0%, rgb(59 130 246) ${(currentSlice / Math.max(maxSlices - 1, 1)) * 100}%, rgb(51 65 85) ${(currentSlice / Math.max(maxSlices - 1, 1)) * 100}%, rgb(51 65 85) 100%)`,
                }}
              />

              <button
                type="button"
                onClick={handleNextSlice}
                disabled={currentSlice === maxSlices - 1}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/90 shadow-lg transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => rotatePlaneY(-1)}
                className="rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-white transition-all hover:bg-slate-600"
                title="Tourner la coupe de 90° (sens antihoraire)"
              >
                ↺ 90°
              </button>
              <button
                type="button"
                onClick={() => rotatePlaneY(1)}
                className="rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-white transition-all hover:bg-slate-600"
                title="Tourner la coupe de 90° (sens horaire)"
              >
                ↻ 90°
              </button>
              <button
                type="button"
                onClick={resetPlaneRotation}
                className="rounded-md bg-slate-600/80 px-2 py-1 text-[9px] font-semibold text-slate-200 transition-all hover:bg-slate-500"
                title="Réinitialiser l’orientation de la coupe"
              >
                Réinit.
              </button>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onPausePlayback();
                  updateSlice(0);
                }}
                className="rounded-md bg-slate-700/80 px-2.5 py-1 text-[9px] font-bold text-white transition-all hover:bg-slate-600"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => {
                  onPausePlayback();
                  updateSlice(Math.floor(maxSlices / 2));
                }}
                className="rounded-md bg-slate-700/80 px-2.5 py-1 text-[9px] font-bold text-white transition-all hover:bg-slate-600"
              >
                Middle
              </button>
              <button
                type="button"
                onClick={() => {
                  onPausePlayback();
                  updateSlice(maxSlices - 1);
                }}
                className="rounded-md bg-slate-700/80 px-2.5 py-1 text-[9px] font-bold text-white transition-all hover:bg-slate-600"
              >
                Last
              </button>
            </div>
          </div>
        </Html>
        )}
      </group>
    </Interactive>
  );
}
