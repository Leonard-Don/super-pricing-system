// ---------------------------------------------------------------------------
// snapshotComparePricing — ported from
// frontend/src/components/research-workbench/snapshotComparePricing.js
//
// REUSE: getPriceSourceLabel from @/features/pricing/lib/pricingResearch
//        getGodEyeSourceModeLabel / localizeGodEyeText from @/features/godeye/lib/displayLabels
// ---------------------------------------------------------------------------

import { getPriceSourceLabel } from '@/features/pricing/lib/pricingResearch';
import {
  formatNumber,
  formatPercentPoints,
  formatSignedDelta,
  extractViewContextMetrics,
  type ComparisonRow,
} from './snapshotCompareFormatters';
import {
  getGodEyeSourceModeLabel,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';

const ALIGNMENT_LABELS: Record<string, string> = {
  aligned: '同向',
  conflict: '冲突',
  mixed: '分化',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const POLICY_EXECUTION_LABELS: Record<string, string> = {
  stable: '稳定',
  watch: '观察',
  chaotic: '混乱',
  degraded: '退化',
};

const localizeComparisonValue = (value: unknown, labels: Record<string, string> = {}): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';

  const normalized = raw.toLowerCase();
  return labels[normalized] ?? localizeGodEyeText(raw) ?? raw;
};

const formatSourceModeSummaryLabel = (summary: Record<string, unknown> = {}): string => {
  return getGodEyeSourceModeLabel(summary) || '-';
};

const buildTextDelta = (left: string, right: string, fallbackLabel?: string): string => (
  left === right ? '不变' : (fallbackLabel ?? `${left} -> ${right}`)
);

export interface PricingMetrics {
  fairValueMid: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  gapPct: number | null;
  analysisPeriod: string;
  currentPriceSource: string;
  factorDataPoints: number | null;
  primaryView: string;
  alignmentLabel: string;
  driverHeadline: string;
  confidence: string;
  confidenceScore: number | null;
  scenarioSpread: number | null;
  ff5Alpha: number | null;
  profitability: number | null;
  investment: number | null;
  monteCarloMedian: number | null;
  monteCarloP90: number | null;
  auditPriceSource: string;
  auditBenchmarkSource: string;
  governanceOverlayLabel: string;
  governanceDiscountPct: number | null;
  governanceConfidence: number | null;
  governanceSummary: string;
  executiveEvidence: string;
  insiderEvidence: string;
  hiringEvidence: string;
  peopleLayerSummary: string;
  policyExecutionLabel: string;
  policyExecutionSummary: string;
  policyExecutionTopDepartment: string;
  sourceModeLabel: string;
  sourceModeCoverage: number | null;
  sourceModeSummary: string;
  viewContextSummary: string;
  viewContextTask: string;
}

export const extractPricingMetrics = (snapshot: Record<string, unknown> | null | undefined): PricingMetrics => {
  const payload = (snapshot?.payload ?? {}) as Record<string, unknown>;
  const fairValue = (payload.fair_value ?? {}) as Record<string, unknown>;
  const implications = (payload.implications ?? {}) as Record<string, unknown>;
  const drivers = (payload.drivers as Array<Record<string, unknown>>) ?? [];
  const primaryDriver = (payload.primary_driver ?? drivers[0] ?? {}) as Record<string, unknown>;
  const factorModel = (payload.factor_model ?? {}) as Record<string, unknown>;
  const dcfScenarios = (payload.dcf_scenarios as Array<Record<string, unknown>>) ?? [];
  const bearCase = dcfScenarios.find((item) => item?.name === 'bear') ?? dcfScenarios[0] ?? null;
  const bullCase = dcfScenarios.find((item) => item?.name === 'bull') ?? dcfScenarios[dcfScenarios.length - 1] ?? null;
  const scenarioSpread = bearCase?.intrinsic_value != null && bullCase?.intrinsic_value != null
    ? Number(bullCase.intrinsic_value) - Number(bearCase.intrinsic_value)
    : null;
  const governanceOverlay = (payload.people_governance_overlay ?? {}) as Record<string, unknown>;
  const researchInputMacro = ((payload.research_input as Record<string, unknown>)?.macro ?? {}) as Record<string, unknown>;
  const policyExecutionContext = (governanceOverlay.policy_execution_context ?? researchInputMacro.policy_execution ?? {}) as Record<string, unknown>;
  const sourceModeSummary = (governanceOverlay.source_mode_summary ?? researchInputMacro.source_mode_summary ?? {}) as Record<string, unknown>;
  const peopleLayer = (payload.people_layer ?? researchInputMacro.people_layer ?? {}) as Record<string, unknown>;

  const factorAlignment = (implications.factor_alignment ?? {}) as Record<string, unknown>;
  const gapAnalysis = (payload.gap_analysis ?? {}) as Record<string, unknown>;
  const executiveEvidence = (governanceOverlay.executive_evidence ?? {}) as Record<string, unknown>;
  const insiderEvidence = (governanceOverlay.insider_evidence ?? {}) as Record<string, unknown>;
  const hiringEvidence = (governanceOverlay.hiring_evidence ?? {}) as Record<string, unknown>;
  const executiveProfile = ((peopleLayer.executive_profile ?? {}) as Record<string, unknown>);
  const insiderFlow = ((peopleLayer.insider_flow ?? {}) as Record<string, unknown>);
  const hiringSignal = ((peopleLayer.hiring_signal ?? {}) as Record<string, unknown>);
  const topDepartments = (policyExecutionContext.top_departments as Array<Record<string, unknown>>) ?? [];

  return {
    fairValueMid: (fairValue.mid ?? gapAnalysis.fair_value_mid ?? null) as number | null,
    fairValueLow: (fairValue.low ?? bearCase?.intrinsic_value ?? null) as number | null,
    fairValueHigh: (fairValue.high ?? bullCase?.intrinsic_value ?? null) as number | null,
    gapPct: (gapAnalysis.gap_pct ?? null) as number | null,
    analysisPeriod: String(payload.period ?? factorModel.period ?? '-'),
    currentPriceSource: getPriceSourceLabel(String(payload.current_price_source ?? '')),
    factorDataPoints: (factorModel.data_points ?? null) as number | null,
    primaryView: localizeGodEyeText(String(implications.primary_view ?? '-')) || '-',
    alignmentLabel: localizeComparisonValue(
      String(factorAlignment.label ?? factorAlignment.status ?? '-'),
      ALIGNMENT_LABELS,
    ),
    driverHeadline: localizeGodEyeText(String(primaryDriver.factor ?? primaryDriver.name ?? '-')) || '-',
    confidence: localizeComparisonValue(String(implications.confidence ?? '-'), CONFIDENCE_LABELS),
    confidenceScore: (implications.confidence_score ?? null) as number | null,
    scenarioSpread,
    ff5Alpha: (factorModel.ff5_alpha_pct ?? null) as number | null,
    profitability: (factorModel.ff5_profitability ?? null) as number | null,
    investment: (factorModel.ff5_investment ?? null) as number | null,
    monteCarloMedian: ((payload.monte_carlo as Record<string, unknown>)?.p50 ?? (payload.monte_carlo as Record<string, unknown>)?.median ?? null) as number | null,
    monteCarloP90: ((payload.monte_carlo as Record<string, unknown>)?.p90 ?? null) as number | null,
    auditPriceSource: String((payload.audit_trail as Record<string, unknown>)?.price_source ?? payload.current_price_source ?? ''),
    auditBenchmarkSource: String((payload.audit_trail as Record<string, unknown>)?.comparable_benchmark_source ?? (payload.comparable as Record<string, unknown>)?.benchmark_source ?? '-'),
    governanceOverlayLabel: localizeGodEyeText(String(governanceOverlay.label ?? '-')) || '-',
    governanceDiscountPct: (governanceOverlay.governance_discount_pct ?? null) as number | null,
    governanceConfidence: (governanceOverlay.confidence ?? null) as number | null,
    governanceSummary: localizeGodEyeText(String(governanceOverlay.summary ?? '-')) || '-',
    executiveEvidence:
      localizeGodEyeText(String(executiveEvidence.leadership_balance ?? ''))
      || String(executiveEvidence.summary ?? '')
      || String(executiveProfile.leadership_balance ?? '')
      || '-',
    insiderEvidence:
      localizeGodEyeText(String(insiderEvidence.label ?? ''))
      || String(insiderEvidence.summary ?? '')
      || String(insiderFlow.label ?? '')
      || '-',
    hiringEvidence:
      localizeGodEyeText(String(hiringEvidence.alert_message ?? ''))
      || String(hiringEvidence.signal ?? '')
      || String(hiringSignal.alert_message ?? '')
      || '-',
    peopleLayerSummary: localizeGodEyeText(String(peopleLayer.summary ?? '-')) || '-',
    policyExecutionLabel: localizeComparisonValue(
      String(policyExecutionContext.label ?? policyExecutionContext.execution_status ?? '-'),
      POLICY_EXECUTION_LABELS,
    ),
    policyExecutionSummary: localizeGodEyeText(String(policyExecutionContext.summary ?? '-')) || '-',
    policyExecutionTopDepartment:
      localizeGodEyeText(String(policyExecutionContext.top_department ?? ''))
      || String(topDepartments[0]?.department_label ?? '')
      || String(topDepartments[0]?.department ?? '')
      || '-',
    sourceModeLabel: formatSourceModeSummaryLabel(sourceModeSummary),
    sourceModeCoverage: (sourceModeSummary.coverage ?? null) as number | null,
    sourceModeSummary:
      localizeGodEyeText(String(sourceModeSummary.summary ?? ''))
      || String(sourceModeSummary.fallback_reason ?? '')
      || String(sourceModeSummary.dominant ?? '')
      || '-',
    ...extractViewContextMetrics(payload),
  };
};

export interface PricingComparisonResult {
  summary: string[];
  rows: ComparisonRow[];
}

export const buildPricingComparisonRows = (
  base: PricingMetrics,
  target: PricingMetrics,
): PricingComparisonResult => ({
  summary: [
    `视角 ${base.primaryView} -> ${target.primaryView}`,
    `主驱动 ${base.driverHeadline} -> ${target.driverHeadline}`,
    `情景区间 ${formatNumber(base.fairValueLow)}-${formatNumber(base.fairValueHigh)} -> ${formatNumber(target.fairValueLow)}-${formatNumber(target.fairValueHigh)}`,
    `治理折价 ${formatPercentPoints(base.governanceDiscountPct)} -> ${formatPercentPoints(target.governanceDiscountPct)}`,
  ],
  rows: [
    { key: 'fair-value', label: '公允价值', left: formatNumber(base.fairValueMid), right: formatNumber(target.fairValueMid), delta: formatSignedDelta(base.fairValueMid, target.fairValueMid, (v) => formatNumber(v)) },
    { key: 'fair-value-bear', label: '悲观情景', left: formatNumber(base.fairValueLow), right: formatNumber(target.fairValueLow), delta: formatSignedDelta(base.fairValueLow, target.fairValueLow, (v) => formatNumber(v)) },
    { key: 'fair-value-bull', label: '乐观情景', left: formatNumber(base.fairValueHigh), right: formatNumber(target.fairValueHigh), delta: formatSignedDelta(base.fairValueHigh, target.fairValueHigh, (v) => formatNumber(v)) },
    { key: 'scenario-spread', label: '情景区间', left: formatNumber(base.scenarioSpread), right: formatNumber(target.scenarioSpread), delta: formatSignedDelta(base.scenarioSpread, target.scenarioSpread, (v) => formatNumber(v)) },
    { key: 'gap-pct', label: '价格偏差', left: formatPercentPoints(base.gapPct), right: formatPercentPoints(target.gapPct), delta: formatSignedDelta(base.gapPct, target.gapPct, (v) => formatPercentPoints(v)) },
    { key: 'primary-view', label: '主结论', left: base.primaryView, right: target.primaryView, delta: base.primaryView === target.primaryView ? '不变' : `${base.primaryView} -> ${target.primaryView}` },
    { key: 'workbench-view', label: '工作台视图', left: base.viewContextSummary, right: target.viewContextSummary, delta: base.viewContextSummary === target.viewContextSummary ? '不变' : '工作台筛选视角已变化' },
    { key: 'workbench-task', label: '任务焦点', left: base.viewContextTask, right: target.viewContextTask, delta: base.viewContextTask === target.viewContextTask ? '不变' : '任务焦点已变化' },
    { key: 'driver', label: '主驱动', left: base.driverHeadline, right: target.driverHeadline, delta: base.driverHeadline === target.driverHeadline ? '不变' : '已切换' },
    { key: 'alignment', label: '证据共振', left: base.alignmentLabel, right: target.alignmentLabel, delta: base.alignmentLabel === target.alignmentLabel ? '不变' : `${base.alignmentLabel} -> ${target.alignmentLabel}` },
    {
      key: 'governance-overlay',
      label: '治理覆盖层',
      left: base.governanceOverlayLabel,
      right: target.governanceOverlayLabel,
      delta: buildTextDelta(base.governanceOverlayLabel, target.governanceOverlayLabel, '治理判断已变化'),
    },
    {
      key: 'governance-discount',
      label: '治理折价',
      left: formatPercentPoints(base.governanceDiscountPct),
      right: formatPercentPoints(target.governanceDiscountPct),
      delta: formatSignedDelta(base.governanceDiscountPct, target.governanceDiscountPct, (v) => formatPercentPoints(v)),
    },
    {
      key: 'governance-confidence',
      label: '治理置信度',
      left: formatNumber(base.governanceConfidence),
      right: formatNumber(target.governanceConfidence),
      delta: formatSignedDelta(base.governanceConfidence, target.governanceConfidence, (v) => formatNumber(v)),
    },
    {
      key: 'governance-summary',
      label: '治理摘要',
      left: base.governanceSummary,
      right: target.governanceSummary,
      delta: buildTextDelta(base.governanceSummary, target.governanceSummary, '治理摘要已变化'),
    },
    {
      key: 'people-layer',
      label: '人的维度',
      left: base.peopleLayerSummary,
      right: target.peopleLayerSummary,
      delta: buildTextDelta(base.peopleLayerSummary, target.peopleLayerSummary, '人的维度判断已变化'),
    },
    {
      key: 'executive-evidence',
      label: '管理层证据',
      left: base.executiveEvidence,
      right: target.executiveEvidence,
      delta: buildTextDelta(base.executiveEvidence, target.executiveEvidence, '管理层证据已变化'),
    },
    {
      key: 'insider-evidence',
      label: '内部人证据',
      left: base.insiderEvidence,
      right: target.insiderEvidence,
      delta: buildTextDelta(base.insiderEvidence, target.insiderEvidence, '内部人证据已变化'),
    },
    {
      key: 'hiring-evidence',
      label: '招聘结构证据',
      left: base.hiringEvidence,
      right: target.hiringEvidence,
      delta: buildTextDelta(base.hiringEvidence, target.hiringEvidence, '招聘结构证据已变化'),
    },
    {
      key: 'policy-execution',
      label: '政策执行',
      left: base.policyExecutionLabel,
      right: target.policyExecutionLabel,
      delta: buildTextDelta(base.policyExecutionLabel, target.policyExecutionLabel, '政策执行状态已变化'),
    },
    {
      key: 'policy-execution-focus',
      label: '政策执行焦点',
      left: `${base.policyExecutionTopDepartment} · ${base.policyExecutionSummary}`,
      right: `${target.policyExecutionTopDepartment} · ${target.policyExecutionSummary}`,
      delta: buildTextDelta(
        `${base.policyExecutionTopDepartment} · ${base.policyExecutionSummary}`,
        `${target.policyExecutionTopDepartment} · ${target.policyExecutionSummary}`,
        '政策执行焦点已变化'
      ),
    },
    {
      key: 'source-mode',
      label: '来源治理',
      left: base.sourceModeLabel,
      right: target.sourceModeLabel,
      delta: buildTextDelta(base.sourceModeLabel, target.sourceModeLabel, '来源治理已变化'),
    },
    {
      key: 'source-mode-coverage',
      label: '来源覆盖',
      left: formatNumber(base.sourceModeCoverage, 0),
      right: formatNumber(target.sourceModeCoverage, 0),
      delta: formatSignedDelta(base.sourceModeCoverage, target.sourceModeCoverage, (v) => formatNumber(v, 0)),
    },
    {
      key: 'source-mode-summary',
      label: '来源摘要',
      left: base.sourceModeSummary,
      right: target.sourceModeSummary,
      delta: buildTextDelta(base.sourceModeSummary, target.sourceModeSummary, '来源摘要已变化'),
    },
    { key: 'analysis-period', label: '分析窗口', left: base.analysisPeriod, right: target.analysisPeriod, delta: base.analysisPeriod === target.analysisPeriod ? '不变' : `${base.analysisPeriod} -> ${target.analysisPeriod}` },
    { key: 'price-source', label: '价格来源', left: base.currentPriceSource, right: target.currentPriceSource, delta: base.currentPriceSource === target.currentPriceSource ? '不变' : `${base.currentPriceSource} -> ${target.currentPriceSource}` },
    { key: 'factor-samples', label: '因子样本', left: formatNumber(base.factorDataPoints, 0), right: formatNumber(target.factorDataPoints, 0), delta: formatSignedDelta(base.factorDataPoints, target.factorDataPoints, (v) => formatNumber(v, 0)) },
    { key: 'confidence', label: '置信度', left: base.confidence, right: target.confidence, delta: base.confidence === target.confidence ? '不变' : `${base.confidence} -> ${target.confidence}` },
    { key: 'confidence-score', label: '置信评分', left: formatNumber(base.confidenceScore), right: formatNumber(target.confidenceScore), delta: formatSignedDelta(base.confidenceScore, target.confidenceScore, (v) => formatNumber(v)) },
    { key: 'ff5-alpha', label: 'FF5 α', left: formatNumber(base.ff5Alpha), right: formatNumber(target.ff5Alpha), delta: formatSignedDelta(base.ff5Alpha, target.ff5Alpha, (v) => formatNumber(v)) },
    { key: 'profitability', label: '盈利因子', left: formatNumber(base.profitability), right: formatNumber(target.profitability), delta: formatSignedDelta(base.profitability, target.profitability, (v) => formatNumber(v)) },
    { key: 'investment', label: '投资因子', left: formatNumber(base.investment), right: formatNumber(target.investment), delta: formatSignedDelta(base.investment, target.investment, (v) => formatNumber(v)) },
    { key: 'monte-carlo-median', label: 'Monte Carlo P50', left: formatNumber(base.monteCarloMedian), right: formatNumber(target.monteCarloMedian), delta: formatSignedDelta(base.monteCarloMedian, target.monteCarloMedian, (v) => formatNumber(v)) },
    { key: 'monte-carlo-p90', label: 'Monte Carlo P90', left: formatNumber(base.monteCarloP90), right: formatNumber(target.monteCarloP90), delta: formatSignedDelta(base.monteCarloP90, target.monteCarloP90, (v) => formatNumber(v)) },
    { key: 'benchmark-source', label: '基准来源', left: base.auditBenchmarkSource, right: target.auditBenchmarkSource, delta: base.auditBenchmarkSource === target.auditBenchmarkSource ? '不变' : `${base.auditBenchmarkSource} -> ${target.auditBenchmarkSource}` },
  ],
});
