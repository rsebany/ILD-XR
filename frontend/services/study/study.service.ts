import {
  getDicomVolumeShape,
  getStudyDicomZip,
  getStudyEventsUrl,
  getStudyMask,
  getStudyMeshUrl,
  getStudyMetrics,
  listStudies,
  runStudyAiAnalysis,
} from "@/api/clients";

export type { DicomVolumeShape, StudySyncEvent } from "@/api/domain";

export const getList = listStudies;
export const getMetrics = getStudyMetrics;
export const getDicomZip = getStudyDicomZip;
export const getMeshUrl = getStudyMeshUrl;
export const runAiAnalysis = runStudyAiAnalysis;
export const getMask = getStudyMask;

export const studyService = {
  getList: listStudies,
  getMetrics: getStudyMetrics,
  getDicomZip: getStudyDicomZip,
  getMeshUrl: getStudyMeshUrl,
  getDicomVolumeShape,
  getMask: getStudyMask,
  runAiAnalysis: runStudyAiAnalysis,
  getStudyEventsUrl,
};
