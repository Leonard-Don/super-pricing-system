import { buildSnapshotComparison } from '../research-workbench/snapshotCompare';

import { CONSTRUCTION_MODE_LABELS } from './panelConstants';

/**
 * 跨市场回测面板的纯函数 helpers：tier/tone 计算、format/getXXXMeta、
 * 构建 selectionQuality 解释行、review priority 文案、template context payload 构建。
 *
 * 抽离原因：原 CrossMarketBacktestPanel.js line 121-417 全是无副作用的纯函数，
 * 占用 ~300 行。抽出后便于测试和复用。
 */

export const formatConstructionMode = (value) =>
  CONSTRUCTION_MODE_LABELS[value] || value || '未设置';

export const buildDisplayTier = (score) => {
  if (score >= 2.6) return '优先部署';
  if (score >= 1.4) return '重点跟踪';
  return '候选模板';
};

export const buildDisplayTone = (score) => {
  if (score >= 2.6) return 'volcano';
  if (score >= 1.4) return 'gold';
  return 'blue';
};

export const extractRecentComparisonLead = (task = {}) => {
  const history = task?.snapshot_history || [];
  if (history.length < 2 || task?.type !== 'cross_market') {
    return '';
  }
  const [latestSnapshot, previousSnapshot] = history;
  const latestSelectionQuality =
    latestSnapshot?.payload?.allocation_overlay?.selection_quality?.label
    || latestSnapshot?.payload?.template_meta?.selection_quality?.label;
  const previousSelectionQuality =
    previousSnapshot?.payload?.allocation_overlay?.selection_quality?.label
    || previousSnapshot?.payload?.template_meta?.selection_quality?.label;
  if (!latestSelectionQuality && !previousSelectionQuality) {
    return '';
  }
  return buildSnapshotComparison(task.type, history[1], history[0])?.lead || '';
};

export const extractCoreLegPressure = (overlay = {}) => {
  const topCompressed = (overlay.rows || [])
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Number(right?.compression_delta || 0))
        - Math.abs(Number(left?.compression_delta || 0))
    )
    .find((item) => Math.abs(Number(item?.compression_delta || 0)) >= 0.005);
  const symbol = String(topCompressed?.symbol || '').trim().toUpperCase();
  const themeCore = String(overlay.theme_core || '').toUpperCase();
  if (!symbol) {
    return { affected: false, summary: '' };
  }
  return {
    affected: Boolean(themeCore && themeCore.includes(symbol)),
    summary: `${topCompressed.symbol} ${(Math.abs(Number(topCompressed.compression_delta || 0)) * 100).toFixed(2)}pp`,
  };
};

export const formatTradeAction = (value) => {
  const action = String(value || '').toUpperCase();
  if (!action) {
    return '-';
  }

  return action
    .replace('OPEN', '开仓')
    .replace('CLOSE', '平仓')
    .replace('LONG', '多头')
    .replace('SHORT', '空头')
    .replaceAll('_', ' ');
};

export const formatExecutionChannel = (value = '') => {
  const mapping = {
    cash_equity: '现货股票',
    futures: '期货通道',
  };
  return mapping[value] || value || '-';
};

export const formatVenue = (value = '') => {
  const mapping = {
    US_EQUITY: '美股主板',
    US_ETF: '美股 ETF',
    COMEX_CME: 'CME / COMEX',
  };
  return mapping[value] || value || '-';
};

export const getConcentrationMeta = (level = '') => {
  const mapping = {
    high: { color: 'red', label: '高集中' },
    moderate: { color: 'orange', label: '中等集中' },
    balanced: { color: 'green', label: '相对均衡' },
  };
  return mapping[level] || { color: 'default', label: level || '未评估' };
};

export const getCapacityMeta = (band = '') => {
  const mapping = {
    light: { color: 'green', label: '轻量' },
    moderate: { color: 'orange', label: '中等' },
    heavy: { color: 'red', label: '偏重' },
  };
  return mapping[band] || { color: 'default', label: band || '-' };
};

export const getLiquidityMeta = (band = '') => {
  const mapping = {
    comfortable: { color: 'green', label: '流动性舒适' },
    watch: { color: 'orange', label: '需要留意' },
    stretched: { color: 'red', label: '流动性偏紧' },
    unknown: { color: 'default', label: '流动性未知' },
  };
  return mapping[band] || { color: 'default', label: band || '-' };
};

