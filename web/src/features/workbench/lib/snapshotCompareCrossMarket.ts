// ---------------------------------------------------------------------------
// snapshotCompareCrossMarket — ported from
// frontend/src/components/research-workbench/snapshotCompareCrossMarket.js
//
// REUSE: getGodEyeSourceModeLabel / getGodEyeTemplateTheme / localizeGodEyeText
//        from @/features/godeye/lib/displayLabels
// ---------------------------------------------------------------------------

import {
  formatNumber,
  formatPercent,
  formatSignedDelta,
  extractViewContextMetrics,
  buildDriverTrendRows,
  type ComparisonRow,
} from './snapshotCompareFormatters';
import {
  getGodEyeSourceModeLabel,
  getGodEyeTemplateTheme,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';

const STATE_LABELS: Record<string, string> = {
  aligned: '对齐',
  auto_downgraded: '自动降级',
  balanced: '平衡',
  biweekly: '双周',
  chaotic: '混乱',
  comfortable: '宽松',
  compressed: '收缩',
  elevated: '偏高',
  equal_weight: '等权',
  fragile: '脆弱',
  full: '完整',
  healthy: '健康',
  high: '高',
  low: '低',
  macro_bias: '宏观偏置',
  manageable: '可控',
  moderate: '中等',
  ols_hedge: 'OLS 对冲',
  original: '普通结果',
  robust: '稳健',
  stable: '稳定',
  template_base: '模板基线',
  watch: '观察',
  weekly: '每周',
};

const ALT_CATEGORY_LABELS: Record<string, string> = {
  customs: '海关/贸易',
  inventory: '库存',
  policy: '政策',
  trade: '贸易',
};

const MOMENTUM_LABELS: Record<string, string> = {
  stable: '稳定',
  strengthening: '增强',
  weakening: '走弱',
};

const PROVIDER_LABELS: Record<string, string> = {
  china_stock: 'A股',
  cn_stock: 'A股',
  commodity: '商品',
  crypto: '加密资产',
  us_stock: '美股',
};

const localizeStateValue = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';

  const normalized = raw.toLowerCase();
  return STATE_LABELS[normalized] ?? localizeGodEyeText(raw) ?? raw;
};

const localizeProviderList = (items: string[] = []): string => (
  (items ?? [])
    .map((item) => {
      const raw = String(item ?? '').trim();
      if (!raw) return null;
      const normalized = raw.toLowerCase();
      return PROVIDER_LABELS[normalized] ?? localizeGodEyeText(raw) ?? raw;
    })
    .filter(Boolean)
    .join('、') || '-'
);

const localizeAltTrendHeadline = (items: Array<Record<string, unknown>> = []): string => (
  (items ?? [])
    .slice(0, 2)
    .map((item) => {
      const categoryRaw = String(item?.category ?? '').trim();
      const momentumRaw = String(item?.momentum ?? '').trim();
      const category = ALT_CATEGORY_LABELS[categoryRaw.toLowerCase()] ?? localizeGodEyeText(categoryRaw) ?? '-';
      const momentum = MOMENTUM_LABELS[momentumRaw.toLowerCase()] ?? localizeGodEyeText(momentumRaw) ?? '-';
      return `${category}:${momentum}`;
    })
    .filter(Boolean)
    .join('，') || '-'
);

const getSelectionQualitySummaryLabel = (label: unknown): string => {
  if (!label || label === '-') return '未知结果';
  if (label === 'original' || label === '普通结果') return '普通结果';
  if (label === 'auto_downgraded' || label === '自动降级') return '复核型结果';
  if (label === '复核型结果') return '复核型结果';
  return '复核型结果';
};

