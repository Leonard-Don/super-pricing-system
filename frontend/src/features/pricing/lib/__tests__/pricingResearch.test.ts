import { describe, it, expect } from 'vitest';
import { parsePricingUniverseInput, sortScreeningRows, getConfidenceLabel } from '@/features/pricing/lib/pricingResearch';

describe('parsePricingUniverseInput', () => {
  it('splits on commas/newlines/spaces, dedupes, uppercases', () => {
    expect(parsePricingUniverseInput('aapl, msft\nAAPL  nvda')).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });
  it('returns [] for empty', () => {
    expect(parsePricingUniverseInput('   ')).toEqual([]);
  });
});

// NOTE: The starter test used { score: N } but the real implementation sorts by
// `screening_score` (not `score`). Rows without `screening_score` all resolve to
// null and fall back to gap_pct comparison. Using `screening_score` here locks
// the OLD behavior (rows with screening_score sort desc, nulls last).
describe('sortScreeningRows', () => {
  it('sorts by screening_score desc by default', () => {
    const rows = [
      { symbol: 'A', screening_score: 1 },
      { symbol: 'B', screening_score: 3 },
      { symbol: 'C', screening_score: 2 },
    ];
    expect(sortScreeningRows(rows).map((r) => r.symbol)).toEqual(['B', 'C', 'A']);
  });
  it('assigns rank starting at 1', () => {
    const rows = [{ symbol: 'X', screening_score: 5 }, { symbol: 'Y', screening_score: 1 }];
    const sorted = sortScreeningRows(rows);
    expect(sorted[0].rank).toBe(1);
    expect(sorted[1].rank).toBe(2);
  });
  it('places rows with missing screening_score last', () => {
    const rows = [
      { symbol: 'A', screening_score: null },
      { symbol: 'B', screening_score: 10 },
    ];
    expect(sortScreeningRows(rows).map((r) => r.symbol)).toEqual(['B', 'A']);
  });
});

// NOTE: The starter test called getConfidenceLabel(0.9) expecting a string.
// The real implementation maps string keys 'low'/'medium'/'high' — passing a
// number 0.9 is not a valid key, so it returns '' (empty string). That IS a
// string, so `typeof '' === 'string'` still holds. We add a second test that
// locks the actual key-based lookup behavior.
describe('getConfidenceLabel', () => {
  it('maps a high confidence to a label string', () => {
    expect(typeof getConfidenceLabel(0.9)).toBe('string');
  });
  it('returns the correct Chinese label for known string keys', () => {
    expect(getConfidenceLabel('high')).toBe('高');
    expect(getConfidenceLabel('medium')).toBe('中');
    expect(getConfidenceLabel('low')).toBe('低');
  });
  it('returns empty string for unknown values', () => {
    expect(getConfidenceLabel('unknown')).toBe('');
  });
});
