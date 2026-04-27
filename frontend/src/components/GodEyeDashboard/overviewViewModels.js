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
  localizeGodEyeText,
} from './displayLabels';

const DIMENSION_META = {
  investment_activity: { label: '投资活跃度', group: 'Supply Chain' },
  project_pipeline: { label: '项目管线', group: 'Supply Chain' },
  talent_structure: { label: '人才结构', group: 'Supply Chain' },
  inventory: { label: '库存压力', group: 'Macro HF' },
  trade: { label: '贸易脉冲', group: 'Macro HF' },
  logistics: { label: '物流摩擦', group: 'Macro HF' },
};

const SIGNAL_LABEL = {
  1: '猎杀窗口',
  0: '观察中',
  '-1': '逆风区',
};

const CATEGORY_LABELS = {
  bidding: '招投标',
  env_assessment: '环评/审批',
  hiring: '招聘结构',
  commodity_inventory: '库存',
  customs: '海关/贸易',
  port_congestion: '港口拥堵',
};

const toPercentScale = (value) => {
  const numeric = Number(value || 0);
  return Math.min(100, Math.max(8, Math.abs(numeric) * 40 + 15));
};

const scoreTone = (score, trendDelta = 0) => {
  if (score >= 0.35 || trendDelta >= 0.18) return 'hot';
  if (score <= -0.35 || trendDelta <= -0.18) return 'cold';
  return 'neutral';
};

const buildHeatDisplay = (score, trend, count) => {
  const absScore = Math.abs(Number(score || 0));
  const absTrend = Math.abs(Number(trend?.deltaScore || 0));
  const neutralHint = `综合信号接近中性 · 样本 ${count} 条`;

  if (!count) {
    return {
      value: '样本不足',
      hint: '当前维度暂无足够样本，先看趋势变化。',
    };
  }

  if (absScore >= 0.45) {
    return {
      value: score > 0 ? '显著升温' : '显著承压',
      hint: `原始分 ${Number(score || 0).toFixed(2)} · 样本 ${count} 条`,
    };
  }

  if (absScore >= 0.18 || absTrend >= 0.18) {
    return {
      value: trend?.momentum === 'weakening' ? '轻微走弱' : '轻微升温',
      hint: absScore < 0.05 ? neutralHint : `原始分 ${Number(score || 0).toFixed(2)} · 样本 ${count} 条`,
    };
  }

  return {
    value: '以观察为主',
    hint: absScore < 0.05 ? neutralHint : `原始分 ${Number(score || 0).toFixed(2)} · 样本 ${count} 条`,
  };
};

export const getSignalLabel = (value) => SIGNAL_LABEL[value] || SIGNAL_LABEL[0];

