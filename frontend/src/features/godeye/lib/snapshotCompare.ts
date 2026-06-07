// ---------------------------------------------------------------------------
// snapshotCompare — GodEye-scoped port of buildSnapshotComparison.
//
// Source: frontend/src/components/research-workbench/snapshotCompare.js +
//         frontend/src/components/research-workbench/snapshotCompareCrossMarket.js
//
// GodEye only uses buildSnapshotComparison(taskType, base, target)?.lead
// (see extractRecentComparisonLead in viewModelShared.ts).
//
// For cross_market / macro_mispricing tasks the lead comes from
// buildSelectionQualityLead (snapshotCompareCrossMarket.js lines 118-137).
// For pricing tasks the original buildPricingComparisonRows does NOT include
// a `lead` field, so the property access returns undefined → the caller's
// `|| ''` falls through to empty string — replicated here by returning null.
// ---------------------------------------------------------------------------

interface SnapshotLike {
  payload?: Record<string, unknown>;
}

interface SelectionQualityLike {
  label?: unknown;
}

interface ComparisonResult {
  lead: string;
}

// ---------------------------------------------------------------------------
// Helpers ported from snapshotCompareCrossMarket.js
// ---------------------------------------------------------------------------

const getSelectionQualitySummaryLabel = (label: unknown): string => {
  const str = String(label ?? '');
  if (!str || str === '-') return '未知结果';
  if (str === 'original' || str === '普通结果') return '普通结果';
  if (str === 'auto_downgraded' || str === '自动降级' || str === '复核型结果') return '复核型结果';
  return '复核型结果';
};

const buildSelectionQualityLead = (
  baseState: string,
  targetState: string,
): string => {
  const baseSummary = getSelectionQualitySummaryLabel(baseState);
  const targetSummary = getSelectionQualitySummaryLabel(targetState);

  if (baseState === 'original' && targetState !== 'original') {
    return `目标版本已从${baseSummary}进入${targetSummary}，当前更适合按复核型结果理解。`;
  }
  if (baseState !== 'original' && targetState === 'original') {
    return `目标版本已从${baseSummary}回到${targetSummary}，可以重新按普通结果理解主题强度。`;
  }
  if (baseState !== targetState) {
    return `两版结果语境发生切换，运行强度由 ${baseState} 变为 ${targetState}。`;
  }
  if (targetState !== 'original') {
    return `两版都属于${targetSummary}，重点关注降级强度、偏置收缩和执行约束变化。`;
  }
  return '两版都属于普通结果，重点关注模板构造、输入条件和执行质量变化。';
};

const extractSelectionQualityState = (snapshot: SnapshotLike): string => {
  const payload = snapshot?.payload ?? {};
  const overlay = (payload.allocation_overlay ?? {}) as Record<string, unknown>;
  const templateMeta = (payload.template_meta ?? {}) as Record<string, unknown>;
  const selectionQuality = (overlay.selection_quality ?? templateMeta.selection_quality ?? {}) as SelectionQualityLike;
  return String(selectionQuality?.label ?? templateMeta.selection_quality ?? '-');
};

const buildCrossMarketLead = (
  baseSnapshot: SnapshotLike,
  targetSnapshot: SnapshotLike,
): string => {
  const baseState = extractSelectionQualityState(baseSnapshot);
  const targetState = extractSelectionQualityState(targetSnapshot);
  return buildSelectionQualityLead(baseState, targetState);
};

// ---------------------------------------------------------------------------
// Public API — only returns { lead } (the subset GodEye consumes).
// Returns null if either snapshot is missing (matching original behaviour).
// ---------------------------------------------------------------------------

export const buildSnapshotComparison = (
  taskType: string,
  baseSnapshot: SnapshotLike | null | undefined,
  targetSnapshot: SnapshotLike | null | undefined,
): ComparisonResult | null => {
  if (!baseSnapshot || !targetSnapshot) {
    return null;
  }

  // For cross_market tasks: compute and expose lead.
  // For pricing / macro_mispricing tasks: the original buildPricingComparisonRows
  // does NOT include a `lead` field — accessing .lead returns undefined, which the
  // caller (extractRecentComparisonLead) converts to '' via `|| ''`.
  // We replicate that by returning an object without lead (undefined .lead) only
  // for cross_market; for others return null so .lead is also undefined.
  if (taskType === 'cross_market') {
    return {
      lead: buildCrossMarketLead(baseSnapshot, targetSnapshot),
    };
  }

  // pricing / macro_mispricing / unknown: return null → .lead is undefined → ''
  return null;
};
