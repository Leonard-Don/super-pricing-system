// ---------------------------------------------------------------------------
// Pure-logic helpers — ported from frontend/src/utils/pricingResearch.js
// No React / antd dependencies.
// ---------------------------------------------------------------------------

export const resolveAnalysisSymbol = (
  input: unknown,
  fallbackSymbol = '',
): string => {
  const candidate = typeof input === 'string' ? input : fallbackSymbol;
  return String(candidate || '').trim().toUpperCase();
};

export const parsePricingUniverseInput = (input = ''): string[] => {
  const seen = new Set<string>();
  return String(input || '')
    .split(/[\s,，;；|]+/g)
    .map((item) => resolveAnalysisSymbol(item))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
};

export const HOT_PRICING_SYMBOLS: { symbol: string; name: string }[] = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta Platforms' },
];

export const SCREENING_PRESETS: {
  key: string;
  label: string;
  symbols: string[];
}[] = [
  {
    key: 'megacap',
    label: '美股巨头',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'],
  },
  {
    key: 'semis',
    label: '半导体',
    symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'QCOM'],
  },
  {
    key: 'growth',
    label: '高增长软件',
    symbols: ['PLTR', 'SNOW', 'CRM', 'NOW', 'SHOP'],
  },
];

interface DriverImpactMeta {
  color: string;
  label: string;
}

const DRIVER_IMPACT_META: Record<string, DriverImpactMeta> = {
  positive: { color: 'green', label: '超额收益' },
  negative: { color: 'red', label: '收益承压' },
  risk: { color: 'orange', label: '系统性风险' },
  defensive: { color: 'blue', label: '防御溢价' },
  style: { color: 'purple', label: '风格暴露' },
  overvalued: { color: 'red', label: '估值溢价' },
  undervalued: { color: 'green', label: '估值折价' },
};

export const getDriverImpactMeta = (impact: string): DriverImpactMeta =>
  DRIVER_IMPACT_META[impact] ?? { color: '#d9d9d9', label: '其他因素' };

export interface SignalStrengthMeta {
  score: number;
  label: string;
  color: string;
}

export const getSignalStrengthMeta = (
  value: unknown,
): SignalStrengthMeta | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }

  if (numeric >= 3) {
    return { score: numeric, label: '强', color: 'red' };
  }
  if (numeric >= 1.5) {
    return { score: numeric, label: '中', color: 'gold' };
  }
  return { score: numeric, label: '弱', color: 'blue' };
};

const PRICE_SOURCE_LABELS: Record<string, string> = {
  live: '实时价格',
  fundamental_current_price: '基本面现价',
  fundamental_regular_market_price: '行情快照价',
  fundamental_previous_close: '前收盘价',
  historical_close: '最近收盘价',
  unavailable: '价格缺失',
};

export const getPriceSourceLabel = (source = ''): string =>
  PRICE_SOURCE_LABELS[source] ?? '价格来源未知';

const CONFIDENCE_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export const getConfidenceLabel = (value: unknown = ''): string =>
  CONFIDENCE_LABELS[String(value ?? '').toLowerCase()] ?? '';

export const getSourceModeLabel = (summary: Record<string, unknown> = {}): string => {
  const label = String(summary?.label ?? '').trim().toLowerCase();
  if (label === 'official-led') {
    return '官方/披露主导';
  }
  if (label === 'fallback-heavy') {
    return '回退源偏多';
  }
  if (label === 'mixed') {
    return '混合来源';
  }
  return String(summary?.dominant ?? '') || '来源待确认';
};

export interface BuildScreeningScoreParams {
  gapPct: unknown;
  confidenceScore: unknown;
  alignmentStatus: unknown;
  primaryView: unknown;
  governanceDiscountPct: unknown;
  governanceConfidence: unknown;
}

export const buildScreeningScore = ({
  gapPct,
  confidenceScore,
  alignmentStatus,
  primaryView,
  governanceDiscountPct,
  governanceConfidence,
}: BuildScreeningScoreParams): number => {
  const baseScore =
    Math.abs(Number(gapPct || 0)) *
    Math.max(Number(confidenceScore || 0), 0.2);
  const alignmentBonus =
    ({
      aligned: 4,
      partial: 1.5,
      neutral: 0,
      conflict: -4,
    } as Record<string, number>)[String(alignmentStatus || '')] ?? 0;
  let viewBonus =
    primaryView === '高估' || primaryView === '低估' ? 2 : 0;
  const governancePenalty =
    Math.max(Number(governanceDiscountPct || 0), 0) *
    Math.max(Number(governanceConfidence || 0), 0.2) *
    0.18;
  const governanceSupport =
    Math.abs(Math.min(Number(governanceDiscountPct || 0), 0)) *
    Math.max(Number(governanceConfidence || 0), 0.2) *
    0.12;
  if (primaryView === '高估') {
    viewBonus += governancePenalty;
  } else if (primaryView === '低估') {
    viewBonus -= governancePenalty;
    viewBonus += governanceSupport;
  }
  return Number(Math.max(baseScore + alignmentBonus + viewBonus, 0).toFixed(2));
};

