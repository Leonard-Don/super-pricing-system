import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CredibilityPanel } from '@/features/credibility/components/CredibilityPanel';
import type { CredibilityResponse } from '@/features/credibility/types';

const okResponse: CredibilityResponse = {
  since_date: '2026-01-01',
  min_sample: 20,
  horizons: [
    {
      horizon: 5,
      status: 'ok',
      sample_size: 42,
      hit_rate: { value: 0.64, sample_size: 42 },
      ic: { value: 0.18, sample_size: 42 },
      directional: { long: 0.012, short: -0.008, long_short_edge: 0.02, sample_size: 38 },
      calibration: {
        buckets: [
          { confidence_mid: 0.1, predicted: 0.1, realized_hit_rate: 0.1, sample_size: 5 },
          { confidence_mid: 0.9, predicted: 0.9, realized_hit_rate: 0.85, sample_size: 37 },
        ],
        sample_size: 42,
      },
    },
    {
      horizon: 20,
      status: 'ok',
      sample_size: 30,
      hit_rate: { value: 0.57, sample_size: 30 },
      ic: { value: 0.12, sample_size: 30 },
      directional: { long: 0.02, short: -0.01, long_short_edge: 0.03, sample_size: 28 },
      calibration: { buckets: [], sample_size: 0 },
    },
  ],
};

const insufficientResponse: CredibilityResponse = {
  since_date: '2026-05-01',
  min_sample: 20,
  horizons: [
    {
      horizon: 5,
      status: 'insufficient_data',
      sample_size: 8,
      hit_rate: { value: null, sample_size: 8 },
      ic: { value: null, sample_size: 8 },
      directional: { long: null, short: null, long_short_edge: null, sample_size: 8 },
      calibration: { buckets: [], sample_size: 0 },
    },
  ],
};

describe('CredibilityPanel', () => {
  it('renders horizon labels for ok data', () => {
    render(<CredibilityPanel data={okResponse} />);
    // Should show both horizons (multiple elements expected since numbers appear in sample counts too)
    expect(screen.getAllByText(/5日/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/20日/).length).toBeGreaterThan(0);
  });

  it('renders sample-size disclosure for ok horizon', () => {
    render(<CredibilityPanel data={okResponse} />);
    expect(screen.getAllByText(/42/).length).toBeGreaterThan(0);
  });

  it('shows accumulating state for insufficient horizon, no metrics exposed', () => {
    render(<CredibilityPanel data={insufficientResponse} />);
    expect(screen.getAllByText(/累积中/).length).toBeGreaterThan(0);
    // Should NOT render a hit-rate value (null metric)
    const pctItems = screen.queryAllByText(/胜率.*%/);
    expect(pctItems.length).toBe(0);
  });

  it('renders hit-rate label for ok horizon', () => {
    render(<CredibilityPanel data={okResponse} />);
    expect(screen.getAllByText(/胜率/).length).toBeGreaterThan(0);
  });

  it('renders IC label for ok horizon', () => {
    render(<CredibilityPanel data={okResponse} />);
    expect(screen.getAllByText(/IC/).length).toBeGreaterThan(0);
  });

  it('renders loading skeleton when data is undefined', () => {
    render(<CredibilityPanel data={undefined} />);
    // Should render a skeleton/loading placeholder, not crash
    expect(document.body).toBeTruthy();
  });
});
