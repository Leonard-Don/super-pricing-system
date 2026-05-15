import { formatPercentage } from '../utils/formatting';

describe('formatPercentage', () => {
  it('preserves the existing dash placeholder for null and undefined', () => {
    expect(formatPercentage(null)).toBe('-');
    expect(formatPercentage(undefined)).toBe('-');
  });

  it('renders explicit zero as 0.00% instead of collapsing to the placeholder', () => {
    expect(formatPercentage(0)).toBe('0.00%');
  });

  it('formats finite positive and negative ratios as percent strings', () => {
    expect(formatPercentage(0.05)).toBe('5.00%');
    expect(formatPercentage(-0.0325)).toBe('-3.25%');
    expect(formatPercentage(1)).toBe('100.00%');
  });

  it('returns the dash placeholder for NaN so the UI never displays "NaN%"', () => {
    expect(formatPercentage(Number.NaN)).toBe('-');
  });

  it('returns the dash placeholder for positive and negative Infinity so the UI never displays "Infinity%"', () => {
    expect(formatPercentage(Number.POSITIVE_INFINITY)).toBe('-');
    expect(formatPercentage(Number.NEGATIVE_INFINITY)).toBe('-');
  });
});
