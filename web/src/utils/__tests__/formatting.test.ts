import { describe, it, expect } from 'vitest';
import { formatPercentage, formatCurrency, getValueColor } from '@/utils/formatting';

describe('formatPercentage', () => {
  it('formats a ratio as a 2-dp percent', () => {
    expect(formatPercentage(0.1234)).toBe('12.34%');
  });
  it('returns dash for null/undefined/non-finite', () => {
    expect(formatPercentage(null)).toBe('-');
    expect(formatPercentage(undefined)).toBe('-');
    expect(formatPercentage(Number.NaN)).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('formats USD', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });
});

describe('getValueColor', () => {
  it('maps sign to semantic token vars', () => {
    expect(getValueColor(1)).toBe('var(--pos)');
    expect(getValueColor(-1)).toBe('var(--neg)');
    expect(getValueColor(0)).toBe('var(--muted-foreground)');
  });
});