export const getMarginMeta = (level = '') => {
  const mapping = {
    manageable: { color: 'green', label: '保证金可控' },
    elevated: { color: 'orange', label: '保证金偏高' },
    aggressive: { color: 'red', label: '保证金激进' },
  };
  return mapping[level] || { color: 'default', label: level || '-' };
};

export const getBetaMeta = (level = '') => {
  const mapping = {
    balanced: { color: 'green', label: 'Beta 较中性' },
    watch: { color: 'orange', label: 'Beta 需留意' },
    stretched: { color: 'red', label: 'Beta 偏离较大' },
    unknown: { color: 'default', label: 'Beta 未知' },
  };
  return mapping[level] || { color: 'default', label: level || '-' };
};

export const getCointegrationMeta = (level = '') => {
  const mapping = {
    strong: { color: 'green', label: '协整较强' },
    watch: { color: 'orange', label: '协整待确认' },
    weak: { color: 'red', label: '协整偏弱' },
    unknown: { color: 'default', label: '协整未知' },
  };
  return mapping[level] || { color: 'default', label: level || '-' };
};

export const getCalendarMeta = (level = '') => {
  const mapping = {
    aligned: { color: 'green', label: '日历较对齐' },
    watch: { color: 'orange', label: '日历有错位' },
    stretched: { color: 'red', label: '日历错位明显' },
  };
  return mapping[level] || { color: 'default', label: level || '-' };
};

export const getSelectionQualityMeta = (label = '') => {
  const mapping = {
    original: { type: 'info', title: '本次回测沿用原始推荐强度运行' },
    softened: { type: 'warning', title: '本次回测生成复核型结果：基于收缩后的推荐强度运行' },
    auto_downgraded: { type: 'warning', title: '本次回测生成复核型结果：基于自动降级后的推荐强度运行' },
  };
  return mapping[label] || mapping.original;
};

export const getSelectionQualityExplanationLines = (refreshMeta = {}) => {
  const lines = [];
  const runState = refreshMeta?.selectionQualityRunState;
  const shift = refreshMeta?.selectionQualityShift;

  if (runState?.active) {
    const scoreText =
      Number.isFinite(runState.baseScore) || Number.isFinite(runState.effectiveScore)
        ? ` · ${Number(runState.baseScore || 0).toFixed(2)}→${Number(runState.effectiveScore || 0).toFixed(2)}`
        : '';
    lines.push(
      `降级运行 ${runState.label}${scoreText}${runState.reason ? ` · ${runState.reason}` : ''}`
    );
  }

  if (refreshMeta?.selectionQualityDriven && shift?.currentReason) {
    lines.push(`自动降级 ${shift.currentLabel} · ${shift.currentReason}`);
  }

  return lines;
};

export const getReviewPriorityTitleSuffix = (refreshMeta = {}) => {
  if (refreshMeta?.selectionQualityRunState?.active) {
    return '建议优先重看';
  }
  if (refreshMeta?.reviewContextShift?.enteredReview) {
    return '建议按复核结果重看';
  }
  if (refreshMeta?.reviewContextShift?.exitedReview) {
    return '建议确认恢复普通结果';
  }
  if (refreshMeta?.reviewContextDriven) {
    return '建议重新确认结果语境';
  }
  if (refreshMeta?.inputReliabilityShift?.enteredFragile) {
    return '建议先复核输入可靠度';
  }
  if (refreshMeta?.inputReliabilityShift?.recoveredRobust) {
    return '建议确认恢复正常强度';
  }
  if (refreshMeta?.inputReliabilityDriven) {
    return '建议重新确认输入质量';
  }
  return '';
};

export const getReviewPriorityContextLine = (refreshMeta = {}) => {
  if (refreshMeta?.selectionQualityRunState?.active) {
    return '该主题当前保存结果已经在降级强度下运行，默认起点仍保留，但更适合先重看当前任务判断。';
  }
  if (refreshMeta?.reviewContextShift?.actionHint) {
    return refreshMeta.reviewContextShift.actionHint;
  }
  if (refreshMeta?.reviewContextDriven) {
    return '该主题最近两版已发生复核语境切换，默认起点仍保留，但更适合先重看当前任务判断。';
  }
  if (refreshMeta?.inputReliabilityShift?.actionHint) {
    return refreshMeta.inputReliabilityShift.actionHint;
  }
  if (refreshMeta?.inputReliabilityDriven) {
    return '该主题当前整体输入可靠度已经变化，默认起点仍保留，但更适合先确认输入质量再决定是否继续沿用当前模板。';
  }
  return '';
};

