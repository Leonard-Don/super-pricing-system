// ---------------------------------------------------------------------------
// overviewViewModels — ported from frontend/src/components/GodEyeDashboard/overviewViewModels.js
// Pure logic, no React / antd. Names/signatures/behavior identical to old JS.
// ---------------------------------------------------------------------------

import {
  buildCrossMarketAction,
  buildPricingAction,
  FACTOR_SYMBOL_MAP,
  FACTOR_TEMPLATE_MAP,
  formatFactorName,
  TAG_SYMBOL_MAP,
  TAG_TEMPLATE_MAP,
} from './viewModelShared';
import {
  getGodEyeGroupLabel,
  getGodEyePolicyTitleLabel,
  getGodEyeSourceLabel,
  localizeGodEyeText,
} from './displayLabels';

// ---- Internal constants ----

const DIMENSION_META: Record<string, { label: string; group: string }> = {
  investment_activity: { label: '投资活跃度', group: 'Supply Chain' },
  project_pipeline: { label: '项目管线', group: 'Supply Chain' },
  talent_structure: { label: '人才结构', group: 'Supply Chain' },
  inventory: { label: '库存压力', group: 'Macro HF' },
  trade: { label: '贸易脉冲', group: 'Macro HF' },
  logistics: { label: '物流摩擦', group: 'Macro HF' },
};

const SIGNAL_LABEL: Record<string | number, string> = {
  1: '猎杀窗口',
  0: '观察中',
  '-1': '逆风区',
};

const CATEGORY_LABELS: Record<string, string> = {
  bidding: '招投标',
  env_assessment: '环评/审批',
  hiring: '招聘结构',
  commodity_inventory: '库存',
  customs: '海关/贸易',
  port_congestion: '港口拥堵',
};

// ---- Internal helpers ----

const toPercentScale = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Math.min(100, Math.max(8, Math.abs(numeric) * 40 + 15));
};

const scoreTone = (score: number, trendDelta = 0): string => {
  if (score >= 0.35 || trendDelta >= 0.18) return 'hot';
  if (score <= -0.35 || trendDelta <= -0.18) return 'cold';
  return 'neutral';
};

interface HeatDisplay {
  value: string;
  hint: string;
}

const buildHeatDisplay = (score: unknown, trend: Record<string, unknown>, count: number): HeatDisplay => {
  const absScore = Math.abs(Number(score ?? 0));
  const absTrend = Math.abs(Number(trend?.deltaScore ?? 0));
  const neutralHint = `综合信号接近中性 · 样本 ${count} 条`;

  if (!count) {
    return { value: '样本不足', hint: '当前维度暂无足够样本，先看趋势变化。' };
  }
  if (absScore >= 0.45) {
    return {
      value: Number(score ?? 0) > 0 ? '显著升温' : '显著承压',
      hint: `原始分 ${Number(score ?? 0).toFixed(2)} · 样本 ${count} 条`,
    };
  }
  if (absScore >= 0.18 || absTrend >= 0.18) {
    return {
      value: trend?.momentum === 'weakening' ? '轻微走弱' : '轻微升温',
      hint: absScore < 0.05 ? neutralHint : `原始分 ${Number(score ?? 0).toFixed(2)} · 样本 ${count} 条`,
    };
  }
  return {
    value: '以观察为主',
    hint: absScore < 0.05 ? neutralHint : `原始分 ${Number(score ?? 0).toFixed(2)} · 样本 ${count} 条`,
  };
};

// ---- Exports ----

export const getSignalLabel = (value: number | string | undefined): string =>
  SIGNAL_LABEL[String(value ?? '')] ?? SIGNAL_LABEL[value as number] ?? SIGNAL_LABEL[0];

// ---- buildHeatmapModel ----

export interface HeatmapCell {
  key: string;
  label: string;
  group: string;
  groupLabel: string;
  score: number;
  tone: string;
  count: number;
  displayValue: string;
  displayHint: string;
  summary: string;
  trendDelta: number;
  momentum: string;
}

export interface HeatmapAnomaly {
  key: string;
  title: string;
  description: string;
  type: string;
}

export interface HeatmapModel {
  cells: HeatmapCell[];
  anomalies: HeatmapAnomaly[];
}