export interface CrossMarketMetrics {
  totalReturn: number | null;
  sharpeRatio: number | null;
  coverage: number | null;
  costDrag: number | null;
  turnover: number | null;
  concentrationLevel: string;
  concentrationReason: string;
  liquidityLevel: string;
  maxAdvUsage: number | null;
  marginLevel: string;
  marginUtilization: number | null;
  grossLeverage: number | null;
  betaLevel: string;
  betaValue: number | null;
  betaGap: number | null;
  calendarLevel: string;
  calendarMismatch: number | null;
  macroScore: number | null;
  macroScoreDelta: number | null;
  macroSignalChanged: boolean;
  macroResonance: string;
  policySourceHealth: string;
  policySourceReason: string;
  policySourceFullTextRatio: number | null;
  departmentChaosLabel: string;
  departmentChaosScore: number | null;
  departmentChaosSummary: string;
  departmentChaosTopDepartment: string;
  inputReliability: string;
  inputReliabilityScore: number | null;
  inputReliabilityLead: string;
  inputReliabilityPosture: string;
  inputReliabilityActionHint: string;
  altTrendHeadline: string;
  lotEfficiency: number | null;
  rebalanceCadence: string;
  stressFlag: string;
  routeCount: number | null;
  batchCount: number | null;
  providerHeadline: string;
  venueHeadline: string;
  maxBatchFraction: number | null;
  baseRecommendationScore: number | null;
  recommendationScore: number | null;
  baseRecommendationTier: string;
  recommendationTier: string;
  rankingPenalty: number | null;
  rankingPenaltyReason: string;
  selectionQualityState: string;
  selectionQualityLabel: string;
  selectionQualityReason: string;
  theme: string;
  resonanceReason: string;
  allocationMode: string;
  biasStrengthRaw: number | null;
  biasSummary: string;
  biasScale: number | null;
  biasQualityLabel: string;
  biasQualityReason: string;
  departmentChaosConstructionLabel: string;
  departmentChaosRiskBudgetScale: number | null;
  departmentChaosConstructionReason: string;
  peopleFragilityConstructionLabel: string;
  peopleFragilityRiskBudgetScale: number | null;
  peopleFragilityConstructionReason: string;
  structuralDecayRadarConstructionLabel: string;
  structuralDecayRadarRiskBudgetScale: number | null;
  structuralDecayRadarConstructionReason: string;
  biasStrengthEffective: number | null;
  biasCompressionEffect: number | null;
  biasCompressionRatio: number | null;
  compressedAssets: string;
  topCompressedAsset: string;
  coreLegPressure: string;
  coreLegPressureSummary: string;
  maxDeltaWeight: number | null;
  constraintBindingCount: number | null;
  constraintMaxDeltaWeight: number | null;
  dominantDriverHeadline: string;
  dominantDrivers: Array<Record<string, unknown>>;
  driverSummary: Array<Record<string, unknown>>;
  themeCore: string;
  themeSupport: string;
  policyExecutionLabel: string;
  policyExecutionRiskBudgetScale: number | null;
  policyExecutionReason: string;
  sourceModeLabel: string;
  sourceModeReason: string;
  constructionMode: string;
  viewContextSummary: string;
  viewContextTask: string;
}