export const buildTemplateContextPayload = (template, appliedBiasMeta) => {
  if (!template?.id) {
    return undefined;
  }
  return {
    template_id: template.id,
    template_name: template.name || '',
    theme: template.theme || '',
    allocation_mode: appliedBiasMeta ? 'macro_bias' : 'template_base',
    bias_summary: appliedBiasMeta?.summary || '',
    bias_strength_raw: appliedBiasMeta?.rawStrength || 0,
    bias_strength: appliedBiasMeta?.strength || 0,
    bias_scale: appliedBiasMeta?.scale || 1,
    bias_quality_label: appliedBiasMeta?.qualityLabel || 'full',
    bias_quality_reason: appliedBiasMeta?.qualityReason || '',
    base_recommendation_score: template.baseRecommendationScore ?? template.recommendationScore ?? null,
    recommendation_score: template.recommendationScore ?? null,
    base_recommendation_tier: template.baseRecommendationTier || template.recommendationTier || '',
    recommendation_tier: template.recommendationTier || '',
    ranking_penalty: template.rankingPenalty || 0,
    ranking_penalty_reason: template.rankingPenaltyReason || '',
    input_reliability_label: template.inputReliabilityLabel || 'unknown',
    input_reliability_score: template.inputReliabilityScore ?? null,
    input_reliability_lead: template.inputReliabilityLead || '',
    input_reliability_posture: template.inputReliabilityPosture || '',
    input_reliability_reason: template.inputReliabilityReason || '',
    input_reliability_action_hint: template.refreshMeta?.inputReliabilityShift?.actionHint || '',
    department_chaos_label: template.departmentChaosLabel || 'unknown',
    department_chaos_score: template.departmentChaosScore ?? null,
    department_chaos_top_department: template.departmentChaosTopDepartment || '',
    department_chaos_reason: template.departmentChaosReason || '',
    department_chaos_risk_budget_scale: template.departmentChaosRiskBudgetScale ?? 1,
    policy_execution_label: template.policyExecutionLabel || 'unknown',
    policy_execution_score: template.policyExecutionScore ?? null,
    policy_execution_top_department: template.policyExecutionTopDepartment || '',
    policy_execution_reason: template.policyExecutionReason || '',
    policy_execution_risk_budget_scale: template.policyExecutionRiskBudgetScale ?? 1,
    people_fragility_label: template.peopleFragilityLabel || 'stable',
    people_fragility_score: template.peopleFragilityScore ?? null,
    people_fragility_focus: template.peopleFragilityFocus || '',
    people_fragility_reason: template.peopleFragilityReason || '',
    people_fragility_risk_budget_scale: template.peopleFragilityRiskBudgetScale ?? 1,
    source_mode_label: template.sourceModeLabel || 'mixed',
    source_mode_dominant: template.sourceModeDominant || '',
    source_mode_reason: template.sourceModeReason || '',
    source_mode_risk_budget_scale: template.sourceModeRiskBudgetScale ?? 1,
    structural_decay_radar_label: template.structuralDecayRadarLabel || 'stable',
    structural_decay_radar_display_label: template.structuralDecayRadarDisplayLabel || '',
    structural_decay_radar_score: template.structuralDecayRadarScore ?? null,
    structural_decay_radar_action_hint: template.structuralDecayRadarActionHint || '',
    structural_decay_radar_risk_budget_scale: template.structuralDecayRadarRiskBudgetScale ?? 1,
    structural_decay_radar_top_signals: template.structuralDecayRadarTopSignals || [],
    bias_highlights_raw: appliedBiasMeta?.rawHighlights || [],
    bias_highlights: appliedBiasMeta?.highlights || [],
    bias_actions: template.biasActions || [],
    signal_attribution: template.signalAttribution || [],
    driver_summary: template.driverSummary || [],
    dominant_drivers: template.dominantDrivers || [],
    core_legs: template.coreLegs || [],
    support_legs: template.supportLegs || [],
    theme_core: template.themeCore || '',
    theme_support: template.themeSupport || '',
    execution_posture: template.executionPosture || '',
    base_assets: (template.assets || []).map((asset) => ({
      symbol: asset.symbol,
      asset_class: asset.asset_class,
      side: asset.side,
      weight: asset.weight,
    })),
    raw_bias_assets: (template.rawAdjustedAssets || []).map((asset) => ({
      symbol: asset.symbol,
      asset_class: asset.asset_class,
      side: asset.side,
      weight: asset.weight,
    })),
  };
};