export const buildHeatmapModel = (
  snapshot: Record<string, unknown> = {},
  history: Record<string, unknown> = {},
): HeatmapModel => {
  const supplyDimensions =
    (((snapshot?.signals as Record<string, unknown>)?.supply_chain as Record<string, unknown>)?.dimensions as Record<string, unknown>) ?? {};
  const macroDimensions =
    (((snapshot?.signals as Record<string, unknown>)?.macro_hf as Record<string, unknown>)?.dimensions as Record<string, unknown>) ?? {};
  const records = (history?.records as Array<Record<string, unknown>>) ?? [];
  const categoryTrends = (history?.category_trends as Record<string, Record<string, unknown>>) ?? {};
  const categorySeries = (history?.category_series as Record<string, unknown[]>) ?? {};

  const groupCategories: Record<string, string[]> = {
    'Supply Chain': ['bidding', 'env_assessment', 'hiring'],
    'Macro HF': ['commodity_inventory', 'customs', 'port_congestion'],
  };

  const buildGroupTrend = (group: string): Record<string, unknown> => {
    const categories = groupCategories[group] ?? [];
    const trends = categories.map((category) => categoryTrends[category]).filter(Boolean);
    const count = trends.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const weightedDeltaTotal = trends.reduce(
      (sum, item) => sum + Number(item.delta_score ?? 0) * Math.max(Number(item.count ?? 0), 1),
      0
    );
    const deltaScore = count > 0 ? weightedDeltaTotal / count : 0;
    const momentum = deltaScore >= 0.12 ? 'strengthening' : deltaScore <= -0.12 ? 'weakening' : 'stable';
    return {
      deltaScore: Number(deltaScore ?? 0),
      count,
      momentum,
      categories,
      sparkline: categories.flatMap((category) => categorySeries[category] ?? []).slice(-6),
    };
  };

  const cells: HeatmapCell[] = Object.entries(DIMENSION_META).map(([key, meta]) => {
    const source = (supplyDimensions[key] as Record<string, unknown>) ??
      (macroDimensions[key] as Record<string, unknown>) ?? {};
    const relatedRecords = records.filter((item) => {
      if (meta.group === 'Supply Chain') {
        return ['bidding', 'env_assessment', 'hiring'].includes(item.category as string);
      }
      return ['commodity_inventory', 'customs', 'port_congestion'].includes(item.category as string);
    });
    const trend = buildGroupTrend(meta.group);

    const score = Number(source.score ?? 0);
    const count = Number(source.count ?? (trend.count as number) ?? relatedRecords.length ?? 0);
    const heatDisplay = buildHeatDisplay(score, trend as Record<string, unknown>, count);
    return {
      key,
      label: meta.label,
      group: meta.group,
      groupLabel: getGodEyeGroupLabel(meta.group),
      score,
      tone: scoreTone(score, trend.deltaScore as number),
      count,
      displayValue: heatDisplay.value,
      displayHint: heatDisplay.hint,
      summary: `${getGodEyeGroupLabel(meta.group)} ${trend.momentum === 'strengthening' ? '增强' : trend.momentum === 'weakening' ? '走弱' : '稳定'} · Δ${(trend.deltaScore as number) >= 0 ? '+' : ''}${(trend.deltaScore as number).toFixed(2)}`,
      trendDelta: trend.deltaScore as number,
      momentum: trend.momentum as string,
    };
  });

  const anomalies: HeatmapAnomaly[] = [];
  const supplyAlerts =
    (((snapshot?.signals as Record<string, unknown>)?.supply_chain as Record<string, unknown>)?.alerts as Array<Record<string, unknown>>) ?? [];
  supplyAlerts.slice(0, 3).forEach((alert) => {
    anomalies.push({
      key: `supply-alert-${(alert.company as string) || 'unknown'}`,
      title: (alert.company as string) || '供应链异常',
      description: localizeGodEyeText((alert.message as string) || `稀释比 ${(alert.dilution_ratio as number) ?? 0}`),
      type: 'alert',
    });
  });

  cells
    .filter((cell) => Math.abs(cell.score) >= 0.3)
    .slice(0, 3)
    .forEach((cell) => {
      anomalies.push({
        key: `heat-${cell.key}`,
        title: `${cell.label}出现显著偏移`,
        description: `${cell.groupLabel} 原始分 ${cell.score.toFixed(3)} · ${cell.momentum === 'strengthening' ? '增强' : cell.momentum === 'weakening' ? '走弱' : '稳定'} ${cell.trendDelta >= 0 ? '+' : ''}${cell.trendDelta.toFixed(2)}`,
        type: cell.tone,
      });
    });

  Object.entries(categoryTrends)
    .filter(([, trend]) => Math.abs(Number(trend?.delta_score ?? 0)) >= 0.12)
    .slice(0, 3)
    .forEach(([category, trend]) => {
      anomalies.push({
        key: `trend-${category}`,
        title: `${CATEGORY_LABELS[category] ?? category} 趋势${trend.momentum === 'strengthening' ? '增强' : '走弱'}`,
        description: `最近窗口 Δ${Number(trend.delta_score ?? 0) >= 0 ? '+' : ''}${Number(trend.delta_score ?? 0).toFixed(2)} · 高置信 ${(trend.high_confidence_count as number) ?? 0}`,
        type: trend.momentum === 'strengthening' ? 'hot' : 'cold',
      });
    });

  return { cells, anomalies };
};