export interface ActionPostureResult {
  type: 'warning' | 'success' | 'info';
  label: 'review' | 'deploy' | 'observe';
  posture: string;
  title: string;
  actionHint: string;
  reason: string;
}

export interface BuildPricingActionPostureParams {
  gapPct?: unknown;
  confidenceScore?: unknown;
  alignmentStatus?: unknown;
  primaryView?: unknown;
  riskLevel?: unknown;
}

export const buildPricingActionPosture = ({
  gapPct,
  confidenceScore,
  alignmentStatus,
  primaryView,
  riskLevel,
}: BuildPricingActionPostureParams = {}): ActionPostureResult => {
  const numericGap = Math.abs(Number(gapPct || 0));
  const numericConfidence = Number(confidenceScore || 0);
  const normalizedAlignment = String(alignmentStatus || '').toLowerCase();
  const normalizedView = String(primaryView || '').trim();
  const normalizedRisk = String(riskLevel || '').toLowerCase();
  const isDirectionalView =
    normalizedView === '低估' || normalizedView === '高估';

  if (
    normalizedAlignment === 'conflict' ||
    normalizedRisk === 'high' ||
    (isDirectionalView && numericConfidence < 0.45)
  ) {
    return {
      type: 'warning',
      label: 'review',
      posture: '先复核定价假设',
      title: '当前更适合先复核定价逻辑',
      actionHint:
        normalizedView === '低估'
          ? '先复核低估逻辑和关键因子，再决定是否进入买入清单。'
          : normalizedView === '高估'
            ? '先复核高估逻辑和风险边界，再决定是否进入减仓或回避清单。'
            : '先复核估值假设和证据来源，再决定是否继续沿用当前结论。',
      reason:
        normalizedAlignment === 'conflict'
          ? '当前估值方向与因子证据存在冲突。'
          : normalizedRisk === 'high'
            ? '当前风险等级偏高，结果更适合作为复核输入。'
            : '当前置信度偏弱，暂时不适合直接把结论推进到执行层。',
    };
  }

  if (
    isDirectionalView &&
    numericGap >= 15 &&
    numericConfidence >= 0.72 &&
    normalizedAlignment === 'aligned' &&
    normalizedRisk !== 'high'
  ) {
    return {
      type: 'success',
      label: 'deploy',
      posture: '可推进到执行清单',
      title:
        normalizedView === '低估'
          ? '当前可以推进到优先买入清单'
          : '当前可以推进到优先减仓清单',
      actionHint:
        normalizedView === '低估'
          ? '可以把这条标的推进到优先买入清单，并继续围绕目标价和风险边界拆解仓位计划。'
          : '可以把这条标的推进到优先减仓或回避清单，并继续确认风险预算和兑现节奏。',
      reason: `当前偏差 ${numericGap.toFixed(1)}%，且证据共振与置信度都支持这条判断。`,
    };
  }

  return {
    type: 'info',
    label: 'observe',
    posture: '继续观察与跟踪',
    title: '当前更适合继续观察与跟踪',
    actionHint: isDirectionalView
      ? '可以继续跟踪偏差、因子共振和置信度变化，等待更清晰的执行窗口。'
      : '当前更适合把它作为观察名单，而不是立即推进到执行清单。',
    reason: isDirectionalView
      ? `当前偏差 ${numericGap.toFixed(1)}%，但还没到足够清晰的执行状态。`
      : '当前更像是合理定价附近的跟踪结论，适合继续观察而不是立刻动作。',
  };
};

export interface ScreeningRow {
  symbol: string;
  company_name: string;
  sector: string;
  period: string;
  current_price: unknown;
  fair_value: unknown;
  gap_pct: unknown;
  direction: unknown;
  severity: unknown;
  severity_label: unknown;
  primary_view: unknown;
  confidence: unknown;
  confidence_score: unknown;
  factor_alignment_status: unknown;
  factor_alignment_label: unknown;
  factor_alignment_summary: unknown;
  price_source: unknown;
  primary_driver: string;
  primary_driver_reason: string;
  people_governance_discount_pct: unknown;
  people_governance_confidence: unknown;
  people_governance_label: string;
  people_governance_summary: string;
  summary: string;
  screening_score: number;
  rank?: number;
}