export const extractCrossMarketMetrics = (snapshot: Record<string, unknown> | null | undefined): CrossMarketMetrics => {
  const payload = (snapshot?.payload ?? {}) as Record<string, unknown>;
  const execution = (payload.execution_diagnostics ?? {}) as Record<string, unknown>;
  const executionPlan = (payload.execution_plan ?? {}) as Record<string, unknown>;
  const templateMeta = (payload.template_meta ?? {}) as Record<string, unknown>;
  const alignment = (payload.data_alignment ?? {}) as Record<string, unknown>;
  const overlay = (payload.allocation_overlay ?? {}) as Record<string, unknown>;
  const selectionQuality = (overlay.selection_quality ?? templateMeta.selection_quality ?? {}) as Record<string, unknown>;
  const inputReliabilityOverlay = (overlay.input_reliability ?? templateMeta.input_reliability ?? {}) as Record<string, unknown>;
  const constraintOverlay = (payload.constraint_overlay ?? {}) as Record<string, unknown>;
  const hedgePortfolio = (payload.hedge_portfolio ?? {}) as Record<string, unknown>;
  const researchInput = (payload.research_input ?? {}) as Record<string, unknown>;
  const researchMacro = (researchInput.macro ?? {}) as Record<string, unknown>;
  const researchAlt = (researchInput.alt_data ?? {}) as Record<string, unknown>;
  const resonance = (researchMacro.resonance ?? {}) as Record<string, unknown>;
  const policySourceHealth = (researchMacro.policy_source_health ?? {}) as Record<string, unknown>;
  const departmentChaos = (researchMacro.department_chaos ?? {}) as Record<string, unknown>;
  const topDepartments = (departmentChaos.top_departments as Array<Record<string, unknown>>) ?? [];
  const inputReliability = (researchMacro.input_reliability ?? {}) as Record<string, unknown>;
  const betaNeutrality = (hedgePortfolio.beta_neutrality ?? {}) as Record<string, unknown>;
  const calendarDiagnostics = (alignment.calendar_diagnostics ?? {}) as Record<string, unknown>;
  const compressionSummary = (overlay.compression_summary ?? {}) as Record<string, unknown>;
  const overlayRows = (overlay.rows as Array<Record<string, unknown>>) ?? [];
  const venueAllocation = (executionPlan.venue_allocation as Array<Record<string, unknown>>) ?? [];

  const topCompressedAsset = overlayRows
    .slice().sort((l, r) => Math.abs(Number(r.compression_delta ?? 0)) - Math.abs(Number(l.compression_delta ?? 0)))
    .map((item) => Math.abs(Number(item.compression_delta ?? 0)) >= 0.005
      ? `${item.symbol} ${(Math.abs(Number(item.compression_delta ?? 0)) * 100).toFixed(2)}pp`
      : null)
    .find(Boolean) ?? '-';

  return {
    totalReturn: (payload.total_return ?? null) as number | null,
    sharpeRatio: (payload.sharpe_ratio ?? null) as number | null,
    coverage: (alignment.tradable_day_ratio ?? null) as number | null,
    costDrag: (execution.cost_drag ?? null) as number | null,
    turnover: (execution.turnover ?? null) as number | null,
    concentrationLevel: localizeStateValue(execution.concentration_level ?? '-'),
    concentrationReason: localizeGodEyeText(String(execution.concentration_reason ?? '-')) || '-',
    liquidityLevel: localizeStateValue(execution.liquidity_level ?? '-'),
    maxAdvUsage: (execution.max_adv_usage ?? null) as number | null,
    marginLevel: localizeStateValue(execution.margin_level ?? '-'),
    marginUtilization: (execution.margin_utilization ?? null) as number | null,
    grossLeverage: (execution.gross_leverage ?? null) as number | null,
    betaLevel: localizeStateValue(execution.beta_level ?? '-'),
    betaValue: (betaNeutrality.beta ?? null) as number | null,
    betaGap: (betaNeutrality.beta_gap ?? null) as number | null,
    calendarLevel: localizeStateValue(execution.calendar_level ?? '-'),
    calendarMismatch: (calendarDiagnostics.max_mismatch_ratio ?? null) as number | null,
    macroScore: (researchMacro.macro_score ?? null) as number | null,
    macroScoreDelta: (researchMacro.macro_score_delta ?? null) as number | null,
    macroSignalChanged: Boolean(researchMacro.macro_signal_changed),
    macroResonance: localizeGodEyeText(String(resonance.label ?? templateMeta.resonance_label ?? '-')) || '-',
    policySourceHealth: localizeStateValue(policySourceHealth.label ?? '-'),
    policySourceReason: localizeGodEyeText(String(policySourceHealth.reason ?? '-')) || '-',
    policySourceFullTextRatio: (policySourceHealth.avg_full_text_ratio ?? null) as number | null,
    departmentChaosLabel: localizeStateValue(departmentChaos.label ?? '-'),
    departmentChaosScore: (departmentChaos.avg_chaos_score ?? null) as number | null,
    departmentChaosSummary: localizeGodEyeText(String(departmentChaos.summary ?? '-')) || '-',
    departmentChaosTopDepartment: localizeGodEyeText(String(topDepartments[0]?.department ?? ''))
      || String(topDepartments[0]?.department_label ?? '') || '-',
    inputReliability: localizeStateValue(inputReliability.label ?? '-'),
    inputReliabilityScore: (inputReliability.score ?? null) as number | null,
    inputReliabilityLead: localizeGodEyeText(String(inputReliability.lead ?? '-')) || '-',
    inputReliabilityPosture: localizeGodEyeText(
      String(inputReliabilityOverlay.posture ?? inputReliability.posture ?? '-')
    ) || '-',
    inputReliabilityActionHint: localizeGodEyeText(
      String(inputReliabilityOverlay.action_hint ?? (templateMeta.input_reliability as Record<string, unknown>)?.action_hint ?? '-')
    ) || '-',
    altTrendHeadline: localizeAltTrendHeadline((researchAlt.top_categories as Array<Record<string, unknown>>) ?? []),
    lotEfficiency: (execution.lot_efficiency ?? null) as number | null,
    rebalanceCadence: localizeStateValue(execution.suggested_rebalance ?? '-'),
    stressFlag: localizeStateValue(execution.stress_test_flag ?? '-'),
    routeCount: (executionPlan.route_count ?? null) as number | null,
    batchCount: Array.isArray(executionPlan.batches) ? (executionPlan.batches as unknown[]).length : null,
    providerHeadline: localizeProviderList(Object.keys((executionPlan.by_provider as Record<string, unknown>) ?? {})),
    venueHeadline: venueAllocation.map((item) => localizeGodEyeText(String(item.key ?? ''))).join('、') || '-',
    maxBatchFraction: (execution.max_batch_fraction ?? executionPlan.max_batch_fraction ?? null) as number | null,
    baseRecommendationScore: (selectionQuality.base_recommendation_score ?? templateMeta.base_recommendation_score ?? null) as number | null,
    recommendationScore: (selectionQuality.effective_recommendation_score ?? templateMeta.recommendation_score ?? null) as number | null,
    baseRecommendationTier: String(selectionQuality.base_recommendation_tier ?? templateMeta.base_recommendation_tier ?? '-'),
    recommendationTier: String(selectionQuality.effective_recommendation_tier ?? templateMeta.recommendation_tier ?? '-'),
    rankingPenalty: (selectionQuality.ranking_penalty ?? templateMeta.ranking_penalty ?? null) as number | null,
    rankingPenaltyReason: localizeGodEyeText(String(selectionQuality.reason ?? templateMeta.ranking_penalty_reason ?? '-')) || '-',
    selectionQualityState: String(selectionQuality.label ?? (templateMeta.selection_quality as Record<string, unknown>)?.label ?? '-'),
    selectionQualityLabel: localizeStateValue(selectionQuality.label ?? (templateMeta.selection_quality as Record<string, unknown>)?.label ?? '-'),
    selectionQualityReason: localizeGodEyeText(String(selectionQuality.reason ?? (templateMeta.selection_quality as Record<string, unknown>)?.reason ?? '-')) || '-',
    theme: getGodEyeTemplateTheme({ id: String(templateMeta.template_id ?? ''), theme: String(templateMeta.theme ?? '') }) || '-',
    resonanceReason: localizeGodEyeText(String(templateMeta.resonance_reason ?? (resonance as Record<string, unknown>).reason ?? '-')) || '-',
    allocationMode: localizeStateValue(templateMeta.allocation_mode ?? '-'),
    biasStrengthRaw: (templateMeta.bias_strength_raw ?? null) as number | null,
    biasSummary: localizeGodEyeText(String(templateMeta.bias_summary ?? '-')) || '-',
    biasScale: (templateMeta.bias_scale ?? null) as number | null,
    biasQualityLabel: localizeStateValue(templateMeta.bias_quality_label ?? '-'),
    biasQualityReason: localizeGodEyeText(String(templateMeta.bias_quality_reason ?? '-')) || '-',
    departmentChaosConstructionLabel: localizeGodEyeText(String(templateMeta.department_chaos_label ?? '-')) || '-',
    departmentChaosRiskBudgetScale: (templateMeta.department_chaos_risk_budget_scale ?? null) as number | null,
    departmentChaosConstructionReason: localizeGodEyeText(String(templateMeta.department_chaos_reason ?? '-')) || '-',
    peopleFragilityConstructionLabel: localizeGodEyeText(String(templateMeta.people_fragility_label ?? '-')) || '-',
    peopleFragilityRiskBudgetScale: (templateMeta.people_fragility_risk_budget_scale ?? null) as number | null,
    peopleFragilityConstructionReason: localizeGodEyeText(String(templateMeta.people_fragility_reason ?? '-')) || '-',
    structuralDecayRadarConstructionLabel: localizeGodEyeText(String(templateMeta.structural_decay_radar_label ?? '-')) || '-',
    structuralDecayRadarRiskBudgetScale: (templateMeta.structural_decay_radar_risk_budget_scale ?? null) as number | null,
    structuralDecayRadarConstructionReason: localizeGodEyeText(String(templateMeta.structural_decay_radar_action_hint ?? '-')) || '-',
    biasStrengthEffective: (templateMeta.bias_strength ?? null) as number | null,
    biasCompressionEffect: (overlay.bias_compression_effect ?? null) as number | null,
    biasCompressionRatio: (compressionSummary.compression_ratio ?? null) as number | null,
    compressedAssets: ((overlay.compressed_assets as string[]) ?? []).join('、') || '-',
    topCompressedAsset,
    coreLegPressure: (templateMeta.core_leg_pressure as Record<string, unknown>)?.affected ? '是' : '否',
    coreLegPressureSummary: localizeGodEyeText(String((templateMeta.core_leg_pressure as Record<string, unknown>)?.summary ?? '-')) || '-',
    maxDeltaWeight: (overlay.max_delta_weight ?? null) as number | null,
    constraintBindingCount: (constraintOverlay.binding_count ?? null) as number | null,
    constraintMaxDeltaWeight: (constraintOverlay.max_delta_weight ?? null) as number | null,
    dominantDriverHeadline: ((templateMeta.dominant_drivers as Array<Record<string, unknown>>) ?? []).map((item) => localizeGodEyeText(String(item.label ?? ''))).join('、') || '-',
    dominantDrivers: (templateMeta.dominant_drivers as Array<Record<string, unknown>>) ?? [],
    driverSummary: ((templateMeta.driver_summary as Array<Record<string, unknown>>) ?? []).map((item) => ({ ...item, label: localizeGodEyeText(String(item.label ?? '')) || String(item.label ?? '') })),
    themeCore: localizeGodEyeText(String(templateMeta.theme_core ?? '-')) || '-',
    themeSupport: localizeGodEyeText(String(templateMeta.theme_support ?? '-')) || '-',
    policyExecutionLabel: localizeStateValue(templateMeta.policy_execution_label ?? '-'),
    policyExecutionRiskBudgetScale: (templateMeta.policy_execution_risk_budget_scale ?? null) as number | null,
    policyExecutionReason: localizeGodEyeText(String(templateMeta.policy_execution_reason ?? '-')) || '-',
    sourceModeLabel: getGodEyeSourceModeLabel({ label: String(templateMeta.source_mode_label ?? '-') }),
    sourceModeReason: localizeGodEyeText(String(templateMeta.source_mode_reason ?? '-')) || '-',
    constructionMode: localizeStateValue(execution.construction_mode ?? (payload.template as Record<string, unknown>)?.construction_mode ?? '-'),
    ...extractViewContextMetrics(payload),
  };
};

