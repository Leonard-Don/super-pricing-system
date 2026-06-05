// ---------------------------------------------------------------------------
// crossMarketRecommendations — ported from frontend/src/utils/crossMarketRecommendations.js
// Provides buildCrossMarketCards (the "scored" base builder used by taskIntelligenceViewModels).
// ---------------------------------------------------------------------------

import {
  DIMENSION_META,
  DEFENSIVE_LONG_SYMBOLS,
  PHYSICAL_LONG_SYMBOLS,
  GROWTH_SHORT_SYMBOLS,
  SEMI_SHORT_SYMBOLS,
  RISK_ON_LONG_SYMBOLS,
  CROSS_MARKET_FACTOR_LABELS,
  CROSS_MARKET_DIMENSION_LABELS,
  buildFactorLookup,
  buildDimensionLookup,
  buildRecommendationTier,
  buildRecommendationTone,
  buildResonanceMeta,
  buildPolicySourceHealthMeta,
  buildInputReliabilityMeta,
  buildDepartmentChaosMeta,
  buildPeopleFragilityMeta,
  buildPolicyExecutionMeta,
  buildSourceModeMeta,
  buildStructuralDecayRadarMeta,
  clampMin,
  pushContribution,
  formatFactorName,
  type DepartmentChaosMeta,
  type PeopleFragilityMeta,
  type StructuralDecayRadarMeta,
  type PolicyExecutionMeta,
  type SourceModeMeta,
  type PolicySourceHealthMeta,
  type InputReliabilityMeta,
} from './crossMarketRecommendationMeta';

export { CROSS_MARKET_FACTOR_LABELS, CROSS_MARKET_DIMENSION_LABELS };

