export const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Lung Preprocessing",
    label: "Stage 1: fixed lungmask R231 extracts lung fields from HU-normalized HRCT.",
  },
  {
    step: "02",
    title: "Hierarchical 3D Encoder",
    label: "Stage 2: MedicalNet-initialized ResNet-18 with SE blocks shares 512-dim features.",
  },
  {
    step: "03",
    title: "Softmax Heads",
    label: "Binary screening (primary); 3-class and 5-class heads for pattern attribution.",
  },
  {
    step: "04",
    title: "Patient Cascade",
    label: "Dual-threshold aggregation lifts patch Softmax votes to a patient-level decision.",
  },
  {
    step: "05",
    title: "Biomarkers and Review",
    label: "Volumes, burden, and zones plus 2D overlays, 3D meshes, and browser WebXR.",
  },
] as const;

export const RESEARCH_PILLARS = [
  {
    title: "High-recall patient flagging",
    hint: "Binary Normal vs Any-ILD is the primary clinical claim under patient-disjoint evaluation; a prioritization aid, not a standalone screening classifier.",
  },
  {
    title: "Pattern-attributed biomarkers",
    hint: "Hierarchical heads attribute fibrotic burden and per-class volumes—not standalone multi-class diagnosis.",
  },
  {
    title: "Open WebXR review",
    hint: "The same outputs open in 2D, 3D, and browser-native WebXR on standard hardware.",
  },
] as const;