export const buildHeatmapModel = (snapshot = {}, history = {}) => {
  const supplyDimensions = snapshot?.signals?.supply_chain?.dimensions || {};
  const macroDimensions = snapshot?.signals?.macro_hf?.dimensions || {};
  const records = history?.records || [];
  const categoryTrends = history?.category_trends || {};
  const categorySeries = history?.category_series || {};

  const groupCategories = {
    'Supply Chain': ['bidding', 'env_assessment', 'hiring'],
    'Macro HF': ['commodity_inventory', 'customs', 'port_congestion'],
  };

  const buildGroupTrend = (group) => {
    const categories = groupCategories[group] || [];
    const trends = categories
      .map((category) => categoryTrends[category])
      .filter(Boolean);
    const count = trends.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const weightedDeltaTotal = trends.reduce(
      (sum, item) => sum + Number(item.delta_score || 0) * Math.max(Number(item.count || 0), 1),
      0
    );
    const deltaScore = count > 0 ? weightedDeltaTotal / count : 0;
    const momentum =
      deltaScore >= 0.12 ? 'strengthening' : deltaScore <= -0.12 ? 'weakening' : 'stable';
    return {
      deltaScore: Number(deltaScore || 0),
      count,
      momentum,
      categories,
      sparkline: categories.flatMap((category) => categorySeries[category] || []).slice(-6),
    };
  };

  const cells = Object.entries(DIMENSION_META).map(([key, meta]) => {
    const source = supplyDimensions[key] || macroDimensions[key] || {};
    const relatedRecords = records.filter((item) => {
      if (meta.group === 'Supply Chain') {
        return ['bidding', 'env_assessment', 'hiring'].includes(item.category);
      }
      return ['commodity_inventory', 'customs', 'port_congestion'].includes(item.category);
    });
    const trend = buildGroupTrend(meta.group);

    const score = Number(source.score || 0);
    const count = Number(source.count || trend.count || relatedRecords.length || 0);
    const heatDisplay = buildHeatDisplay(score, trend, count);
    return {
      key,
      label: meta.label,
      group: meta.group,
      groupLabel: getGodEyeGroupLabel(meta.group),
      score,
      tone: scoreTone(score, trend.deltaScore),
      count,
      displayValue: heatDisplay.value,
      displayHint: heatDisplay.hint,
      summary: `${getGodEyeGroupLabel(meta.group)} ${trend.momentum === 'strengthening' ? '增强' : trend.momentum === 'weakening' ? '走弱' : '稳定'} · Δ${trend.deltaScore >= 0 ? '+' : ''}${trend.deltaScore.toFixed(2)}`,
      trendDelta: trend.deltaScore,
      momentum: trend.momentum,
    };
  });

  const anomalies = [];
  const supplyAlerts = snapshot?.signals?.supply_chain?.alerts || [];
  supplyAlerts.slice(0, 3).forEach((alert) => {
    anomalies.push({
      key: `supply-alert-${alert.company || 'unknown'}`,
      title: alert.company || '供应链异常',
      description: localizeGodEyeText(alert.message || `稀释比 ${alert.dilution_ratio || 0}`),
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
    .filter(([, trend]) => Math.abs(Number(trend?.delta_score || 0)) >= 0.12)
    .slice(0, 3)
    .forEach(([category, trend]) => {
      anomalies.push({
        key: `trend-${category}`,
        title: `${CATEGORY_LABELS[category] || category} 趋势${trend.momentum === 'strengthening' ? '增强' : '走弱'}`,
        description: `最近窗口 Δ${Number(trend.delta_score || 0) >= 0 ? '+' : ''}${Number(trend.delta_score || 0).toFixed(2)} · 高置信 ${trend.high_confidence_count || 0}`,
        type: trend.momentum === 'strengthening' ? 'hot' : 'cold',
      });
    });

  return { cells, anomalies };
};

export const buildRadarModel = (overview = {}) => {
  const factors = overview?.factors || [];
  return factors.map((factor) => ({
    factor: formatFactorName(factor.name),
    intensity: toPercentScale(factor.z_score || factor.value),
    confidence: Math.min(100, Math.max(10, Number(factor.confidence || 0) * 100)),
    rawValue: Number(factor.value || 0),
    zScore: Number(factor.z_score || 0),
    signal: factor.signal,
  }));
};

export const buildFactorPanelModel = (overview = {}, snapshot = {}) => {
  const factorDeltas = overview?.trend?.factor_deltas || {};
  const factors = (overview?.factors || []).map((factor) => ({
    ...factor,
    displayName: formatFactorName(factor.name),
    trendDelta: Number(factorDeltas[factor.name]?.z_score_delta || 0),
    trendValueDelta: Number(factorDeltas[factor.name]?.value_delta || 0),
    signalChanged: Boolean(factorDeltas[factor.name]?.signal_changed),
    previousSignal: Number(factorDeltas[factor.name]?.previous_signal || 0),
    evidenceSummary: factor?.metadata?.evidence_summary || {},
    action:
      factor.signal === 1
        ? buildCrossMarketAction(
            FACTOR_TEMPLATE_MAP[factor.name],
            'factor_panel',
            `${formatFactorName(factor.name)} 偏向正向扭曲，建议先看跨市场对冲模板`
          )
        : factor.signal === -1
          ? buildPricingAction(
              FACTOR_SYMBOL_MAP[factor.name],
              'factor_panel',
              `${formatFactorName(factor.name)} 偏向负向错价，建议先看单标的定价研究`
            )
          : null,
  }));

  const topFactors = [...factors]
    .sort((a, b) => Math.abs(Number(b.z_score || 0)) - Math.abs(Number(a.z_score || 0)))
    .slice(0, 3);

  return {
    topFactors,
    factors,
    providerHealth: overview?.provider_health || snapshot?.provider_health || {},
    staleness: overview?.data_freshness || snapshot?.staleness || {},
    macroTrend: overview?.trend || {},
    resonanceSummary: overview?.resonance_summary || {},
    evidenceSummary: overview?.evidence_summary || snapshot?.evidence_summary || {},
    confidenceAdjustment: overview?.confidence_adjustment || {},
    inputReliabilitySummary: overview?.input_reliability_summary || snapshot?.input_reliability_summary || {},
    departmentChaosSummary: overview?.department_chaos_summary || {},
    peopleLayerSummary: overview?.people_layer_summary || {},
    primaryAction: topFactors[0]?.action || null,
  };
};

export const buildTimelineModel = (policyHistory = {}) => {
  const records = policyHistory?.records || [];
  return records.map((item) => {
    const raw = item.raw_value || {};
    const shift = Number(raw.policy_shift || 0);
    const tags = Object.keys(raw.industry_impact || {});
    const primaryTag = tags.find((tag) => TAG_SYMBOL_MAP[tag] || TAG_TEMPLATE_MAP[tag]);
    return {
      key: item.record_id,
      title: raw.title || item.source,
      timestamp: item.timestamp,
      source: item.source,
      direction: shift > 0.15 ? 'stimulus' : shift < -0.15 ? 'tightening' : 'neutral',
      directionLabel: shift > 0.15 ? '偏刺激' : shift < -0.15 ? '偏收紧' : '中性',
      tags,
      score: shift,
      confidence: Number(item.confidence || 0),
      details: raw.industry_impact || {},
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
              `${primaryTag} 对应的宏观主题已映射到跨市场模板`
            )
          : null,
    };
  });
};
