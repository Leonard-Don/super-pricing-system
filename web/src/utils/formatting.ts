export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export const formatPercentage = (value: number | null | undefined): string => {
  if (value === undefined || value === null) return '-';
  if (!Number.isFinite(Number(value))) return '-';
  return `${(Number(value) * 100).toFixed(2)}%`;
};

export const getValueColor = (value: number): string => {
  if (value > 0) return 'var(--pos)';
  if (value < 0) return 'var(--neg)';
  return 'var(--muted-foreground)';
};