export const buildScreeningRowFromAnalysis = (
  analysis: Record<string, unknown>,
  period = '1y',
): ScreeningRow => {
  const gap = (analysis?.gap_analysis as Record<string, unknown>) || {};
  const implications =
    (analysis?.implications as Record<string, unknown>) || {};
  const valuation = (analysis?.valuation as Record<string, unknown>) || {};
  const primaryDriver =
    (
      (analysis?.deviation_drivers as Record<string, unknown>)
        ?.primary_driver as Record<string, unknown>
    ) || null;
  const factorAlignment =
    (implications.factor_alignment as Record<string, unknown>) || {};
  const governanceOverlay =
    (analysis?.people_governance_overlay as Record<string, unknown>) || {};
  return {
    symbol: String(analysis?.symbol || ''),
    company_name: String(valuation.company_name || ''),
    sector: String(valuation.sector || ''),
    period,
    current_price: gap.current_price,
    fair_value: gap.fair_value_mid,
    gap_pct: gap.gap_pct,
    direction: gap.direction,
    severity: gap.severity,
    severity_label: gap.severity_label,
    primary_view: implications.primary_view,
    confidence: implications.confidence,
    confidence_score: implications.confidence_score,
    factor_alignment_status: factorAlignment.status,
    factor_alignment_label: factorAlignment.label,
    factor_alignment_summary: factorAlignment.summary,
    price_source: valuation.current_price_source,
    primary_driver: String(primaryDriver?.factor || ''),
    primary_driver_reason: String(primaryDriver?.ranking_reason || ''),
    people_governance_discount_pct: governanceOverlay.governance_discount_pct,
    people_governance_confidence: governanceOverlay.confidence,
    people_governance_label: String(governanceOverlay.label || ''),
    people_governance_summary: String(governanceOverlay.summary || ''),
    summary: String(analysis?.summary || ''),
    screening_score: buildScreeningScore({
      gapPct: gap.gap_pct,
      confidenceScore: implications.confidence_score,
      alignmentStatus: factorAlignment.status,
      primaryView: implications.primary_view,
      governanceDiscountPct: governanceOverlay.governance_discount_pct,
      governanceConfidence: governanceOverlay.confidence,
    }),
  };
};

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const compareDescendingWithMissingLast = (
  leftValue: number | null,
  rightValue: number | null,
): number => {
  if (leftValue === null && rightValue === null) return 0;
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  return rightValue - leftValue;
};

export interface SortableRow {
  screening_score?: unknown;
  gap_pct?: unknown;
  rank?: number;
  [key: string]: unknown;
}

export const sortScreeningRows = <T extends SortableRow>(
  rows: T[] = [],
): (T & { rank: number })[] =>
  [...rows]
    .sort((left, right) => {
      const scoreOrder = compareDescendingWithMissingLast(
        finiteOrNull(left.screening_score),
        finiteOrNull(right.screening_score),
      );
      if (scoreOrder !== 0) {
        return scoreOrder;
      }
      const leftGap = finiteOrNull(left.gap_pct);
      const rightGap = finiteOrNull(right.gap_pct);
      return compareDescendingWithMissingLast(
        leftGap === null ? null : Math.abs(leftGap),
        rightGap === null ? null : Math.abs(rightGap),
      );
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));

export interface RecentPricingEntry {
  symbol: string;
  task_id: string;
  title: string;
  headline: string;
  summary: string;
  period: string;
  primary_view: string;
  confidence: string;
  confidence_label: string;
  factor_alignment_status: string;
  factor_alignment_label: string;
  primary_driver: string;
  primary_driver_reason: string;
  recent: true;
  updated_at: string;
}

export const buildRecentPricingResearchEntries = (
  tasks: Record<string, unknown>[] = [],
): RecentPricingEntry[] => {
  const entries: RecentPricingEntry[] = [];
  const seen = new Set<string>();

  (tasks || []).forEach((item) => {
    const symbol = resolveAnalysisSymbol(
      (item?.symbol as string) ||
        ((item?.context as Record<string, unknown>)?.symbol as string) ||
        (
          (item?.snapshot as Record<string, unknown>)
            ?.payload as Record<string, unknown>
        )?.symbol,
    );
    if (!symbol || seen.has(symbol)) {
      return;
    }

    const payload =
      ((item?.snapshot as Record<string, unknown>)
        ?.payload as Record<string, unknown>) || {};
    const implications =
      (payload?.implications as Record<string, unknown>) || {};
    const primaryDriver =
      (
        (payload?.deviation_drivers as Record<string, unknown>)
          ?.primary_driver as Record<string, unknown>
      ) || {};
    const factorAlignment =
      (implications?.factor_alignment as Record<string, unknown>) || {};
    const period = String(
      payload?.period ||
        (item?.context as Record<string, unknown>)?.period ||
        (payload?.factor_model as Record<string, unknown>)?.period ||
        '',
    );
    const primaryView = String(
      implications?.primary_view ||
        (payload?.gap_analysis as Record<string, unknown>)?.direction ||
        '',
    );
    const confidence = String(implications?.confidence || '');
    const confidenceLabel = getConfidenceLabel(confidence);

    entries.push({
      symbol,
      task_id: String(item?.id || ''),
      title: String(item?.title || ''),
      headline: String(
        (item?.snapshot as Record<string, unknown>)?.headline || '',
      ),
      summary: String(
        (item?.snapshot as Record<string, unknown>)?.summary || '',
      ),
      period,
      primary_view: primaryView,
      confidence,
      confidence_label: confidenceLabel,
      factor_alignment_status: String(factorAlignment?.status || ''),
      factor_alignment_label: String(factorAlignment?.label || ''),
      primary_driver: String(primaryDriver?.factor || ''),
      primary_driver_reason: String(primaryDriver?.ranking_reason || ''),
      recent: true,
      updated_at: String(
        item?.updated_at ||
          (item?.snapshot as Record<string, unknown>)?.saved_at ||
          item?.created_at ||
          '',
      ),
    });
    seen.add(symbol);
  });

  return entries;
};

