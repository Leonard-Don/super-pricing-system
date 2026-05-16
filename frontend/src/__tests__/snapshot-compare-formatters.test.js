import {
  formatNumber,
  formatPercent,
  formatPercentPoints,
} from '../components/research-workbench/snapshotCompareFormatters';

describe('snapshotCompareFormatters fallback invariants', () => {
  describe('formatNumber', () => {
    it('renders the dash placeholder for null, undefined and empty string', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
      expect(formatNumber('')).toBe('-');
    });

    it('renders the dash placeholder for NaN and ±Infinity instead of literal "NaN"/"Infinity"', () => {
      expect(formatNumber(Number.NaN)).toBe('-');
      expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('-');
      expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('-');
    });

    it('preserves an explicit numeric zero as a real formatted value, not the placeholder', () => {
      expect(formatNumber(0)).toBe('0.00');
      expect(formatNumber(0, 0)).toBe('0');
      expect(formatNumber(-0)).toBe('0.00');
    });

    it('formats finite numbers with the requested precision', () => {
      expect(formatNumber(1.234)).toBe('1.23');
      expect(formatNumber(1.5, 3)).toBe('1.500');
      expect(formatNumber(-9.87)).toBe('-9.87');
    });
  });

  describe('formatPercent', () => {
    it('renders the dash placeholder for null, undefined and empty string', () => {
      expect(formatPercent(null)).toBe('-');
      expect(formatPercent(undefined)).toBe('-');
      expect(formatPercent('')).toBe('-');
    });

    it('renders the dash placeholder for NaN and ±Infinity', () => {
      expect(formatPercent(Number.NaN)).toBe('-');
      expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('-');
      expect(formatPercent(Number.NEGATIVE_INFINITY)).toBe('-');
    });

    it('preserves an explicit zero ratio as 0.00%, not the placeholder', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });

    it('multiplies finite ratios by 100 and appends the percent sign', () => {
      expect(formatPercent(0.0525)).toBe('5.25%');
      expect(formatPercent(-0.1)).toBe('-10.00%');
    });
  });

  describe('formatPercentPoints', () => {
    it('renders the dash placeholder for null, undefined and empty string', () => {
      expect(formatPercentPoints(null)).toBe('-');
      expect(formatPercentPoints(undefined)).toBe('-');
      expect(formatPercentPoints('')).toBe('-');
    });

    it('renders the dash placeholder for NaN and ±Infinity', () => {
      expect(formatPercentPoints(Number.NaN)).toBe('-');
      expect(formatPercentPoints(Number.POSITIVE_INFINITY)).toBe('-');
      expect(formatPercentPoints(Number.NEGATIVE_INFINITY)).toBe('-');
    });

    it('preserves an explicit zero as 0.00%, not the placeholder', () => {
      expect(formatPercentPoints(0)).toBe('0.00%');
    });

    it('formats finite percentage-point values without rescaling', () => {
      expect(formatPercentPoints(2.4)).toBe('2.40%');
      expect(formatPercentPoints(-13.6)).toBe('-13.60%');
    });
  });
});
