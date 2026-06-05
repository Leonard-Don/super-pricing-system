// ---------------------------------------------------------------------------
// snapshotCompareFormatters — ported from
// frontend/src/components/research-workbench/snapshotCompareFormatters.js
// ---------------------------------------------------------------------------

export const formatNumber = (value: unknown, digits = 2): string => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toFixed(digits);
};

export const formatPercent = (value: unknown, digits = 2): string => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${(numeric * 100).toFixed(digits)}%`;
};

export const formatPercentPoints = (value: unknown, digits = 2): string => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric.toFixed(digits)}%`;
};

export const formatSignedDelta = (
  left: unknown,
  right: unknown,
  formatter: (v: number) => string = formatNumber,
): string | null => {
  if (left === null || left === undefined || right === null || right === undefined) return null;
  const leftNumeric = Number(left);
  const rightNumeric = Number(right);
  if (Number.isNaN(leftNumeric) || Number.isNaN(rightNumeric)) return null;
  const delta = rightNumeric - leftNumeric;
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${formatter(delta)}`;
};

export interface ComparisonRow {
  key: string;
  label: string;
  left: string;
  right: string;
  delta: string | null;
  magnitude?: number;
}

export const buildNumericRow = (
  key: string,
  label: string,
  baseVal: unknown,
  targetVal: unknown,
  formatter: (v: unknown, digits?: number) => string = formatNumber,
): ComparisonRow => ({
  key,
  label,
  left: formatter(baseVal),
  right: formatter(targetVal),
  delta: formatSignedDelta(baseVal, targetVal, (v) => formatter(v)),
});

export const buildTextRow = (
  key: string,
  label: string,
  baseVal: string,
  targetVal: string,
  changeLabel?: string,
): ComparisonRow => ({
  key,
  label,
  left: baseVal,
  right: targetVal,
  delta: baseVal === targetVal ? '不变' : (changeLabel ?? `${baseVal} -> ${targetVal}`),
});

export const extractViewContextMetrics = (payload: Record<string, unknown> = {}): {
  viewContextSummary: string;
  viewContextTask: string;
} => {
  const viewContext = (payload.view_context ?? payload.workbench_view_context ?? {}) as Record<string, unknown>;
  return {
    viewContextSummary: String(viewContext.summary ?? '-'),
    viewContextTask: String(viewContext.scoped_task_label ?? '-'),
  };
};

interface DriverItem {
  key: string;
  value?: unknown;
  label?: string;
}

export const buildDriverLookup = (
  items: DriverItem[] = [],
): Record<string, DriverItem> =>
  Object.fromEntries((items ?? []).map((item) => [item.key, item]));

export const buildDriverTrendRows = (
  baseDrivers: DriverItem[] = [],
  targetDrivers: DriverItem[] = [],
): ComparisonRow[] => {
  const baseLookup = buildDriverLookup(baseDrivers);
  const targetLookup = buildDriverLookup(targetDrivers);
  const keys = Array.from(new Set([...Object.keys(baseLookup), ...Object.keys(targetLookup)]));

  return keys
    .map((key) => {
      const left = Number(baseLookup[key]?.value ?? 0);
      const right = Number(targetLookup[key]?.value ?? 0);
      return {
        key: `driver-${key}`,
        label: `驱动因子：${targetLookup[key]?.label ?? baseLookup[key]?.label ?? key}`,
        left: formatNumber(left),
        right: formatNumber(right),
        delta: formatSignedDelta(left, right, (value) => formatNumber(value)),
        magnitude: Math.abs(right - left),
      };
    })
    .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0))
    .slice(0, 3)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ magnitude: _magnitude, ...row }) => row);
};