export interface MergedPricingSuggestion {
  symbol: string;
  name: string;
  group: string;
  market: string;
  recent: boolean;
  task_id: string;
  primary_view: string;
  confidence: string;
  confidence_label: string;
  factor_alignment_status: string;
  factor_alignment_label: string;
  primary_driver: string;
  primary_driver_reason: string;
  period: string;
  headline: string;
  summary: string;
}

export const mergePricingSuggestions = (
  apiItems: Record<string, unknown>[] = [],
  preferredEntries: (string | Record<string, unknown>)[] = [],
  query = '',
): MergedPricingSuggestion[] => {
  const normalizedQuery = String(query || '').trim().toUpperCase();
  const normalizedPreferred: Record<string, unknown>[] = [];
  const seenPreferred = new Set<string>();
  preferredEntries.forEach((item) => {
    const entry =
      typeof item === 'string'
        ? { symbol: item }
        : (item as Record<string, unknown>) || {};
    const symbol = resolveAnalysisSymbol(entry.symbol);
    if (!symbol || seenPreferred.has(symbol)) {
      return;
    }
    const searchBlob = [
      symbol,
      String(entry.title || '').toUpperCase(),
      String(entry.headline || '').toUpperCase(),
      String(entry.summary || '').toUpperCase(),
    ].join(' ');
    if (normalizedQuery && !searchBlob.includes(normalizedQuery)) {
      return;
    }
    seenPreferred.add(symbol);
    normalizedPreferred.push({
      symbol,
      ...entry,
    });
  });

  const apiBySymbol = new Map<string, Record<string, unknown>>();
  (apiItems || []).forEach((item) => {
    const symbol = resolveAnalysisSymbol(item?.symbol);
    if (!symbol) {
      return;
    }
    apiBySymbol.set(symbol, {
      ...item,
      symbol,
    });
  });

  const merged: MergedPricingSuggestion[] = [];
  const used = new Set<string>();

  normalizedPreferred.forEach((entry) => {
    const symbol = resolveAnalysisSymbol(entry.symbol);
    const apiItem = apiBySymbol.get(symbol);
    merged.push({
      symbol,
      name: String(apiItem?.name || ''),
      group: String(apiItem?.group || '最近研究'),
      market: String(apiItem?.market || ''),
      recent: true,
      task_id: String(entry.task_id || ''),
      primary_view: String(entry.primary_view || ''),
      confidence: String(entry.confidence || ''),
      confidence_label: String(
        entry.confidence_label || getConfidenceLabel(entry.confidence),
      ),
      factor_alignment_status: String(entry.factor_alignment_status || ''),
      factor_alignment_label: String(entry.factor_alignment_label || ''),
      primary_driver: String(entry.primary_driver || ''),
      primary_driver_reason: String(entry.primary_driver_reason || ''),
      period: String(entry.period || ''),
      headline: String(entry.headline || ''),
      summary: String(entry.summary || ''),
    });
    used.add(symbol);
  });

  Array.from(apiBySymbol.values()).forEach((item) => {
    const symbol = String(item.symbol);
    if (used.has(symbol)) {
      return;
    }
    merged.push({
      symbol,
      name: String(item.name || ''),
      group: String(item.group || ''),
      market: String(item.market || ''),
      recent: false,
      task_id: String(item.task_id || ''),
      primary_view: String(item.primary_view || ''),
      confidence: String(item.confidence || ''),
      confidence_label: String(item.confidence_label || ''),
      factor_alignment_status: String(item.factor_alignment_status || ''),
      factor_alignment_label: String(item.factor_alignment_label || ''),
      primary_driver: String(item.primary_driver || ''),
      primary_driver_reason: String(item.primary_driver_reason || ''),
      period: String(item.period || ''),
      headline: String(item.headline || ''),
      summary: String(item.summary || ''),
    });
    used.add(symbol);
  });

  return merged;
};
