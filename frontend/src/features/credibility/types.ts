/**
 * Credibility envelope — mirrors the backend `validate_signal_series` output.
 * All metrics carry a `sample_size` so the UI can always disclose how many
 * observations back a number, even when `value` is null.
 */

export interface MetricResult {
  value: number | null;
  sample_size: number;
}

export interface DirectionalResult {
  long: number | null;
  short: number | null;
  long_short_edge: number | null;
  sample_size: number;
}

export interface CalibrationBucket {
  confidence_mid: number;
  predicted: number;
  realized_hit_rate: number | null;
  sample_size: number;
}

export interface CalibrationResult {
  buckets: CalibrationBucket[];
  sample_size: number;
}

export interface HorizonResult {
  horizon: number;
  status: 'ok' | 'insufficient_data';
  sample_size: number;
  hit_rate: MetricResult;
  ic: MetricResult;
  directional: DirectionalResult;
  calibration: CalibrationResult;
}

export interface CredibilityResponse {
  since_date: string | null;
  min_sample: number;
  horizons: HorizonResult[];
  /** Present when the endpoint returns an early error/accumulating envelope */
  status?: string;
}
