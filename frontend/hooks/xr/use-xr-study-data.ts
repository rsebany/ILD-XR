"use client";

import { useEffect, useState } from "react";
import type { StudyMetrics } from "@/api/domain";
import { getApiBaseUrl } from "@/api/http/client";
import { studyService, type StudySyncEvent } from "@/services/study";

export function useXrStudyData(studyId: string | null, fallbackMesh: string | null) {
  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const [meshError, setMeshError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!studyId);
  const [metrics, setMetrics] = useState<StudyMetrics | null>(null);
  const [meshLoadSuccess, setMeshLoadSuccess] = useState(false);
  const [dicomSliceCount, setDicomSliceCount] = useState(0);
  const [currentDicomSlice, setCurrentDicomSlice] = useState(0);
  const [syncConnected, setSyncConnected] = useState(false);
  const [liveRevision, setLiveRevision] = useState<number>(0);

  useEffect(() => {
    if (studyId) {
      setIsLoading(true);
      setMeshError(null);

      studyService
        .getMeshUrl(studyId)
        .then((url) => {
          setMeshUrl(url);
          setMeshLoadSuccess(true);
        })
        .catch((err) => {
          setMeshError(err?.message ?? "Mesh not available");
          setMeshUrl(fallbackMesh);
        })
        .finally(() => setIsLoading(false));

      studyService
        .getMetrics(studyId)
        .then((data) => setMetrics(data))
        .catch(() => {});

      studyService
        .getDicomVolumeShape(studyId)
        .then((shape) => {
          const depth = shape?.depth ?? 0;
          setDicomSliceCount(depth);
          setCurrentDicomSlice(depth > 0 ? Math.floor(depth / 2) : 0);
        })
        .catch((err) => {
          console.warn("XR DICOM volume shape failed:", err);
          setDicomSliceCount(0);
          setCurrentDicomSlice(0);
        });
    } else {
      setMeshUrl(fallbackMesh);
    }
  }, [studyId, fallbackMesh]);

  useEffect(() => {
    if (!studyId) return;
    const eventsUrl = studyService.getStudyEventsUrl(studyId);
    const es = new EventSource(eventsUrl);

    es.onopen = () => setSyncConnected(true);
    es.onerror = () => setSyncConnected(false);

    const handleData = (raw: string) => {
      try {
        const event = JSON.parse(raw) as StudySyncEvent;
        if (event.event === "mesh.updated") {
          setLiveRevision(event.revision_id || 0);
          if (event.mesh_url && event.mesh_url.trim().length > 0) {
            const next =
              event.mesh_url.startsWith("http://") ||
              event.mesh_url.startsWith("https://")
                ? event.mesh_url
                : `${getApiBaseUrl()}${event.mesh_url}`;
            const rev = event.revision_id || 0;
            setMeshUrl(`${next}${next.includes("?") ? "&" : "?"}rev=${rev}`);
            setMeshLoadSuccess(true);
            setMeshError(null);
          }
          if (event.metrics) {
            setMetrics((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                volume_total_mm3:
                  typeof event.metrics?.total_ild_volume_ml === "number"
                    ? event.metrics.total_ild_volume_ml * 1000
                    : prev.volume_total_mm3,
                ild_fraction:
                  typeof event.metrics?.ild_burden === "number"
                    ? event.metrics.ild_burden
                    : prev.ild_fraction,
                ild_burden:
                  typeof event.metrics?.ild_burden === "number"
                    ? event.metrics.ild_burden
                    : prev.ild_burden,
                lung_volume_ml:
                  typeof event.metrics?.lung_volume_ml === "number"
                    ? event.metrics.lung_volume_ml
                    : prev.lung_volume_ml,
                emphysema_volume_ml:
                  typeof event.metrics?.emphysema_volume_ml === "number"
                    ? event.metrics.emphysema_volume_ml
                    : prev.emphysema_volume_ml,
                fibrosis_volume_ml:
                  typeof event.metrics?.fibrosis_volume_ml === "number"
                    ? event.metrics.fibrosis_volume_ml
                    : prev.fibrosis_volume_ml,
                ground_glass_volume_ml:
                  typeof event.metrics?.ground_glass_volume_ml === "number"
                    ? event.metrics.ground_glass_volume_ml
                    : prev.ground_glass_volume_ml,
                micronodules_volume_ml:
                  typeof event.metrics?.micronodules_volume_ml === "number"
                    ? event.metrics.micronodules_volume_ml
                    : prev.micronodules_volume_ml,
                consolidation_volume_ml:
                  typeof event.metrics?.consolidation_volume_ml === "number"
                    ? event.metrics.consolidation_volume_ml
                    : prev.consolidation_volume_ml,
                emphysema_burden:
                  typeof event.metrics?.emphysema_burden === "number"
                    ? event.metrics.emphysema_burden
                    : prev.emphysema_burden,
                fibrosis_burden:
                  typeof event.metrics?.fibrosis_burden === "number"
                    ? event.metrics.fibrosis_burden
                    : prev.fibrosis_burden,
                ground_glass_burden:
                  typeof event.metrics?.ground_glass_burden === "number"
                    ? event.metrics.ground_glass_burden
                    : prev.ground_glass_burden,
                micronodules_burden:
                  typeof event.metrics?.micronodules_burden === "number"
                    ? event.metrics.micronodules_burden
                    : prev.micronodules_burden,
                consolidation_burden:
                  typeof event.metrics?.consolidation_burden === "number"
                    ? event.metrics.consolidation_burden
                    : prev.consolidation_burden,
                zonal_distribution:
                  event.zonal_distribution ?? prev.zonal_distribution,
              };
            });
          }
        }

        if (event.event === "segmentation.status") {
          const rev = event.current_revision_id || 0;
          setLiveRevision(rev);
          const meshPath = event.latest?.mesh_url;
          if (meshPath && meshPath.trim().length > 0) {
            const next =
              meshPath.startsWith("http://") || meshPath.startsWith("https://")
                ? meshPath
                : `${getApiBaseUrl()}${meshPath}`;
            setMeshUrl(`${next}${next.includes("?") ? "&" : "?"}rev=${rev}`);
          }
        }
      } catch {
        // ignore malformed payloads
      }
    };

    es.addEventListener("mesh.updated", (e) =>
      handleData((e as MessageEvent).data),
    );
    es.addEventListener("segmentation.status", (e) =>
      handleData((e as MessageEvent).data),
    );

    return () => {
      setSyncConnected(false);
      es.close();
    };
  }, [studyId]);

  const effectiveMeshUrl = meshUrl ?? fallbackMesh ?? "";
  const useMeshPlaceholder = effectiveMeshUrl.length === 0;

  return {
    meshUrl,
    meshError,
    isLoading,
    metrics,
    meshLoadSuccess,
    dicomSliceCount,
    currentDicomSlice,
    setCurrentDicomSlice,
    syncConnected,
    liveRevision,
    effectiveMeshUrl,
    useMeshPlaceholder,
  };
}
