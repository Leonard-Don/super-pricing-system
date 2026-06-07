import { describe, it, expect } from 'vitest';
import { buildPricingWorkbenchPayload } from '../playbookViewModels';

const makeContext = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'AAPL',
  source: 'godeye',
  period: '1y',
  note: '',
  ...overrides,
});

const makePricingResult = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'AAPL',
  gap_analysis: { gap_pct: 0.05, fair_value_mid: 100, current_price: 95, direction: 'undervalued', severity_label: 'moderate', severity: 'moderate' },
  valuation: {
    fair_value: { mid: 100, low: 80, high: 120, method: 'DCF' },
    dcf: { scenarios: [] },
  },
  implications: {
    primary_view: 'undervalued',
    confidence: 'medium',
    risk_level: 'moderate',
    insights: [],
    factor_alignment: { status: 'aligned', summary: 'aligned' },
  },
  deviation_drivers: {
    drivers: [{ factor: 'Momentum', description: 'Momentum is strong' }],
    primary_driver: { factor: 'Momentum' },
  },
  factor_model: { period: '1y', data_points: 252 },
  people_governance_overlay: {},
  people_layer: {},
  ...overrides,
});

describe('buildPricingWorkbenchPayload', () => {
  it('returns null when no symbol', () => {
    const result = buildPricingWorkbenchPayload({ source: 'godeye' }, null);
    expect(result).toBeNull();
  });

  it('returns payload with type "pricing"', () => {
    const result = buildPricingWorkbenchPayload(makeContext(), makePricingResult());
    expect(result).not.toBeNull();
    expect(result?.type).toBe('pricing');
  });

  it('payload has snapshot with headline', () => {
    const result = buildPricingWorkbenchPayload(makeContext(), makePricingResult());
    expect(result?.snapshot).toBeDefined();
    expect((result?.snapshot as Record<string, unknown>)?.headline).toBeTruthy();
  });

  it('payload title starts with [Pricing]', () => {
    const result = buildPricingWorkbenchPayload(makeContext(), makePricingResult());
    expect(result?.title).toMatch(/^\[Pricing\]/);
  });

  it('payload symbol is uppercased', () => {
    const result = buildPricingWorkbenchPayload(makeContext({ symbol: 'aapl' }), makePricingResult({ symbol: 'aapl' }));
    expect(result?.symbol).toBe('AAPL');
  });

  it('snapshot payload contains fair_value', () => {
    const result = buildPricingWorkbenchPayload(makeContext(), makePricingResult());
    const snapshot = result?.snapshot as Record<string, unknown> | undefined;
    const snapshotPayload = snapshot?.payload as Record<string, unknown> | undefined;
    expect(snapshotPayload).toBeDefined();
    expect(snapshotPayload?.fair_value).toBeDefined();
  });

  it('works with no pricingResult (minimal context)', () => {
    const result = buildPricingWorkbenchPayload(makeContext(), null);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('pricing');
    expect(result?.symbol).toBe('AAPL');
  });
});