const t = (
  base: CrossMarketMetrics,
  target: CrossMarketMetrics,
  key: keyof CrossMarketMetrics,
  label: string,
  changeLabel?: string,
): ComparisonRow => ({
  key: String(key),
  label,
  left: String(base[key] ?? '-'),
  right: String(target[key] ?? '-'),
  delta: String(base[key]) === String(target[key]) ? '不变' : (changeLabel ?? `${String(base[key])} -> ${String(target[key])}`),
});

const buildSelectionQualitySummary = (base: CrossMarketMetrics, target: CrossMarketMetrics): string => {
  const baseLabel = getSelectionQualitySummaryLabel(base.selectionQualityState);
  const targetLabel = getSelectionQualitySummaryLabel(target.selectionQualityState);
  if (base.selectionQualityState === target.selectionQualityState) return `结果语境 ${baseLabel}`;
  return `结果语境 ${baseLabel} -> ${targetLabel}`;
};

const buildSelectionQualityStateSummary = (base: CrossMarketMetrics, target: CrossMarketMetrics): string => {
  const baseLabel = base.selectionQualityLabel || '-';
  const targetLabel = target.selectionQualityLabel || '-';
  if (baseLabel === targetLabel) return `运行强度 ${baseLabel}`;
  return `运行强度 ${baseLabel} -> ${targetLabel}`;
};

