// ---------------------------------------------------------------------------
// snapshotCompare — ported from
// frontend/src/components/research-workbench/snapshotCompare.js
// ---------------------------------------------------------------------------

import { extractPricingMetrics, buildPricingComparisonRows, type PricingComparisonResult } from './snapshotComparePricing';
import { extractCrossMarketMetrics, buildCrossMarketComparisonRows, type CrossMarketComparisonResult } from './snapshotCompareCrossMarket';

export type SnapshotComparison = PricingComparisonResult | CrossMarketComparisonResult;

export const buildSnapshotComparison = (
  taskType: string | null | undefined,
  baseSnapshot: Record<string, unknown> | null | undefined,
  targetSnapshot: Record<string, unknown> | null | undefined,
): SnapshotComparison | null => {
  if (!baseSnapshot || !targetSnapshot) {
    return null;
  }

  if (taskType === 'pricing' || taskType === 'macro_mispricing') {
    const base = extractPricingMetrics(baseSnapshot);
    const target = extractPricingMetrics(targetSnapshot);
    return buildPricingComparisonRows(base, target);
  }

  const base = extractCrossMarketMetrics(baseSnapshot);
  const target = extractCrossMarketMetrics(targetSnapshot);
  return buildCrossMarketComparisonRows(base, target);
};