export const normalizeSideWeights = (
  assets: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> => {
  const clampNonNeg = (value: unknown): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const total = assets.reduce((sum, asset) => sum + clampNonNeg(asset.weight), 0) || 1;
  return assets.map((asset) => ({
    ...asset,
    weight: Number((clampNonNeg(asset.weight) / total).toFixed(6)),
  }));
};

// ---- internal helpers ----

interface SignalContext {
  baseload: number;
  techDilution: number;
  bureaucratic: number;
  trade: number;
  investment: number;
}

const buildSignalContext = (
  overview: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): SignalContext => {
  const factorLookup = buildFactorLookup(overview);
  const dimensionLookup = buildDimensionLookup(snapshot);
  return {
    baseload: Math.max(
      Math.abs(Number((factorLookup.baseload_mismatch as Record<string, unknown>)?.z_score ?? (factorLookup.baseload_mismatch as Record<string, unknown>)?.value ?? 0)),
      Math.abs(Number((dimensionLookup.inventory as Record<string, unknown>)?.score ?? 0)),
      Math.abs(Number((dimensionLookup.project_pipeline as Record<string, unknown>)?.score ?? 0))
    ),
    techDilution: Math.max(
      Math.abs(Number((factorLookup.tech_dilution as Record<string, unknown>)?.z_score ?? (factorLookup.tech_dilution as Record<string, unknown>)?.value ?? 0)),
      Math.abs(Number((dimensionLookup.talent_structure as Record<string, unknown>)?.score ?? 0))
    ),
    bureaucratic: Math.max(
      Math.abs(Number((factorLookup.bureaucratic_friction as Record<string, unknown>)?.z_score ?? (factorLookup.bureaucratic_friction as Record<string, unknown>)?.value ?? 0)),
      Math.abs(Number((dimensionLookup.logistics as Record<string, unknown>)?.score ?? 0))
    ),
    trade: Math.max(
      Math.abs(Number((dimensionLookup.trade as Record<string, unknown>)?.score ?? 0)),
      Math.abs(Number((dimensionLookup.logistics as Record<string, unknown>)?.score ?? 0))
    ),
    investment: Math.abs(Number((dimensionLookup.investment_activity as Record<string, unknown>)?.score ?? 0)),
  };
};

interface BiasQualityMeta {
  scale: number;
  label: string;
  reason: string;
}

const buildBiasQualityMeta = (
  policySourceHealth: PolicySourceHealthMeta,
  inputReliability: InputReliabilityMeta,
  departmentChaos: DepartmentChaosMeta,
  peopleFragility: PeopleFragilityMeta,
  structuralDecayRadar: StructuralDecayRadarMeta,
  sourceModeMeta: SourceModeMeta,
): BiasQualityMeta => {
  const structuralScale = Math.min(
    Number(departmentChaos.riskBudgetScale),
    Number(peopleFragility.riskBudgetScale),
    Number(structuralDecayRadar.riskBudgetScale),
    Number(sourceModeMeta.riskBudgetScale)
  );
  if (sourceModeMeta.label === 'fallback-heavy') {
    return {
      scale: Math.min(sourceModeMeta.riskBudgetScale ?? 0.8, structuralScale),
      label: 'source_guarded',
      reason: sourceModeMeta.reason || '来源治理偏回退，组合偏置只做幅度压缩，不改方向。',
    };
  }
  if (policySourceHealth.label === 'fragile' || inputReliability.label === 'fragile') {
    const reasons = [policySourceHealth.reason, inputReliability.lead || inputReliability.reason].filter(Boolean);
    return {
      scale: Math.min(policySourceHealth.label === 'fragile' ? 0.55 : 0.72, structuralScale),
      label: 'compressed',
      reason: reasons.join(' · ') || '整体输入可靠度偏脆弱，宏观偏置已收缩到更保守的幅度',
    };
  }
  if (policySourceHealth.label === 'watch' || inputReliability.label === 'watch') {
    const reasons = [policySourceHealth.reason, inputReliability.lead || inputReliability.reason].filter(Boolean);
    return {
      scale: Math.min(policySourceHealth.label === 'watch' ? 0.78 : 0.88, structuralScale),
      label: 'cautious',
      reason: reasons.join(' · ') || '整体输入可靠度需要观察，宏观偏置已适度收缩',
    };
  }
  if (structuralDecayRadar.active) {
    return {
      scale: structuralDecayRadar.riskBudgetScale,
      label: 'decay_guarded',
      reason: `${structuralDecayRadar.displayLabel || '结构衰败雷达'} 进入警报区，组合偏置进入系统级防御风险预算`,
    };
  }
  if (structuralDecayRadar.watch) {
    return {
      scale: structuralDecayRadar.riskBudgetScale,
      label: 'decay_watch',
      reason: `${structuralDecayRadar.displayLabel || '结构衰败雷达'} 升温，组合偏置适度保守`,
    };
  }
  if (departmentChaos.active) {
    return {
      scale: departmentChaos.riskBudgetScale,
      label: 'chaos_guarded',
      reason: `${departmentChaos.topDepartmentLabel || '政策主体'} 政策混乱度偏高，组合偏置进入防御化风险预算`,
    };
  }
  if (departmentChaos.watch) {
    return {
      scale: departmentChaos.riskBudgetScale,
      label: 'chaos_watch',
      reason: `${departmentChaos.topDepartmentLabel || '政策主体'} 政策混乱度处于观察区，组合偏置适度保守`,
    };
  }
  if (peopleFragility.active) {
    return {
      scale: peopleFragility.riskBudgetScale,
      label: 'people_guarded',
      reason: `${peopleFragility.companyName || '重点公司'} 组织脆弱度偏高，组合偏置进入执行质量折扣`,
    };
  }
  if (peopleFragility.watch) {
    return {
      scale: peopleFragility.riskBudgetScale,
      label: 'people_watch',
      reason: `${peopleFragility.companyName || '重点公司'} 组织脆弱度处于观察区，组合偏置适度保守`,
    };
  }
  return {
    scale: 1,
    label: 'full',
    reason: sourceModeMeta.reason || policySourceHealth.reason || '',
  };
};

type Asset = Record<string, unknown>;

interface AdjustedAssetsResult {
  rawAdjustedAssets: Asset[];
  adjustedAssets: Asset[];
  biasSummary: string;
  rawBiasStrength: number;
  biasStrength: number;
  biasScale: number;
  biasQualityLabel: string;
  biasQualityReason: string;
  rawBiasHighlights: string[];
  biasHighlights: string[];
  biasActions: Array<{ symbol: string; side: string; action: string; delta: number }>;
  signalAttribution: Array<Record<string, unknown>>;
  driverSummary: Array<{ key: string; label: string; value: number }>;
  dominantDrivers: Array<{ key: string; label: string; value: number }>;
  coreLegs: Array<{ symbol: string; side: string; role: string; delta: number }>;
  supportLegs: Array<{ symbol: string; side: string; role: string; delta: number }>;
  themeCore: string;
  themeSupport: string;
  departmentChaosLabel: string;
  departmentChaosScore: number;
  departmentChaosTopDepartment: string;
  departmentChaosReason: string;
  departmentChaosRiskBudgetScale: number;
  policyExecutionLabel: string;
  policyExecutionScore: number;
  policyExecutionTopDepartment: string;
  policyExecutionReason: string;
  policyExecutionRiskBudgetScale: number;
  peopleFragilityLabel: string;
  peopleFragilityScore: number;
  peopleFragilityFocus: string;
  peopleFragilityReason: string;
  peopleFragilityRiskBudgetScale: number;
  structuralDecayRadarLabel: string;
  structuralDecayRadarDisplayLabel: string;
  structuralDecayRadarScore: number;
  structuralDecayRadarActionHint: string;
  structuralDecayRadarRiskBudgetScale: number;
  structuralDecayRadarTopSignals: unknown[];
  sourceModeLabel: string;
  sourceModeDominant: string;
  sourceModeReason: string;
  sourceModeRiskBudgetScale: number;
}

const buildAdjustedAssets = (
  template: Record<string, unknown>,
  signalContext: SignalContext,
  qualityMeta: BiasQualityMeta,
  departmentChaos: DepartmentChaosMeta,
  peopleFragility: PeopleFragilityMeta,
  structuralDecayRadar: StructuralDecayRadarMeta,
  policyExecution: PolicyExecutionMeta,
  sourceModeMeta: SourceModeMeta,
): AdjustedAssetsResult => {
  const longAssets: Asset[] = [];
  const shortAssets: Asset[] = [];
  const rawLongAssets: Asset[] = [];
  const rawShortAssets: Asset[] = [];
  const signalAttribution: Array<Record<string, unknown>> = [];
  const driverSummary: Record<string, { key: string; label: string; value: number }> = {};
  const qualityScale = Number(qualityMeta.scale || 1);

  ((template.assets as Asset[]) ?? []).forEach((asset) => {
    const sanitized = (value: unknown, fallback = 1): number => {
      if (value === null || value === undefined) return fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const currentWeight = sanitized(asset.weight);
    let multiplier = 1;
    const symbol = String(asset.symbol ?? '').toUpperCase();
    const isLong = asset.side === 'long';
    const biasReasons: string[] = [];
    const breakdown: Array<{ key: string; label: string; value: number }> = [];

    if (isLong) {
      if (asset.asset_class === 'COMMODITY_FUTURES') {
        const uplift = signalContext.baseload * 0.16 + signalContext.trade * 0.12;
        multiplier += uplift;
        pushContribution(breakdown, 'physical_tightness', '上游实物紧张', uplift);
        if (uplift > 0.02) biasReasons.push(`上游实物紧张 ${uplift.toFixed(2)}`);
      }
      if (DEFENSIVE_LONG_SYMBOLS.has(symbol)) {
        const uplift = signalContext.bureaucratic * 0.1 + signalContext.baseload * 0.08;
        multiplier += uplift;
        pushContribution(breakdown, 'defensive_premium', '防守资产溢价', uplift);
        if (uplift > 0.02) biasReasons.push(`防守资产溢价 ${uplift.toFixed(2)}`);
      }
      if (PHYSICAL_LONG_SYMBOLS.has(symbol)) {
        const uplift = signalContext.investment * 0.12 + signalContext.baseload * 0.1;
        multiplier += uplift;
        pushContribution(breakdown, 'baseload_support', '基建/基荷支撑', uplift);
        if (uplift > 0.02) biasReasons.push(`基建/基荷支撑 ${uplift.toFixed(2)}`);
      }
      if (departmentChaos.watch && (DEFENSIVE_LONG_SYMBOLS.has(symbol) || PHYSICAL_LONG_SYMBOLS.has(symbol))) {
        const uplift = departmentChaos.defensiveTilt;
        multiplier += uplift;
        pushContribution(breakdown, 'department_chaos_defensive', '部门混乱防御化', uplift);
        if (uplift > 0.02) biasReasons.push(`部门混乱防御化 ${uplift.toFixed(2)}`);
      } else if (departmentChaos.watch && RISK_ON_LONG_SYMBOLS.has(symbol)) {
        const haircut = departmentChaos.offensiveHaircut;
        multiplier -= haircut;
        pushContribution(breakdown, 'department_chaos_offensive_haircut', '进攻腿风险折扣', haircut);
        if (haircut > 0.02) biasReasons.push(`进攻腿风险折扣 -${haircut.toFixed(2)}`);
      }
      if (policyExecution.watch && (DEFENSIVE_LONG_SYMBOLS.has(symbol) || PHYSICAL_LONG_SYMBOLS.has(symbol))) {
        const uplift = policyExecution.hedgeBoost;
        multiplier += uplift;
        pushContribution(breakdown, 'policy_execution_defensive', '政策执行防御化', uplift);
        if (uplift > 0.02) biasReasons.push(`政策执行防御化 ${uplift.toFixed(2)}`);
      } else if (policyExecution.watch && RISK_ON_LONG_SYMBOLS.has(symbol)) {
        const haircut = policyExecution.offensiveHaircut;
        multiplier -= haircut;
        pushContribution(breakdown, 'policy_execution_offensive_haircut', '政策执行风险折扣', haircut);
        if (haircut > 0.02) biasReasons.push(`政策执行风险折扣 -${haircut.toFixed(2)}`);
      }
      if (peopleFragility.watch && DEFENSIVE_LONG_SYMBOLS.has(symbol)) {
        const uplift = peopleFragility.defensiveTilt;
        multiplier += uplift;
        pushContribution(breakdown, 'people_fragility_defensive', '组织脆弱防御化', uplift);
        if (uplift > 0.02) biasReasons.push(`组织脆弱防御化 ${uplift.toFixed(2)}`);
      } else if (peopleFragility.watch && RISK_ON_LONG_SYMBOLS.has(symbol)) {
        const haircut = peopleFragility.riskOnHaircut;
        multiplier -= haircut;
        pushContribution(breakdown, 'people_fragility_risk_on_haircut', '组织脆弱风险折扣', haircut);
        if (haircut > 0.02) biasReasons.push(`组织脆弱风险折扣 -${haircut.toFixed(2)}`);
      }
      if (structuralDecayRadar.watch && (DEFENSIVE_LONG_SYMBOLS.has(symbol) || PHYSICAL_LONG_SYMBOLS.has(symbol))) {
        const uplift = structuralDecayRadar.defensiveTilt;
        multiplier += uplift;
        pushContribution(breakdown, 'structural_decay_defensive', '结构衰败防御化', uplift);
        if (uplift > 0.02) biasReasons.push(`结构衰败防御化 ${uplift.toFixed(2)}`);
      } else if (structuralDecayRadar.watch && RISK_ON_LONG_SYMBOLS.has(symbol)) {
        const haircut = structuralDecayRadar.riskOnHaircut;
        multiplier -= haircut;
        pushContribution(breakdown, 'structural_decay_risk_on_haircut', '结构衰败风险折扣', haircut);
        if (haircut > 0.02) biasReasons.push(`结构衰败风险折扣 -${haircut.toFixed(2)}`);
      }
    } else {
      if (GROWTH_SHORT_SYMBOLS.has(symbol)) {
        const uplift = signalContext.techDilution * 0.14 + signalContext.baseload * 0.08;
        multiplier += uplift;
        pushContribution(breakdown, 'growth_pressure', '成长端估值压力', uplift);
        if (uplift > 0.02) biasReasons.push(`成长端估值压力 ${uplift.toFixed(2)}`);
      }
      if (SEMI_SHORT_SYMBOLS.has(symbol)) {
        const uplift = signalContext.trade * 0.1;
        multiplier += uplift;
        pushContribution(breakdown, 'trade_friction', '贸易摩擦抬升', uplift);
        if (uplift > 0.02) biasReasons.push(`贸易摩擦抬升 ${uplift.toFixed(2)}`);
      }
      if (symbol === 'QQQ') {
        const uplift = signalContext.bureaucratic * 0.06;
        multiplier += uplift;
        pushContribution(breakdown, 'bureaucratic_drag', '官僚摩擦压制估值', uplift);
        if (uplift > 0.02) biasReasons.push(`官僚摩擦压制估值 ${uplift.toFixed(2)}`);
      }
      if (departmentChaos.watch && GROWTH_SHORT_SYMBOLS.has(symbol)) {
        const uplift = departmentChaos.hedgeBoost;
        multiplier += uplift;
        pushContribution(breakdown, 'department_chaos_hedge', '部门混乱对冲强化', uplift);
        if (uplift > 0.02) biasReasons.push(`部门混乱对冲强化 ${uplift.toFixed(2)}`);
      }
      if (policyExecution.watch && GROWTH_SHORT_SYMBOLS.has(symbol)) {
        const uplift = policyExecution.hedgeBoost;
        multiplier += uplift;
        pushContribution(breakdown, 'policy_execution_hedge', '政策执行对冲强化', uplift);
        if (uplift > 0.02) biasReasons.push(`政策执行对冲强化 ${uplift.toFixed(2)}`);
      }
      if (peopleFragility.watch && GROWTH_SHORT_SYMBOLS.has(symbol)) {
        const uplift = peopleFragility.shortBoost;
        multiplier += uplift;
        pushContribution(breakdown, 'people_fragility_short', '组织脆弱空头强化', uplift);
        if (uplift > 0.02) biasReasons.push(`组织脆弱空头强化 ${uplift.toFixed(2)}`);
      }
      if (structuralDecayRadar.watch && GROWTH_SHORT_SYMBOLS.has(symbol)) {
        const uplift = structuralDecayRadar.hedgeBoost;
        multiplier += uplift;
        pushContribution(breakdown, 'structural_decay_hedge', '结构衰败对冲强化', uplift);
        if (uplift > 0.02) biasReasons.push(`结构衰败对冲强化 ${uplift.toFixed(2)}`);
      }
    }

    breakdown.forEach((item) => {
      driverSummary[item.key] = {
        key: item.key,
        label: item.label,
        value: Number(((driverSummary[item.key]?.value ?? 0) + item.value).toFixed(4)),
      };
    });

    const adjustedMultiplier = 1 + (multiplier - 1) * qualityScale;
    const adjusted: Asset = {
      ...asset,
      weight: clampMin(currentWeight * adjustedMultiplier, 0.01),
      base_weight: Number(currentWeight.toFixed(6)),
      bias_reasons: biasReasons,
      bias_breakdown: breakdown,
    };
    const rawAdjusted: Asset = {
      ...asset,
      weight: clampMin(currentWeight * multiplier, 0.01),
      base_weight: Number(currentWeight.toFixed(6)),
    };
    signalAttribution.push({
      symbol,
      side: asset.side,
      asset_class: asset.asset_class,
      multiplier: Number(adjustedMultiplier.toFixed(4)),
      raw_multiplier: Number(multiplier.toFixed(4)),
      quality_scale: Number(qualityScale.toFixed(2)),
      reasons: biasReasons,
      breakdown,
    });
    if (isLong) {
      longAssets.push(adjusted);
      rawLongAssets.push(rawAdjusted);
    } else {
      shortAssets.push(adjusted);
      rawShortAssets.push(rawAdjusted);
    }
  });

  const normalizedLong = normalizeSideWeights(longAssets);
  const normalizedShort = normalizeSideWeights(shortAssets);
  const normalizedRawLong = normalizeSideWeights(rawLongAssets);
  const normalizedRawShort = normalizeSideWeights(rawShortAssets);
  const adjustedAssets = [...normalizedLong, ...normalizedShort];
  const rawAdjustedAssets = [...normalizedRawLong, ...normalizedRawShort];

  const deltas = adjustedAssets
    .map((asset) => ({
      symbol: asset.symbol as string,
      side: asset.side as string,
      delta: Number(((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))).toFixed(4)),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const rawDeltas = rawAdjustedAssets
    .map((asset) => ({
      symbol: asset.symbol as string,
      side: asset.side as string,
      delta: Number(((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))).toFixed(4)),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const longLeader = deltas.find((item) => item.side === 'long' && item.delta > 0);
  const shortLeader = deltas.find((item) => item.side === 'short' && item.delta > 0);
  const strongestShift = deltas[0] ? Math.abs(deltas[0].delta) : 0;
  const rawStrongestShift = rawDeltas[0] ? Math.abs(rawDeltas[0].delta) : 0;

  const summaryParts: string[] = [];
  if (longLeader) summaryParts.push(`多头增配 ${longLeader.symbol}`);
  if (shortLeader) summaryParts.push(`空头增配 ${shortLeader.symbol}`);
  if (departmentChaos.watch) summaryParts.push(`${departmentChaos.topDepartmentLabel || '政策主体'} 混乱触发防御化`);
  if (policyExecution.watch) summaryParts.push(`${policyExecution.topDepartmentLabel || '政策执行'} 触发政策敏感对冲`);
  if (peopleFragility.watch) summaryParts.push(`${peopleFragility.companyName || '组织脆弱'} 触发执行质量折扣`);
  if (structuralDecayRadar.watch) summaryParts.push(`${structuralDecayRadar.displayLabel || '结构衰败雷达'} 触发系统防御预算`);

  const biasHighlights = deltas.filter((item) => Math.abs(item.delta) >= 0.02).slice(0, 4)
    .map((item) => `${item.symbol} ${item.delta > 0 ? '+' : ''}${(item.delta * 100).toFixed(1)}pp`);
  const biasActions = deltas.filter((item) => Math.abs(item.delta) >= 0.02).slice(0, 6)
    .map((item) => ({ symbol: item.symbol, side: item.side, action: item.delta > 0 ? 'increase' : 'reduce', delta: Number(item.delta.toFixed(4)) }));
  const rawBiasHighlights = rawDeltas.filter((item) => Math.abs(item.delta) >= 0.02).slice(0, 4)
    .map((item) => `${item.symbol} ${item.delta > 0 ? '+' : ''}${(item.delta * 100).toFixed(1)}pp`);

  const sortedDriverSummary = Object.values(driverSummary).sort((a, b) => b.value - a.value);
  const dominantDrivers = sortedDriverSummary.slice(0, 3);
  const coreLegs = adjustedAssets
    .filter((asset) => Math.abs((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))) >= 0.025)
    .map((asset) => ({
      symbol: asset.symbol as string,
      side: asset.side as string,
      role: 'core' as const,
      delta: Number((((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))) * 100).toFixed(2)),
    }));
  const supportLegs = adjustedAssets
    .filter((asset) => Math.abs((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))) < 0.025)
    .map((asset) => ({
      symbol: asset.symbol as string,
      side: asset.side as string,
      role: 'support' as const,
      delta: Number((((Number(asset.weight ?? 0)) - (Number(asset.base_weight ?? 0))) * 100).toFixed(2)),
    }));
  const themeCore = coreLegs.length
    ? coreLegs.map((item) => `${item.symbol}${item.delta > 0 ? '+' : ''}${item.delta.toFixed(1)}pp`).join('，')
    : '暂无明确主题核心腿';
  const themeSupport = supportLegs.length ? supportLegs.map((item) => item.symbol).join('，') : '无辅助腿';

  return {
    rawAdjustedAssets,
    adjustedAssets,
    biasSummary: summaryParts.join('，') || '当前信号更适合作为方向参考，权重保持接近模板原始配置',
    rawBiasStrength: Number((rawStrongestShift * 100).toFixed(2)),
    biasStrength: Number((strongestShift * 100).toFixed(2)),
    biasScale: Number(qualityScale.toFixed(2)),
    biasQualityLabel: qualityMeta.label || 'full',
    biasQualityReason: qualityMeta.reason || '',
    rawBiasHighlights,
    biasHighlights,
    biasActions,
    signalAttribution,
    driverSummary: sortedDriverSummary,
    dominantDrivers,
    coreLegs,
    supportLegs,
    themeCore,
    themeSupport,
    departmentChaosLabel: departmentChaos.label || 'unknown',
    departmentChaosScore: departmentChaos.score || 0,
    departmentChaosTopDepartment: departmentChaos.topDepartmentLabel || '',
    departmentChaosReason: departmentChaos.topDepartmentReason || departmentChaos.summary || '',
    departmentChaosRiskBudgetScale: Number((departmentChaos.riskBudgetScale || 1).toFixed(2)),
    policyExecutionLabel: policyExecution.label || 'unknown',
    policyExecutionScore: policyExecution.score || 0,
    policyExecutionTopDepartment: policyExecution.topDepartmentLabel || '',
    policyExecutionReason: policyExecution.reason || '',
    policyExecutionRiskBudgetScale: Number((policyExecution.riskBudgetScale || 1).toFixed(2)),
    peopleFragilityLabel: peopleFragility.label || 'stable',
    peopleFragilityScore: peopleFragility.score || 0,
    peopleFragilityFocus: peopleFragility.companyName || '',
    peopleFragilityReason: peopleFragility.reason || '',
    peopleFragilityRiskBudgetScale: Number((peopleFragility.riskBudgetScale || 1).toFixed(2)),
    structuralDecayRadarLabel: structuralDecayRadar.label || 'stable',
    structuralDecayRadarDisplayLabel: structuralDecayRadar.displayLabel || '',
    structuralDecayRadarScore: structuralDecayRadar.score || 0,
    structuralDecayRadarActionHint: structuralDecayRadar.actionHint || '',
    structuralDecayRadarRiskBudgetScale: Number((structuralDecayRadar.riskBudgetScale || 1).toFixed(2)),
    structuralDecayRadarTopSignals: structuralDecayRadar.topSignals || [],
    sourceModeLabel: sourceModeMeta.label || 'mixed',
    sourceModeDominant: sourceModeMeta.dominant || '',
    sourceModeReason: sourceModeMeta.reason || '',
    sourceModeRiskBudgetScale: Number((sourceModeMeta.riskBudgetScale || 1).toFixed(2)),
  };
};

// ---- main export ----

export interface DriverItem {
  key: string;
  label: string;
  detail: string;
  type: string;
}

export type CrossMarketCard = Record<string, unknown>;

export const buildCrossMarketCards = (
  payload: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
  snapshot: Record<string, unknown> = {},
  buildAction: ((templateId: string, note: string) => unknown) | null = null,
): CrossMarketCard[] => {
  const templates = (payload?.templates as Array<Record<string, unknown>>) ?? [];
  const factorLookup = buildFactorLookup(overview);
  const dimensionLookup = buildDimensionLookup(snapshot);
  const supplyAlerts = (((snapshot?.signals as Record<string, unknown>)?.supply_chain as Record<string, unknown>)?.alerts as Array<Record<string, unknown>>) ?? [];
  const signalContext = buildSignalContext(overview, snapshot);
  const resonanceMeta = buildResonanceMeta(overview);
  const policySourceHealth = buildPolicySourceHealthMeta(overview);
  const inputReliability = buildInputReliabilityMeta(overview);
  const departmentChaos = buildDepartmentChaosMeta(overview);
  const policyExecution = buildPolicyExecutionMeta(overview);
  const peopleFragility = buildPeopleFragilityMeta(overview);
  const structuralDecayRadar = buildStructuralDecayRadarMeta(overview);
  const sourceModeMeta = buildSourceModeMeta(overview, snapshot);

  return templates
    .map((template) => {
      const longCount = ((template.assets as Asset[]) ?? []).filter((a) => a.side === 'long').length;
      const shortCount = ((template.assets as Asset[]) ?? []).filter((a) => a.side === 'short').length;
      const matchedDrivers: DriverItem[] = [];
      let recommendationScore = 0;

      ((template.linked_factors as string[]) ?? []).forEach((factorName) => {
        const factor = factorLookup[factorName] as Record<string, unknown>;
        if (!factor) return;
        const strength = Math.abs(Number(factor.z_score ?? factor.value ?? 0));
        if (strength < 0.2 && !factor.signal) return;
        recommendationScore += Math.max(0.4, strength);
        matchedDrivers.push({
          key: `factor-${factorName}`,
          label: formatFactorName(factorName),
          detail: `z=${Number(factor.z_score ?? 0).toFixed(2)}`,
          type: 'factor',
        });
      });

      ((template.linked_dimensions as string[]) ?? []).forEach((dimensionName) => {
        const dimension = dimensionLookup[dimensionName] as Record<string, unknown>;
        if (!dimension) return;
        const strength = Math.abs(Number(dimension.score ?? 0));
        if (strength < 0.18) return;
        recommendationScore += Math.max(0.25, strength);
        matchedDrivers.push({
          key: `dimension-${dimensionName}`,
          label: DIMENSION_META[dimensionName]?.label ?? dimensionName,
          detail: `score=${Number(dimension.score ?? 0).toFixed(2)}`,
          type: 'dimension',
        });
      });

      if (((template.linked_dimensions as string[]) ?? []).includes('policy_execution') && policyExecution.watch) {
        recommendationScore += policyExecution.active ? 0.32 : 0.14;
        matchedDrivers.push({
          key: `policy-execution-dimension-${template.id}`,
          label: `政策执行 ${policyExecution.topDepartmentLabel || policyExecution.label}`,
          detail: policyExecution.reason || `score=${policyExecution.score.toFixed(2)}`,
          type: 'quality',
        });
      }
      if (((template.linked_dimensions as string[]) ?? []).includes('people_layer') && peopleFragility.watch) {
        recommendationScore += peopleFragility.active ? 0.28 : 0.12;
        matchedDrivers.push({
          key: `people-layer-dimension-${template.id}`,
          label: `人的维度 ${peopleFragility.companyName || peopleFragility.label}`,
          detail: peopleFragility.reason || `fragility=${peopleFragility.score.toFixed(2)}`,
          type: 'quality',
        });
      }
      if (((template.linked_dimensions as string[]) ?? []).includes('source_mode_summary')) {
        if (sourceModeMeta.active) {
          recommendationScore = Math.max(0, recommendationScore - 0.18);
          matchedDrivers.push({ key: `source-mode-dimension-${template.id}`, label: '来源治理回退', detail: sourceModeMeta.reason, type: 'quality' });
        } else if (sourceModeMeta.label === 'official-led') {
          recommendationScore += 0.06;
          matchedDrivers.push({ key: `source-mode-dimension-${template.id}`, label: '来源治理稳健', detail: sourceModeMeta.reason, type: 'quality' });
        }
      }

      const linkedFactors = (template.linked_factors as string[]) ?? [];
      const resonanceMatches = {
        positive: linkedFactors.filter((n) => resonanceMeta.positive.has(n)),
        negative: linkedFactors.filter((n) => resonanceMeta.negative.has(n)),
        weakening: linkedFactors.filter((n) => resonanceMeta.weakening.has(n)),
        precursor: linkedFactors.filter((n) => resonanceMeta.precursor.has(n)),
        reversed: linkedFactors.filter((n) => resonanceMeta.reversed.has(n)),
      };

      if (resonanceMatches.positive.length) {
        recommendationScore += resonanceMatches.positive.length * 0.55;
        matchedDrivers.push({ key: `resonance-positive-${template.id}`, label: `正向共振 ${resonanceMatches.positive.map((n) => formatFactorName(n)).join('、')}`, detail: resonanceMeta.reason || '多个因子同步强化', type: 'resonance' });
      }
      if (resonanceMatches.negative.length && template.preferred_signal !== 'positive') {
        recommendationScore += resonanceMatches.negative.length * 0.45;
        matchedDrivers.push({ key: `resonance-negative-${template.id}`, label: `负向共振 ${resonanceMatches.negative.map((n) => formatFactorName(n)).join('、')}`, detail: resonanceMeta.reason || '多个因子同步走弱', type: 'resonance' });
      }
      if (resonanceMatches.precursor.length || resonanceMatches.reversed.length) {
        recommendationScore += 0.2;
        matchedDrivers.push({ key: `resonance-turn-${template.id}`, label: `叙事临界 ${[...resonanceMatches.precursor, ...resonanceMatches.reversed].map((n) => formatFactorName(n)).join('、')}`, detail: resonanceMeta.reason || '相关因子进入反转临界区', type: 'resonance' });
      }
      if (resonanceMatches.weakening.length) {
        recommendationScore = Math.max(0, recommendationScore - Math.min(0.25, resonanceMatches.weakening.length * 0.1));
      }

      if (((template.linked_dimensions as string[]) ?? []).includes('talent_structure') && supplyAlerts.length) {
        recommendationScore += Math.min(0.9, supplyAlerts.length * 0.25);
        matchedDrivers.push({ key: 'supply-alerts', label: `供应链预警 ${supplyAlerts.length} 条`, detail: '人才结构与执行质量出现扰动', type: 'alert' });
      }

      if (template.preferred_signal === 'positive' && (overview?.macro_signal as number) === 1) {
        recommendationScore += 0.25;
      }

      if (policySourceHealth.label === 'fragile') {
        recommendationScore = Math.max(0, recommendationScore - 0.35);
        matchedDrivers.push({ key: `policy-source-${template.id}`, label: `政策源退化 ${policySourceHealth.fragileSources.slice(0, 2).join('、') || 'fragile'}`, detail: policySourceHealth.reason || '政策正文抓取质量下降，推荐级别需打折', type: 'quality' });
      } else if (policySourceHealth.label === 'watch') {
        recommendationScore = Math.max(0, recommendationScore - 0.18);
        matchedDrivers.push({ key: `policy-source-${template.id}`, label: '政策源需关注', detail: policySourceHealth.reason || '政策正文覆盖下降，推荐级别适度打折', type: 'quality' });
      } else if (policySourceHealth.label === 'healthy') {
        recommendationScore += 0.06;
      }

      if (inputReliability.label === 'fragile') {
        recommendationScore = Math.max(0, recommendationScore - 0.28);
        matchedDrivers.push({ key: `input-reliability-${template.id}`, label: '输入可靠度偏脆弱', detail: inputReliability.lead || inputReliability.reason || '宏观输入质量整体偏脆弱，模板排序继续下调', type: 'quality' });
      } else if (inputReliability.label === 'watch') {
        recommendationScore = Math.max(0, recommendationScore - 0.14);
        matchedDrivers.push({ key: `input-reliability-${template.id}`, label: '输入可靠度需观察', detail: inputReliability.lead || inputReliability.reason || '宏观输入质量存在波动，模板排序适度下调', type: 'quality' });
      } else if (inputReliability.label === 'robust') {
        recommendationScore += 0.05;
      }

      const linkedToBureaucratic = linkedFactors.includes('bureaucratic_friction');
      if (departmentChaos.active && linkedToBureaucratic) {
        recommendationScore += 0.34;
        matchedDrivers.push({ key: `department-chaos-${template.id}`, label: `部门混乱 ${departmentChaos.topDepartmentLabel || departmentChaos.label}`, detail: departmentChaos.topDepartmentReason || departmentChaos.summary || `chaos=${departmentChaos.score.toFixed(2)}`, type: 'quality' });
      } else if (departmentChaos.watch && linkedToBureaucratic) {
        recommendationScore += 0.14;
        matchedDrivers.push({ key: `department-chaos-${template.id}`, label: '部门混乱观察', detail: departmentChaos.topDepartmentReason || departmentChaos.summary || `chaos=${departmentChaos.score.toFixed(2)}`, type: 'quality' });
      } else if (departmentChaos.active) {
        recommendationScore = Math.max(0, recommendationScore - 0.08);
      }

      const linkedToPolicyExecution =
        linkedFactors.includes('policy_execution_disorder') ||
        ((template.linked_dimensions as string[]) ?? []).includes('policy_execution');
      if (policyExecution.active && linkedToPolicyExecution) {
        recommendationScore += 0.34;
        matchedDrivers.push({ key: `policy-execution-${template.id}`, label: `政策执行 ${policyExecution.topDepartmentLabel || policyExecution.label}`, detail: policyExecution.reason || `score=${policyExecution.score.toFixed(2)}`, type: 'quality' });
      } else if (policyExecution.watch && linkedToPolicyExecution) {
        recommendationScore += 0.14;
        matchedDrivers.push({ key: `policy-execution-${template.id}`, label: '政策执行观察', detail: policyExecution.reason || `score=${policyExecution.score.toFixed(2)}`, type: 'quality' });
      } else if (policyExecution.active) {
        recommendationScore = Math.max(0, recommendationScore - 0.06);
      }

      const linkedToPeopleLayer =
        linkedFactors.includes('tech_dilution') ||
        ((template.linked_dimensions as string[]) ?? []).includes('talent_structure');
      if (peopleFragility.active && linkedToPeopleLayer) {
        recommendationScore += 0.32;
        matchedDrivers.push({ key: `people-fragility-${template.id}`, label: `组织脆弱 ${peopleFragility.companyName || peopleFragility.label}`, detail: peopleFragility.reason || peopleFragility.summary || `fragility=${peopleFragility.score.toFixed(2)}`, type: 'quality' });
      } else if (peopleFragility.watch && linkedToPeopleLayer) {
        recommendationScore += 0.13;
        matchedDrivers.push({ key: `people-fragility-${template.id}`, label: '组织脆弱观察', detail: peopleFragility.reason || peopleFragility.summary || `fragility=${peopleFragility.score.toFixed(2)}`, type: 'quality' });
      } else if (peopleFragility.active) {
        recommendationScore = Math.max(0, recommendationScore - 0.06);
      }

      const linkedToStructuralDecay =
        template.id === 'defensive_beta_hedge' ||
        template.id === 'utilities_vs_growth' ||
        linkedFactors.some((n) => ['tech_dilution', 'bureaucratic_friction', 'baseload_mismatch', 'credit_spread_stress'].includes(n)) ||
        ((template.assets as Asset[]) ?? []).some((a) => DEFENSIVE_LONG_SYMBOLS.has(String(a.symbol ?? '').toUpperCase())) ||
        ((template.assets as Asset[]) ?? []).some((a) => GROWTH_SHORT_SYMBOLS.has(String(a.symbol ?? '').toUpperCase()));
      if (structuralDecayRadar.active && linkedToStructuralDecay) {
        recommendationScore += 0.36;
        matchedDrivers.push({ key: `structural-decay-radar-${template.id}`, label: structuralDecayRadar.displayLabel || '结构衰败雷达', detail: structuralDecayRadar.actionHint || `decay=${structuralDecayRadar.score.toFixed(2)}`, type: 'quality' });
      } else if (structuralDecayRadar.watch && linkedToStructuralDecay) {
        recommendationScore += 0.16;
        matchedDrivers.push({ key: `structural-decay-radar-${template.id}`, label: '结构衰败观察', detail: structuralDecayRadar.actionHint || `decay=${structuralDecayRadar.score.toFixed(2)}`, type: 'quality' });
      } else if (structuralDecayRadar.active) {
        recommendationScore = Math.max(0, recommendationScore - 0.08);
      }

      const roundedScore = Number(recommendationScore.toFixed(2));
      const recommendationTier = buildRecommendationTier(roundedScore);
      const biasQuality = buildBiasQualityMeta(policySourceHealth, inputReliability, departmentChaos, peopleFragility, structuralDecayRadar, sourceModeMeta);
      const allocationBias = buildAdjustedAssets(template, signalContext, biasQuality, departmentChaos, peopleFragility, structuralDecayRadar, policyExecution, sourceModeMeta);

      const prioritizedDrivers = [...matchedDrivers].sort((a, b) => {
        const priority: Record<string, number> = { resonance: 0, quality: 1, factor: 2, alert: 3, dimension: 4 };
        return (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
      });
      const driverHeadline = matchedDrivers.length
        ? prioritizedDrivers.slice(0, 3).map((item) => `${item.label}(${item.detail})`).join(' · ')
        : '当前模板更多作为备用情景模板，可结合手动研究继续验证';
      const actionNote = `${template.name} 的推荐依据：${driverHeadline}。${template.narrative ?? template.description ?? ''}`;

      return {
        ...template,
        longCount,
        shortCount,
        stance: longCount >= shortCount ? '偏防守/资源端' : '偏对冲/做空端',
        recommendationScore: roundedScore,
        recommendationTier,
        recommendationTone: buildRecommendationTone(roundedScore),
        matchedDrivers: prioritizedDrivers.slice(0, 4),
        driverHeadline,
        resonanceLabel: resonanceMeta.label,
        resonanceReason: resonanceMeta.reason,
        resonanceFactors: resonanceMatches,
        policySourceHealthLabel: policySourceHealth.label,
        policySourceHealthReason: policySourceHealth.reason,
        inputReliabilityLabel: inputReliability.label,
        inputReliabilityScore: inputReliability.score,
        inputReliabilityLead: inputReliability.lead,
        inputReliabilityPosture: inputReliability.posture,
        inputReliabilityReason: inputReliability.reason,
        sourceModeLabel: allocationBias.sourceModeLabel,
        sourceModeDominant: allocationBias.sourceModeDominant,
        sourceModeReason: allocationBias.sourceModeReason,
        sourceModeRiskBudgetScale: allocationBias.sourceModeRiskBudgetScale,
        policyExecutionLabel: allocationBias.policyExecutionLabel,
        policyExecutionScore: allocationBias.policyExecutionScore,
        policyExecutionTopDepartment: allocationBias.policyExecutionTopDepartment,
        policyExecutionReason: allocationBias.policyExecutionReason,
        policyExecutionRiskBudgetScale: allocationBias.policyExecutionRiskBudgetScale,
        adjustedAssets: allocationBias.adjustedAssets,
        rawAdjustedAssets: allocationBias.rawAdjustedAssets,
        biasSummary: allocationBias.biasSummary,
        rawBiasStrength: allocationBias.rawBiasStrength,
        biasStrength: allocationBias.biasStrength,
        biasScale: allocationBias.biasScale,
        biasQualityLabel: allocationBias.biasQualityLabel,
        biasQualityReason: allocationBias.biasQualityReason,
        biasHighlights: allocationBias.biasHighlights,
        biasActions: allocationBias.biasActions,
        signalAttribution: allocationBias.signalAttribution,
        driverSummary: allocationBias.driverSummary,
        dominantDrivers: allocationBias.dominantDrivers,
        coreLegs: allocationBias.coreLegs,
        supportLegs: allocationBias.supportLegs,
        themeCore: (template.theme_core as string) || allocationBias.themeCore || '',
        themeSupport:
          (Array.isArray(template.theme_support)
            ? (template.theme_support as string[]).join('、')
            : (template.theme_support as string)) || allocationBias.themeSupport || '',
        executionPosture: (template.execution_posture as string) || '',
        departmentChaosLabel: allocationBias.departmentChaosLabel,
        departmentChaosScore: allocationBias.departmentChaosScore,
        departmentChaosTopDepartment: allocationBias.departmentChaosTopDepartment,
        departmentChaosReason: allocationBias.departmentChaosReason,
        departmentChaosRiskBudgetScale: allocationBias.departmentChaosRiskBudgetScale,
        peopleFragilityLabel: allocationBias.peopleFragilityLabel,
        peopleFragilityScore: allocationBias.peopleFragilityScore,
        peopleFragilityFocus: allocationBias.peopleFragilityFocus,
        peopleFragilityReason: allocationBias.peopleFragilityReason,
        peopleFragilityRiskBudgetScale: allocationBias.peopleFragilityRiskBudgetScale,
        structuralDecayRadarLabel: allocationBias.structuralDecayRadarLabel,
        structuralDecayRadarDisplayLabel: allocationBias.structuralDecayRadarDisplayLabel,
        structuralDecayRadarScore: allocationBias.structuralDecayRadarScore,
        structuralDecayRadarActionHint: allocationBias.structuralDecayRadarActionHint,
        structuralDecayRadarRiskBudgetScale: allocationBias.structuralDecayRadarRiskBudgetScale,
        structuralDecayRadarTopSignals: allocationBias.structuralDecayRadarTopSignals,
        action: buildAction ? buildAction(template.id as string, actionNote) : null,
      };
    })
    .sort((a, b) => (b.recommendationScore as number) - (a.recommendationScore as number));
};