export const buildSelectionQualityLead = (base: CrossMarketMetrics, target: CrossMarketMetrics): string => {
  const baseState = base.selectionQualityState || '-';
  const targetState = target.selectionQualityState || '-';
  const baseSummary = getSelectionQualitySummaryLabel(base.selectionQualityState);
  const targetSummary = getSelectionQualitySummaryLabel(target.selectionQualityState);

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

export interface CrossMarketComparisonResult {
  lead: string;
  summary: string[];
  rows: ComparisonRow[];
}

export const buildCrossMarketComparisonRows = (
  base: CrossMarketMetrics,
  target: CrossMarketMetrics,
): CrossMarketComparisonResult => {
  const driverTrendRows = buildDriverTrendRows(
    base.driverSummary as Array<{ key: string; value?: unknown; label?: string }>,
    target.driverSummary as Array<{ key: string; value?: unknown; label?: string }>,
  );
  return {
    lead: buildSelectionQualityLead(base, target),
    summary: [
      buildSelectionQualitySummary(base, target),
      buildSelectionQualityStateSummary(base, target),
      `构造 ${base.constructionMode} -> ${target.constructionMode}`,
      `覆盖率 ${formatPercent(base.coverage)} -> ${formatPercent(target.coverage)}`,
      `执行批次 ${formatNumber(base.batchCount, 0)} -> ${formatNumber(target.batchCount, 0)}`,
      `主导驱动 ${base.dominantDriverHeadline} -> ${target.dominantDriverHeadline}`,
    ],
    rows: [
      { key: 'return', label: '总收益', left: formatPercent(base.totalReturn), right: formatPercent(target.totalReturn), delta: formatSignedDelta(base.totalReturn, target.totalReturn, (v) => formatPercent(v)) },
      { key: 'sharpe', label: '夏普比率', left: formatNumber(base.sharpeRatio), right: formatNumber(target.sharpeRatio), delta: formatSignedDelta(base.sharpeRatio, target.sharpeRatio, (v) => formatNumber(v)) },
      { key: 'coverage', label: '可交易覆盖率', left: formatPercent(base.coverage), right: formatPercent(target.coverage), delta: formatSignedDelta(base.coverage, target.coverage, (v) => formatPercent(v)) },
      { key: 'cost-drag', label: '成本拖累', left: formatPercent(base.costDrag), right: formatPercent(target.costDrag), delta: formatSignedDelta(base.costDrag, target.costDrag, (v) => formatPercent(v)) },
      { key: 'turnover', label: '换手', left: formatNumber(base.turnover), right: formatNumber(target.turnover), delta: formatSignedDelta(base.turnover, target.turnover, (v) => formatNumber(v)) },
      t(base, target, 'constructionMode', '构造方式'),
      t(base, target, 'viewContextSummary', '工作台视图', base.viewContextSummary === target.viewContextSummary ? undefined : '工作台筛选视角已变化'),
      t(base, target, 'viewContextTask', '任务焦点', base.viewContextTask === target.viewContextTask ? undefined : '任务焦点已变化'),
      { key: 'route-count', label: '路由数', left: formatNumber(base.routeCount, 0), right: formatNumber(target.routeCount, 0), delta: formatSignedDelta(base.routeCount, target.routeCount, (v) => formatNumber(v, 0)) },
      { key: 'batch-count', label: '批次数', left: formatNumber(base.batchCount, 0), right: formatNumber(target.batchCount, 0), delta: formatSignedDelta(base.batchCount, target.batchCount, (v) => formatNumber(v, 0)) },
      t(base, target, 'providerHeadline', '执行提供方', base.providerHeadline === target.providerHeadline ? undefined : '已调整'),
      t(base, target, 'venueHeadline', '交易场地', base.venueHeadline === target.venueHeadline ? undefined : '已调整'),
      { key: 'max-batch-fraction', label: '单批上限', left: formatPercent(base.maxBatchFraction), right: formatPercent(target.maxBatchFraction), delta: formatSignedDelta(base.maxBatchFraction, target.maxBatchFraction, (v) => formatPercent(v)) },
      t(base, target, 'concentrationLevel', '集中度'),
      { key: 'lot-efficiency', label: '整手效率', left: formatPercent(base.lotEfficiency), right: formatPercent(target.lotEfficiency), delta: formatSignedDelta(base.lotEfficiency, target.lotEfficiency, (v) => formatPercent(v)) },
      t(base, target, 'liquidityLevel', '流动性'),
      { key: 'max-adv-usage', label: 'ADV 占用上限', left: formatPercent(base.maxAdvUsage), right: formatPercent(target.maxAdvUsage), delta: formatSignedDelta(base.maxAdvUsage, target.maxAdvUsage, (v) => formatPercent(v)) },
      t(base, target, 'marginLevel', '保证金状态'),
      { key: 'margin-utilization', label: '保证金占用', left: formatPercent(base.marginUtilization), right: formatPercent(target.marginUtilization), delta: formatSignedDelta(base.marginUtilization, target.marginUtilization, (v) => formatPercent(v)) },
      { key: 'gross-leverage', label: '总杠杆', left: formatNumber(base.grossLeverage), right: formatNumber(target.grossLeverage), delta: formatSignedDelta(base.grossLeverage, target.grossLeverage, (v) => formatNumber(v)) },
      t(base, target, 'betaLevel', 'Beta 状态'),
      { key: 'beta-value', label: 'Beta 值', left: formatNumber(base.betaValue), right: formatNumber(target.betaValue), delta: formatSignedDelta(base.betaValue, target.betaValue, (v) => formatNumber(v)) },
      { key: 'beta-gap', label: 'Beta 偏离', left: formatNumber(base.betaGap), right: formatNumber(target.betaGap), delta: formatSignedDelta(base.betaGap, target.betaGap, (v) => formatNumber(v)) },
      t(base, target, 'calendarLevel', '日历对齐'),
      { key: 'calendar-mismatch', label: '日历错配', left: formatPercent(base.calendarMismatch), right: formatPercent(target.calendarMismatch), delta: formatSignedDelta(base.calendarMismatch, target.calendarMismatch, (v) => formatPercent(v)) },
      { key: 'macro-score', label: '宏观评分', left: formatNumber(base.macroScore), right: formatNumber(target.macroScore), delta: formatSignedDelta(base.macroScore, target.macroScore, (v) => formatNumber(v)) },
      { key: 'macro-score-delta', label: '宏观变化', left: formatNumber(base.macroScoreDelta), right: formatNumber(target.macroScoreDelta), delta: formatSignedDelta(base.macroScoreDelta, target.macroScoreDelta, (v) => formatNumber(v)) },
      { key: 'macro-signal-changed', label: '宏观信号切换', left: base.macroSignalChanged ? '是' : '否', right: target.macroSignalChanged ? '是' : '否', delta: base.macroSignalChanged === target.macroSignalChanged ? '不变' : '已切换' },
      t(base, target, 'macroResonance', '宏观共振'),
      t(base, target, 'policySourceHealth', '政策源健康'),
      { key: 'policy-source-ratio', label: '政策正文覆盖', left: formatPercent(base.policySourceFullTextRatio), right: formatPercent(target.policySourceFullTextRatio), delta: formatSignedDelta(base.policySourceFullTextRatio, target.policySourceFullTextRatio, (v) => formatPercent(v)) },
      t(base, target, 'policySourceReason', '政策源说明', base.policySourceReason === target.policySourceReason ? undefined : '政策源状态已变化'),
      t(base, target, 'policyExecutionLabel', '政策执行'),
      { key: 'policy-execution-score', label: '政策执行强度', left: formatNumber(base.policyExecutionRiskBudgetScale), right: formatNumber(target.policyExecutionRiskBudgetScale), delta: formatSignedDelta(base.policyExecutionRiskBudgetScale, target.policyExecutionRiskBudgetScale, (v) => formatNumber(v)) },
      t(base, target, 'policyExecutionReason', '政策执行焦点', base.policyExecutionReason === target.policyExecutionReason ? undefined : '政策执行判断已变化'),
      t(base, target, 'sourceModeLabel', '来源治理'),
      t(base, target, 'sourceModeReason', '来源治理构造', base.sourceModeReason === target.sourceModeReason ? undefined : '来源模式已变化'),
      t(base, target, 'departmentChaosLabel', '部门混乱'),
      { key: 'department-chaos-score', label: '部门混乱评分', left: formatNumber(base.departmentChaosScore), right: formatNumber(target.departmentChaosScore), delta: formatSignedDelta(base.departmentChaosScore, target.departmentChaosScore, (v) => formatNumber(v)) },
      t(base, target, 'departmentChaosTopDepartment', '部门焦点', base.departmentChaosTopDepartment === target.departmentChaosTopDepartment ? undefined : '部门焦点已变化'),
      t(base, target, 'departmentChaosSummary', '部门混乱摘要', base.departmentChaosSummary === target.departmentChaosSummary ? undefined : '部门混乱判断已变化'),
      t(base, target, 'inputReliability', '输入可靠度'),
      { key: 'input-reliability-score', label: '输入可靠度评分', left: formatNumber(base.inputReliabilityScore), right: formatNumber(target.inputReliabilityScore), delta: formatSignedDelta(base.inputReliabilityScore, target.inputReliabilityScore, (v) => formatNumber(v)) },
      t(base, target, 'inputReliabilityLead', '输入可靠度说明', base.inputReliabilityLead === target.inputReliabilityLead ? undefined : '输入可靠度判断已变化'),
      t(base, target, 'inputReliabilityPosture', '输入处理姿势', base.inputReliabilityPosture === target.inputReliabilityPosture ? undefined : '输入处理姿势已变化'),
      t(base, target, 'inputReliabilityActionHint', '输入复核动作', base.inputReliabilityActionHint === target.inputReliabilityActionHint ? undefined : '输入复核动作已变化'),
      t(base, target, 'altTrendHeadline', '另类数据趋势', base.altTrendHeadline === target.altTrendHeadline ? undefined : '趋势结构已变'),
      t(base, target, 'rebalanceCadence', '再平衡节奏'),
      t(base, target, 'stressFlag', '压力测试'),
      t(base, target, 'recommendationTier', '推荐层级'),
      { key: 'base-recommendation-score', label: '基础推荐分', left: formatNumber(base.baseRecommendationScore), right: formatNumber(target.baseRecommendationScore), delta: formatSignedDelta(base.baseRecommendationScore, target.baseRecommendationScore, (v) => formatNumber(v)) },
      { key: 'effective-recommendation-score', label: '生效推荐分', left: formatNumber(base.recommendationScore), right: formatNumber(target.recommendationScore), delta: formatSignedDelta(base.recommendationScore, target.recommendationScore, (v) => formatNumber(v)) },
      t(base, target, 'baseRecommendationTier', '基础层级'),
      { key: 'ranking-penalty', label: '排序惩罚', left: formatNumber(base.rankingPenalty), right: formatNumber(target.rankingPenalty), delta: formatSignedDelta(base.rankingPenalty, target.rankingPenalty, (v) => formatNumber(v)) },
      t(base, target, 'selectionQualityLabel', '结果语境'),
      t(base, target, 'selectionQualityReason', '结果语境说明', base.selectionQualityReason === target.selectionQualityReason ? undefined : '自动降级原因已变化'),
      t(base, target, 'rankingPenaltyReason', '排序惩罚原因', base.rankingPenaltyReason === target.rankingPenaltyReason ? undefined : '排序惩罚原因已变化'),
      t(base, target, 'theme', '主题', base.theme === target.theme ? undefined : '已切换'),
      t(base, target, 'resonanceReason', '共振背景', base.resonanceReason === target.resonanceReason ? undefined : '共振背景已变化'),
      t(base, target, 'dominantDriverHeadline', '主导驱动', base.dominantDriverHeadline === target.dominantDriverHeadline ? undefined : '主导叙事已切换'),
      t(base, target, 'themeCore', '主题主腿', base.themeCore === target.themeCore ? undefined : '核心腿已切换'),
      t(base, target, 'themeSupport', '主题辅助腿', base.themeSupport === target.themeSupport ? undefined : '辅助腿已调整'),
      t(base, target, 'allocationMode', '配置模式'),
      { key: 'bias-strength-raw', label: '原始偏置', left: formatNumber(base.biasStrengthRaw), right: formatNumber(target.biasStrengthRaw), delta: formatSignedDelta(base.biasStrengthRaw, target.biasStrengthRaw, (v) => formatNumber(v)) },
      { key: 'bias-strength-effective', label: '生效偏置', left: formatNumber(base.biasStrengthEffective), right: formatNumber(target.biasStrengthEffective), delta: formatSignedDelta(base.biasStrengthEffective, target.biasStrengthEffective, (v) => formatNumber(v)) },
      t(base, target, 'biasSummary', '偏置摘要', base.biasSummary === target.biasSummary ? undefined : '已调整'),
      { key: 'bias-scale', label: '偏置强度', left: formatNumber(base.biasScale), right: formatNumber(target.biasScale), delta: formatSignedDelta(base.biasScale, target.biasScale, (v) => formatNumber(v)) },
      t(base, target, 'biasQualityLabel', '偏置质量'),
      t(base, target, 'biasQualityReason', '偏置质量说明', base.biasQualityReason === target.biasQualityReason ? undefined : '偏置质量已变化'),
      t(base, target, 'departmentChaosConstructionLabel', '部门混乱构造'),
      { key: 'department-chaos-risk-budget', label: '部门风险预算', left: formatNumber(base.departmentChaosRiskBudgetScale), right: formatNumber(target.departmentChaosRiskBudgetScale), delta: formatSignedDelta(base.departmentChaosRiskBudgetScale, target.departmentChaosRiskBudgetScale, (v) => formatNumber(v)) },
      t(base, target, 'departmentChaosConstructionReason', '部门构造原因', base.departmentChaosConstructionReason === target.departmentChaosConstructionReason ? undefined : '部门构造约束已变化'),
      t(base, target, 'peopleFragilityConstructionLabel', '人的维度构造'),
      { key: 'people-fragility-risk-budget', label: '人的维度风险预算', left: formatNumber(base.peopleFragilityRiskBudgetScale), right: formatNumber(target.peopleFragilityRiskBudgetScale), delta: formatSignedDelta(base.peopleFragilityRiskBudgetScale, target.peopleFragilityRiskBudgetScale, (v) => formatNumber(v)) },
      t(base, target, 'peopleFragilityConstructionReason', '人的维度构造原因', base.peopleFragilityConstructionReason === target.peopleFragilityConstructionReason ? undefined : '人的维度构造约束已变化'),
      t(base, target, 'structuralDecayRadarConstructionLabel', '结构衰败雷达'),
      { key: 'structural-decay-radar-risk-budget', label: '结构衰败风险预算', left: formatNumber(base.structuralDecayRadarRiskBudgetScale), right: formatNumber(target.structuralDecayRadarRiskBudgetScale), delta: formatSignedDelta(base.structuralDecayRadarRiskBudgetScale, target.structuralDecayRadarRiskBudgetScale, (v) => formatNumber(v)) },
      t(base, target, 'structuralDecayRadarConstructionReason', '结构衰败说明', base.structuralDecayRadarConstructionReason === target.structuralDecayRadarConstructionReason ? undefined : '结构衰败雷达约束已变化'),
      { key: 'bias-compression-effect', label: '偏置压缩', left: formatNumber(base.biasCompressionEffect), right: formatNumber(target.biasCompressionEffect), delta: formatSignedDelta(base.biasCompressionEffect, target.biasCompressionEffect, (v) => formatNumber(v)) },
      { key: 'bias-compression-ratio', label: '偏置压缩比例', left: formatPercent(base.biasCompressionRatio), right: formatPercent(target.biasCompressionRatio), delta: formatSignedDelta(base.biasCompressionRatio, target.biasCompressionRatio, (v) => formatPercent(v)) },
      t(base, target, 'compressedAssets', '被压缩资产', base.compressedAssets === target.compressedAssets ? undefined : '受影响资产已变化'),
      t(base, target, 'topCompressedAsset', '压缩焦点', base.topCompressedAsset === target.topCompressedAsset ? undefined : '压缩焦点已切换'),
      t(base, target, 'coreLegPressure', '核心腿受压', base.coreLegPressure === target.coreLegPressure ? undefined : '核心腿状态已切换'),
      t(base, target, 'coreLegPressureSummary', '核心腿焦点', base.coreLegPressureSummary === target.coreLegPressureSummary ? undefined : '核心腿压缩焦点已变化'),
      { key: 'max-delta-weight', label: '最大权重偏移', left: formatPercent(base.maxDeltaWeight), right: formatPercent(target.maxDeltaWeight), delta: formatSignedDelta(base.maxDeltaWeight, target.maxDeltaWeight, (v) => formatPercent(v)) },
      { key: 'constraint-binding-count', label: '约束绑定数', left: formatNumber(base.constraintBindingCount, 0), right: formatNumber(target.constraintBindingCount, 0), delta: formatSignedDelta(base.constraintBindingCount, target.constraintBindingCount, (v) => formatNumber(v, 0)) },
      { key: 'constraint-max-shift', label: '约束偏移', left: formatPercent(base.constraintMaxDeltaWeight), right: formatPercent(target.constraintMaxDeltaWeight), delta: formatSignedDelta(base.constraintMaxDeltaWeight, target.constraintMaxDeltaWeight, (v) => formatPercent(v)) },
      ...driverTrendRows,
    ],
  };
};
