import {
  formatNumber,
  formatPercent,
  formatSignedDelta,
  extractViewContextMetrics,
  buildDriverTrendRows,
} from './snapshotCompareFormatters';
import {
  getGodEyeSourceModeLabel,
  getGodEyeTemplateTheme,
  localizeGodEyeText,
} from '../GodEyeDashboard/displayLabels';

const STATE_LABELS = {
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

const ALT_CATEGORY_LABELS = {
  customs: '海关/贸易',
  inventory: '库存',
  policy: '政策',
  trade: '贸易',
};

const MOMENTUM_LABELS = {
  stable: '稳定',
  strengthening: '增强',
  weakening: '走弱',
};

const PROVIDER_LABELS = {
  china_stock: 'A股',
  cn_stock: 'A股',
  commodity: '商品',
  crypto: '加密资产',
  us_stock: '美股',
};

const localizeStateValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const normalized = raw.toLowerCase();
  return STATE_LABELS[normalized] || localizeGodEyeText(raw) || raw;
};

const localizeProviderList = (items = []) => (
  (items || [])
    .map((item) => {
      const raw = String(item || '').trim();
      if (!raw) return null;
      const normalized = raw.toLowerCase();
      return PROVIDER_LABELS[normalized] || localizeGodEyeText(raw) || raw;
    })
    .filter(Boolean)
    .join('、') || '-'
);

const localizeAltTrendHeadline = (items = []) => (
  (items || [])
    .slice(0, 2)
    .map((item) => {
      const categoryRaw = String(item?.category || '').trim();
      const momentumRaw = String(item?.momentum || '').trim();
      const category = ALT_CATEGORY_LABELS[categoryRaw.toLowerCase()] || localizeGodEyeText(categoryRaw) || '-';
      const momentum = MOMENTUM_LABELS[momentumRaw.toLowerCase()] || localizeGodEyeText(momentumRaw) || '-';
      return `${category}:${momentum}`;
    })
    .filter(Boolean)
    .join('，') || '-'
);

const getSelectionQualitySummaryLabel = (label) => {
  if (!label || label === '-') return '未知结果';
  if (label === 'original' || label === '普通结果') return '普通结果';
  if (label === 'auto_downgraded' || label === '自动降级') return '复核型结果';
  if (label === '复核型结果') return '复核型结果';
  return '复核型结果';
};

const buildSelectionQualitySummary = (base, target) => {
  const baseLabel = getSelectionQualitySummaryLabel(base.selectionQualityState);
  const targetLabel = getSelectionQualitySummaryLabel(target.selectionQualityState);
  if (base.selectionQualityState === target.selectionQualityState) return `结果语境 ${baseLabel}`;
  return `结果语境 ${baseLabel} -> ${targetLabel}`;
};

const buildSelectionQualityStateSummary = (base, target) => {
  const baseLabel = base.selectionQualityLabel || '-';
  const targetLabel = target.selectionQualityLabel || '-';
  if (baseLabel === targetLabel) return `运行强度 ${baseLabel}`;
  return `运行强度 ${baseLabel} -> ${targetLabel}`;
};

