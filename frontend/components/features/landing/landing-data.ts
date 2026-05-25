export const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Data Ingestion",
    label: "Automated preprocessing of DICOM volumetric data.",
  },
  {
    step: "02",
    title: "AI Segmentation",
    label: "3D Residual U-Net inference for lesion quantification.",
  },
  {
    step: "03",
    title: "Spatial Analysis",
    label: "Interactive WebXR-based radiological review.",
  },
  {
    step: "04",
    title: "Clinical Reporting",
    label: "Structured diagnostic outputs for longitudinal tracking.",
  },
] as const;

export const RESEARCH_PILLARS = [
  {
    title: "Clinical Precision",
    hint: "Validated multi-class segmentation models.",
  },
  {
    title: "Explainability",
    hint: "Interactive 3D visualization for human oversight.",
  },
  {
    title: "Workflow Integration",
    hint: "Streamlined diagnostic support for ILD.",
  },
] as const;