// ---- buildRadarModel ----

export interface RadarItem {
  factor: string;
  intensity: number;
  confidence: number;
  rawValue: number;
  zScore: number;
  signal: unknown;
}

export const buildRadarModel = (overview: Record<string, unknown> = {}): RadarItem[] => {
  const factors = (overview?.factors as Array<Record<string, unknown>>) ?? [];
  return factors.map((factor) => ({
    factor: formatFactorName(factor.name as string),
    intensity: toPercentScale(factor.z_score ?? factor.value),
    confidence: Math.min(100, Math.max(10, Number(factor.confidence ?? 0) * 100)),
    rawValue: Number(factor.value ?? 0),
    zScore: Number(factor.z_score ?? 0),
    signal: factor.signal,
  }));
};

// ---- buildFactorPanelModel ----

export interface FactorPanelFactor extends Record<string, unknown> {
  displayName: string;
  trendDelta: number;
  trendValueDelta: number;
  signalChanged: boolean;
  previousSignal: number;
  evidenceSummary: Record<string, unknown>;
  action: ReturnType<typeof buildCrossMarketAction> | ReturnType<typeof buildPricingAction> | null;
}

export interface FactorPanelModel {
  topFactors: FactorPanelFactor[];
  factors: FactorPanelFactor[];
  providerHealth: Record<string, unknown>;
  staleness: Record<string, unknown>;
  macroTrend: Record<string, unknown>;
  resonanceSummary: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  confidenceAdjustment: Record<string, unknown>;
  inputReliabilitySummary: Record<string, unknown>;
  departmentChaosSummary: Record<string, unknown>;
  peopleLayerSummary: Record<string, unknown>;
  primaryAction: ReturnType<typeof buildCrossMarketAction> | ReturnType<typeof buildPricingAction> | null;
}

