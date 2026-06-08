import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalibrationChart } from '@/features/credibility/components/CalibrationChart';
import type { CalibrationBucket } from '@/features/credibility/types';

const buckets: CalibrationBucket[] = [
  { confidence_mid: 0.1, predicted: 0.1, realized_hit_rate: 0.15, sample_size: 8 },
  { confidence_mid: 0.3, predicted: 0.3, realized_hit_rate: 0.28, sample_size: 12 },
  { confidence_mid: 0.5, predicted: 0.5, realized_hit_rate: 0.52, sample_size: 15 },
  { confidence_mid: 0.7, predicted: 0.7, realized_hit_rate: 0.68, sample_size: 7 },
  { confidence_mid: 0.9, predicted: 0.9, realized_hit_rate: null, sample_size: 0 },
];

describe('CalibrationChart', () => {
  it('renders without crashing when given valid buckets', () => {
    render(<CalibrationChart buckets={buckets} />);
    expect(document.body).toBeTruthy();
  });

  it('shows insufficient empty-state note when buckets are empty', () => {
    render(<CalibrationChart buckets={[]} />);
    expect(screen.getAllByText(/置信度/).length).toBeGreaterThan(0);
  });

  it('shows empty-state note when all buckets have zero sample_size', () => {
    const emptyBuckets: CalibrationBucket[] = [
      { confidence_mid: 0.5, predicted: 0.5, realized_hit_rate: null, sample_size: 0 },
    ];
    render(<CalibrationChart buckets={emptyBuckets} />);
    expect(screen.getAllByText(/置信度/).length).toBeGreaterThan(0);
  });

  it('renders chart container when there is sufficient data', () => {
    render(<CalibrationChart buckets={buckets.slice(0, 4)} />);
    // Container div should be present
    const container = document.querySelector('[data-testid="calibration-chart"]');
    expect(container).toBeTruthy();
  });
});
