import { describe, it, expect } from 'vitest';
import { buildPricingComparisonRows, extractPricingMetrics } from '../snapshotComparePricing';

const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
  payload: {
    fair_value: { mid: 100, low: 80, high: 120 },
    gap_analysis: { gap_pct: 0.05, fair_value_mid: 100 },
    implications: {
      primary_view: 'undervalued',
      confidence: 'medium',
      factor_alignment: { label: 'aligned' },
    },
    drivers: [{ factor: 'Momentum', name: 'Momentum' }],
    ...overrides,
  },
});

describe('buildPricingComparisonRows', () => {
  it('returns rows array and summary array', () => {
    const base = extractPricingMetrics(makeSnapshot());
    const target = extractPricingMetrics(makeSnapshot({
      fair_value: { mid: 110, low: 90, high: 130 },
      gap_analysis: { gap_pct: 0.10, fair_value_mid: 110 },
    }));
    const result = buildPricingComparisonRows(base, target);
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(Array.isArray(result.summary)).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('each row has key, label, left, right, delta', () => {
    const base = extractPricingMetrics(makeSnapshot());
    const target = extractPricingMetrics(makeSnapshot());
    const result = buildPricingComparisonRows(base, target);
    for (const row of result.rows) {
      expect(row).toHaveProperty('key');
      expect(row).toHaveProperty('label');
      expect(row).toHaveProperty('left');
      expect(row).toHaveProperty('right');
      expect(row).toHaveProperty('delta');
    }
  });

  it('fair-value row shows correct formatted values', () => {
    const base = extractPricingMetrics(makeSnapshot());
    const target = extractPricingMetrics(makeSnapshot({
      fair_value: { mid: 110, low: 90, high: 130 },
      gap_analysis: { gap_pct: 0.10, fair_value_mid: 110 },
    }));
    const result = buildPricingComparisonRows(base, target);
    const fairValueRow = result.rows.find((r) => r.key === 'fair-value');
    expect(fairValueRow).toBeDefined();
    expect(fairValueRow?.left).toBe('100.00');
    expect(fairValueRow?.right).toBe('110.00');
    expect(fairValueRow?.delta).toBe('+10.00');
  });

  it('delta is "不变" when values are equal', () => {
    const base = extractPricingMetrics(makeSnapshot());
    const target = extractPricingMetrics(makeSnapshot());
    const result = buildPricingComparisonRows(base, target);
    const primaryViewRow = result.rows.find((r) => r.key === 'primary-view');
    expect(primaryViewRow?.delta).toBe('不变');
  });
});