export const buildFactorPanelModel = (
  overview: Record<string, unknown> = {},
  snapshot: Record<string, unknown> = {},
): FactorPanelModel => {
  const factorDeltas = ((overview?.trend as Record<string, unknown>)?.factor_deltas as Record<string, Record<string, unknown>>) ?? {};
  const rawFactors = (overview?.factors as Array<Record<string, unknown>>) ?? [];

  const factors: FactorPanelFactor[] = rawFactors.map((factor) => {
    const delta = factorDeltas[factor.name as string] ?? {};
    const action =
      factor.signal === 1
        ? buildCrossMarketAction(
            FACTOR_TEMPLATE_MAP[factor.name as string],
            'factor_panel',
            `${formatFactorName(factor.name as string)} 偏向正向扭曲，建议先看跨市场对冲方案`
          )
        : factor.signal === -1
          ? buildPricingAction(
              FACTOR_SYMBOL_MAP[factor.name as string],
              'factor_panel',
              `${formatFactorName(factor.name as string)} 偏向负向错价，建议先看单标的定价研究`
            )
          : null;
    return {
      ...factor,
      displayName: formatFactorName(factor.name as string),
      trendDelta: Number(delta.z_score_delta ?? 0),
      trendValueDelta: Number(delta.value_delta ?? 0),
      signalChanged: Boolean(delta.signal_changed),
      previousSignal: Number(delta.previous_signal ?? 0),
      evidenceSummary: ((factor?.metadata as Record<string, unknown>)?.evidence_summary as Record<string, unknown>) ?? {},
      action,
    };
  });

  const topFactors = [...factors]
    .sort((a, b) => Math.abs(Number(b.z_score ?? 0)) - Math.abs(Number(a.z_score ?? 0)))
    .slice(0, 3);

  return {
    topFactors,
    factors,
    providerHealth: ((overview?.provider_health as Record<string, unknown>) ?? (snapshot?.provider_health as Record<string, unknown>)) ?? {},
    staleness: ((overview?.data_freshness as Record<string, unknown>) ?? (snapshot?.staleness as Record<string, unknown>)) ?? {},
    macroTrend: (overview?.trend as Record<string, unknown>) ?? {},
    resonanceSummary: (overview?.resonance_summary as Record<string, unknown>) ?? {},
    evidenceSummary: ((overview?.evidence_summary as Record<string, unknown>) ?? (snapshot?.evidence_summary as Record<string, unknown>)) ?? {},
    confidenceAdjustment: (overview?.confidence_adjustment as Record<string, unknown>) ?? {},
    inputReliabilitySummary: ((overview?.input_reliability_summary as Record<string, unknown>) ?? (snapshot?.input_reliability_summary as Record<string, unknown>)) ?? {},
    departmentChaosSummary: (overview?.department_chaos_summary as Record<string, unknown>) ?? {},
    peopleLayerSummary: (overview?.people_layer_summary as Record<string, unknown>) ?? {},
    primaryAction: topFactors[0]?.action ?? null,
  };
};

// ---- buildTimelineModel ----

export interface TimelineItem {
  key: string;
  title: string;
  timestamp: unknown;
  source: string;
  direction: string;
  directionLabel: string;
  tags: string[];
  score: number;
  confidence: number;
  details: Record<string, unknown>;
  primaryAction: ReturnType<typeof buildPricingAction> | null;
  secondaryAction: ReturnType<typeof buildCrossMarketAction> | null;
}

export const buildTimelineModel = (policyHistory: Record<string, unknown> = {}): TimelineItem[] => {
  const records = (policyHistory?.records as Array<Record<string, unknown>>) ?? [];
  return records.map((item) => {
    const raw = (item.raw_value as Record<string, unknown>) ?? {};
    const shift = Number(raw.policy_shift ?? 0);
    const tags = Object.keys((raw.industry_impact as Record<string, unknown>) ?? {});
    const primaryTag = tags.find((tag) => TAG_SYMBOL_MAP[tag] || TAG_TEMPLATE_MAP[tag]);
    return {
      key: item.record_id as string,
      title: getGodEyePolicyTitleLabel((raw.title as string) || (item.source as string)),
      timestamp: item.timestamp,
      source: getGodEyeSourceLabel(item.source as string),
      direction: shift > 0.15 ? 'stimulus' : shift < -0.15 ? 'tightening' : 'neutral',
      directionLabel: shift > 0.15 ? '偏刺激' : shift < -0.15 ? '偏收紧' : '中性',
      tags: tags.map((tag) => localizeGodEyeText(tag)),
      score: shift,
      confidence: Number(item.confidence ?? 0),
      details: (raw.industry_impact as Record<string, unknown>) ?? {},
      primaryAction:
        primaryTag && TAG_SYMBOL_MAP[primaryTag]
          ? buildPricingAction(
              TAG_SYMBOL_MAP[primaryTag],
              'policy_timeline',
              `${primaryTag} 受到政策影响，建议先做定价研究`
            )
          : null,
      secondaryAction:
        primaryTag && TAG_TEMPLATE_MAP[primaryTag]
          ? buildCrossMarketAction(
              TAG_TEMPLATE_MAP[primaryTag],
              'policy_timeline',
              `${primaryTag} 对应的宏观主题已映射到跨市场方案`
            )
          : null,
    };
  });
};
