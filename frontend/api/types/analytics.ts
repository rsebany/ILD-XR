export interface StudyMetrics {
  study_id: string;
  volume_total_mm3: number;
  /** Aggregate ILD burden = V_lesion / V_lung (clamped to [0,1]). */
  ild_fraction: number;
  /** Same value as ild_fraction, surfaced under the report's name. */
  ild_burden?: number | null;
  zonal_distribution: Record<string, number>;
  lung_volume_ml?: number | null;
  ggo_volume_ml?: number | null;
  reticulation_volume_ml?: number | null;
  consolidation_volume_ml?: number | null;
  ggo_burden?: number | null;
  reticulation_burden?: number | null;
  consolidation_burden?: number | null;
}

export interface DashboardMetrics {
  mean_dice: number;
  studies_count: number;
  pending_count: number;
  completed_today: number;
  avg_turnaround_hours: number;
}