export const buildSelectionQualityLead = (base, target) => {
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

export const extractCrossMarketMetrics = (snapshot) => {
  const payload = snapshot?.payload || {};
  const execution = payload.execution_diagnostics || {};
  const executionPlan = payload.execution_plan || {};
  const templateMeta = payload.template_meta || {};
  const alignment = payload.data_alignment || {};
  const overlay = payload.allocation_overlay || {};
  const selectionQuality = overlay.selection_quality || templateMeta.selection_quality || {};
  const inputReliabilityOverlay = overlay.input_reliability || templateMeta.input_reliability || {};
  const constraintOverlay = payload.constraint_overlay || {};
  const hedgePortfolio = payload.hedge_portfolio || {};
  const researchInput = payload.research_input || {};
  return {
    totalReturn: payload.total_return ?? null,
    sharpeRatio: payload.sharpe_ratio ?? null,
    coverage: alignment.tradable_day_ratio ?? null,
    costDrag: execution.cost_drag ?? null,
    turnover: execution.turnover ?? null,
    concentrationLevel: localizeStateValue(execution.concentration_level || '-'),
    concentrationReason: localizeGodEyeText(execution.concentration_reason || '-') || '-',
    liquidityLevel: localizeStateValue(execution.liquidity_level || '-'),
    maxAdvUsage: execution.max_adv_usage ?? null,
    marginLevel: localizeStateValue(execution.margin_level || '-'),
    marginUtilization: execution.margin_utilization ?? null,
    grossLeverage: execution.gross_leverage ?? null,
    betaLevel: localizeStateValue(execution.beta_level || '-'),
    betaValue: hedgePortfolio.beta_neutrality?.beta ?? null,
    betaGap: hedgePortfolio.beta_neutrality?.beta_gap ?? null,
    calendarLevel: localizeStateValue(execution.calendar_level || '-'),
    calendarMismatch: alignment.calendar_diagnostics?.max_mismatch_ratio ?? null,
    macroScore: researchInput.macro?.macro_score ?? null,
    macroScoreDelta: researchInput.macro?.macro_score_delta ?? null,
    macroSignalChanged: Boolean(researchInput.macro?.macro_signal_changed),
    macroResonance: localizeGodEyeText(researchInput.macro?.resonance?.label || templateMeta.resonance_label || '-') || '-',
    policySourceHealth: localizeStateValue(researchInput.macro?.policy_source_health?.label || '-'),
    policySourceReason: localizeGodEyeText(researchInput.macro?.policy_source_health?.reason || '-') || '-',
    policySourceFullTextRatio: researchInput.macro?.policy_source_health?.avg_full_text_ratio ?? null,
    departmentChaosLabel: localizeStateValue(researchInput.macro?.department_chaos?.label || '-'),
    departmentChaosScore: researchInput.macro?.department_chaos?.avg_chaos_score ?? null,
    departmentChaosSummary: localizeGodEyeText(researchInput.macro?.department_chaos?.summary || '-') || '-',
    departmentChaosTopDepartment: localizeGodEyeText(researchInput.macro?.department_chaos?.top_departments?.[0]?.department)
      || researchInput.macro?.department_chaos?.top_departments?.[0]?.department_label || '-',
    inputReliability: localizeStateValue(researchInput.macro?.input_reliability?.label || '-'),
    inputReliabilityScore: researchInput.macro?.input_reliability?.score ?? null,
    inputReliabilityLead: localizeGodEyeText(researchInput.macro?.input_reliability?.lead || '-') || '-',
    inputReliabilityPosture: localizeGodEyeText(
      inputReliabilityOverlay.posture || researchInput.macro?.input_reliability?.posture || '-'
    ) || '-',
    inputReliabilityActionHint: localizeGodEyeText(
      inputReliabilityOverlay.action_hint || templateMeta.input_reliability?.action_hint || '-'
    ) || '-',
    altTrendHeadline: localizeAltTrendHeadline(researchInput.alt_data?.top_categories || []),
    lotEfficiency: execution.lot_efficiency ?? null,
    rebalanceCadence: localizeStateValue(execution.suggested_rebalance || '-'),
    stressFlag: localizeStateValue(execution.stress_test_flag || '-'),
    routeCount: executionPlan.route_count ?? null,
    batchCount: Array.isArray(executionPlan.batches) ? executionPlan.batches.length : null,
    providerHeadline: localizeProviderList(Object.keys(executionPlan.by_provider || {})),
    venueHeadline: (executionPlan.venue_allocation || []).map((item) => localizeGodEyeText(item.key)).join('、') || '-',
    maxBatchFraction: execution.max_batch_fraction ?? executionPlan.max_batch_fraction ?? null,
    baseRecommendationScore: selectionQuality.base_recommendation_score ?? templateMeta.base_recommendation_score ?? null,
    recommendationScore: selectionQuality.effective_recommendation_score ?? templateMeta.recommendation_score ?? null,
    baseRecommendationTier: selectionQuality.base_recommendation_tier || templateMeta.base_recommendation_tier || '-',
    recommendationTier: selectionQuality.effective_recommendation_tier || templateMeta.recommendation_tier || '-',
    rankingPenalty: selectionQuality.ranking_penalty ?? templateMeta.ranking_penalty ?? null,
    rankingPenaltyReason: localizeGodEyeText(selectionQuality.reason || templateMeta.ranking_penalty_reason || '-') || '-',
    selectionQualityState: selectionQuality.label || templateMeta.selection_quality?.label || '-',
    selectionQualityLabel: localizeStateValue(selectionQuality.label || templateMeta.selection_quality?.label || '-'),
    selectionQualityReason: localizeGodEyeText(selectionQuality.reason || templateMeta.selection_quality?.reason || '-') || '-',
    theme: getGodEyeTemplateTheme({ id: templateMeta.template_id, theme: templateMeta.theme }) || '-',
    resonanceReason: localizeGodEyeText(templateMeta.resonance_reason || researchInput.macro?.resonance?.reason || '-') || '-',
    allocationMode: localizeStateValue(templateMeta.allocation_mode || '-'),
    biasStrengthRaw: templateMeta.bias_strength_raw ?? null,
    biasSummary: localizeGodEyeText(templateMeta.bias_summary || '-') || '-',
    biasScale: templateMeta.bias_scale ?? null,
    biasQualityLabel: localizeStateValue(templateMeta.bias_quality_label || '-'),
    biasQualityReason: localizeGodEyeText(templateMeta.bias_quality_reason || '-') || '-',
    departmentChaosConstructionLabel: localizeGodEyeText(templateMeta.department_chaos_label || '-') || '-',
    departmentChaosRiskBudgetScale: templateMeta.department_chaos_risk_budget_scale ?? null,
    departmentChaosConstructionReason: localizeGodEyeText(templateMeta.department_chaos_reason || '-') || '-',
    peopleFragilityConstructionLabel: localizeGodEyeText(templateMeta.people_fragility_label || '-') || '-',
    peopleFragilityRiskBudgetScale: templateMeta.people_fragility_risk_budget_scale ?? null,
    peopleFragilityConstructionReason: localizeGodEyeText(templateMeta.people_fragility_reason || '-') || '-',
    structuralDecayRadarConstructionLabel: localizeGodEyeText(templateMeta.structural_decay_radar_label || '-') || '-',
    structuralDecayRadarRiskBudgetScale: templateMeta.structural_decay_radar_risk_budget_scale ?? null,
    structuralDecayRadarConstructionReason: localizeGodEyeText(templateMeta.structural_decay_radar_action_hint || '-') || '-',
    biasStrengthEffective: templateMeta.bias_strength ?? null,
    biasCompressionEffect: overlay.bias_compression_effect ?? null,
    biasCompressionRatio: overlay.compression_summary?.compression_ratio ?? null,
    compressedAssets: (overlay.compressed_assets || []).join('、') || '-',
    topCompressedAsset: (overlay.rows || [])
      .slice().sort((l, r) => Math.abs(Number(r.compression_delta || 0)) - Math.abs(Number(l.compression_delta || 0)))
      .map((item) => Math.abs(Number(item.compression_delta || 0)) >= 0.005 ? `${item.symbol} ${(Math.abs(Number(item.compression_delta || 0)) * 100).toFixed(2)}pp` : null)
      .find(Boolean) || '-',
    coreLegPressure: templateMeta.core_leg_pressure?.affected ? '是' : '否',
    coreLegPressureSummary: localizeGodEyeText(templateMeta.core_leg_pressure?.summary || '-') || '-',
    maxDeltaWeight: overlay.max_delta_weight ?? null,
    constraintBindingCount: constraintOverlay.binding_count ?? null,
    constraintMaxDeltaWeight: constraintOverlay.max_delta_weight ?? null,
    dominantDriverHeadline: (templateMeta.dominant_drivers || []).map((item) => localizeGodEyeText(item.label)).join('、') || '-',
    dominantDrivers: templateMeta.dominant_drivers || [],
    driverSummary: (templateMeta.driver_summary || []).map((item) => ({ ...item, label: localizeGodEyeText(item.label) || item.label })),
    themeCore: localizeGodEyeText(templateMeta.theme_core || '-') || '-',
    themeSupport: localizeGodEyeText(templateMeta.theme_support || '-') || '-',
    policyExecutionLabel: localizeStateValue(templateMeta.policy_execution_label || '-'),
    policyExecutionRiskBudgetScale: templateMeta.policy_execution_risk_budget_scale ?? null,
    policyExecutionReason: localizeGodEyeText(templateMeta.policy_execution_reason || '-') || '-',
    sourceModeLabel: getGodEyeSourceModeLabel({ label: templateMeta.source_mode_label || '-' }),
    sourceModeReason: localizeGodEyeText(templateMeta.source_mode_reason || '-') || '-',
    constructionMode: localizeStateValue(execution.construction_mode || payload.template?.construction_mode || '-'),
    ...extractViewContextMetrics(payload),
  };
};

const t = (base, target, key, label, changeLabel) => ({
  key, label, left: base[key], right: target[key],
  delta: base[key] === target[key] ? '不变' : (changeLabel || `${base[key]} -> ${target[key]}`),
});

export const buildCrossMarketComparisonRows = (base, target) => {
  const driverTrendRows = buildDriverTrendRows(base.driverSummary, target.driverSummary);
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
