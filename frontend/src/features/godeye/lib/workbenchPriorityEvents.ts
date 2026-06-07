// ---------------------------------------------------------------------------
// workbenchPriorityEvents — ported from frontend/src/utils/workbenchPriorityEvents.js
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<string, string> = {
  structural_decay: '结构衰败/系统雷达',
  selection_quality_active: '降级运行',
  people_layer: '人的维度',
  department_chaos: '部门混乱',
  input_reliability: '输入可靠度',
};

const normalizeScore = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export interface PriorityEvent {
  reason_key: string;
  reason_label: string;
  severity: string;
  lead: string;
  detail: string;
  recommendation: string;
  summary: string;
}

const buildEvent = ({
  reasonKey,
  severity,
  lead,
  detail,
  recommendation = '',
  summary = '',
}: {
  reasonKey: string;
  severity: string;
  lead: string;
  detail: string;
  recommendation?: string;
  summary?: string;
}): PriorityEvent | null => {
  if (!reasonKey || !lead) return null;
  return {
    reason_key: reasonKey,
    reason_label: REASON_LABELS[reasonKey] ?? REASON_LABELS.structural_decay,
    severity: severity || 'medium',
    lead,
    detail: detail || '',
    recommendation,
    summary: summary || lead,
  };
};

export const buildMacroMispricingRefreshPriorityEvent = (
  item: Record<string, unknown> = {},
): PriorityEvent | null => {
  const symbol = String(item?.symbol ?? '').trim().toUpperCase() || '该标的';
  const structuralDecay = (item?.structuralDecay as Record<string, unknown>) ?? {};
  const peopleLayer = (item?.peopleLayer as Record<string, unknown>) ?? {};
  const score = normalizeScore(
    (structuralDecay?.score as number) ?? (peopleLayer?.people_fragility_score as number)
  );

  if (score >= 0.6 || String(structuralDecay?.label ?? '').includes('衰败')) {
    return buildEvent({
      reasonKey: 'structural_decay',
      severity: score >= 0.75 ? 'high' : 'medium',
      lead: (structuralDecay?.summary as string) || `${symbol} 已进入结构性衰败观察名单`,
      detail: [
        score ? `衰败分 ${score.toFixed(2)}` : '',
        (structuralDecay?.dominant_failure_label as string)
          ? `主导失效 ${structuralDecay.dominant_failure_label}`
          : '',
        (peopleLayer?.summary as string) || '',
      ].filter(Boolean).join('；'),
      recommendation: ((item?.macroMispricingThesis as Record<string, unknown>)?.summary as string) || '',
      summary: (structuralDecay?.summary as string) || '',
    });
  }

  if (
    String(peopleLayer?.risk_level ?? '').toLowerCase() === 'high' ||
    normalizeScore(peopleLayer?.people_fragility_score) >= 0.6
  ) {
    return buildEvent({
      reasonKey: 'people_layer',
      severity: 'medium',
      lead: (peopleLayer?.summary as string) || `${symbol} 的人的维度风险值得持续跟踪`,
      detail: [
        (peopleLayer?.people_fragility_score as number) != null
          ? `组织脆弱度 ${normalizeScore(peopleLayer.people_fragility_score).toFixed(2)}`
          : '',
        (peopleLayer?.risk_level as string) ? `风险等级 ${peopleLayer.risk_level}` : '',
      ].filter(Boolean).join('；'),
      summary: (peopleLayer?.summary as string) || '',
    });
  }

  return null;
};

const isNonStableLabel = (label = '', unstableLabels: string[] = []): boolean =>
  unstableLabels.includes(String(label || '').trim().toLowerCase());

export const buildPricingRefreshPriorityEvent = (
  pricingResult: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
): PriorityEvent | null => {
  const symbol = String(context?.symbol ?? pricingResult?.symbol ?? '').trim().toUpperCase() || '该标的';
  const structuralDecay = (pricingResult?.structural_decay
    ?? (pricingResult?.implications as Record<string, unknown>)?.structural_decay
    ?? {}) as Record<string, unknown>;
  const peopleLayer = (pricingResult?.people_layer ?? {}) as Record<string, unknown>;
  const macroMispricing = (pricingResult?.macro_mispricing_thesis
    ?? (pricingResult?.implications as Record<string, unknown>)?.macro_mispricing_thesis
    ?? {}) as Record<string, unknown>;
  const structuralScore = normalizeScore(structuralDecay?.score);

  if (structuralScore >= 0.6 || String(structuralDecay?.label ?? '').includes('衰败')) {
    return buildEvent({
      reasonKey: 'structural_decay',
      severity: structuralScore >= 0.75 ? 'high' : 'medium',
      lead: String(structuralDecay?.summary ?? '') || `${symbol} 的结构性衰败证据正在主导当前研究优先级`,
      detail: [
        structuralScore ? `衰败分 ${structuralScore.toFixed(2)}` : '',
        structuralDecay?.dominant_failure_label ? `主导失效 ${structuralDecay.dominant_failure_label}` : '',
        String(peopleLayer?.summary ?? '') || '',
      ].filter(Boolean).join('；'),
      recommendation: macroMispricing?.stance
        ? `建议按${macroMispricing.stance}视角继续跟踪该任务。`
        : '',
      summary: String(structuralDecay?.summary ?? '') || '',
    });
  }

  if (
    String(peopleLayer?.risk_level ?? '').toLowerCase() === 'high'
    || String(peopleLayer?.stance ?? '').toLowerCase() === 'fragile'
  ) {
    return buildEvent({
      reasonKey: 'people_layer',
      severity: 'medium',
      lead: String(peopleLayer?.summary ?? '') || `${symbol} 的人的维度信号偏脆弱，值得优先跟踪`,
      detail: [
        peopleLayer?.risk_level ? `风险等级 ${peopleLayer.risk_level}` : '',
        peopleLayer?.stance ? `组织姿态 ${peopleLayer.stance}` : '',
      ].filter(Boolean).join('；'),
      summary: String(peopleLayer?.summary ?? '') || '',
    });
  }

  return null;
};

export const buildCrossMarketRefreshPriorityEvent = (
  template: Record<string, unknown> = {},
  backtestResult: Record<string, unknown> | null = null,
  researchInputs: Record<string, unknown> = {},
): PriorityEvent | null => {
  const macroOverview = (researchInputs?.macroOverview ?? {}) as Record<string, unknown>;
  const taskLabel = String(template?.name ?? template?.template_name ?? template?.id ?? '当前跨市场模板');
  const allocationOverlay = (backtestResult?.allocation_overlay ?? {}) as Record<string, unknown>;
  const selectionQuality = (allocationOverlay.selection_quality ?? {}) as Record<string, unknown>;
  const rankingPenalty = normalizeScore(
    selectionQuality?.ranking_penalty ?? template?.rankingPenalty
  );
  const templateSelectionLabel = rankingPenalty > 0
    ? String(template?.biasQualityLabel ?? template?.selectionQualityLabel ?? 'softened')
    : '';
  const selectionLabel = String(selectionQuality?.label ?? templateSelectionLabel ?? '').trim().toLowerCase();

  if (selectionLabel && !['original', 'full', 'stable'].includes(selectionLabel)) {
    const baseScore = selectionQuality?.base_recommendation_score ?? template?.baseRecommendationScore ?? null;
    const effectiveScore = selectionQuality?.effective_recommendation_score ?? template?.recommendationScore ?? null;
    const displaySelectionLabel = String(selectionQuality?.label ?? templateSelectionLabel ?? selectionLabel);
    return buildEvent({
      reasonKey: 'selection_quality_active',
      severity: rankingPenalty >= 0.3 ? 'high' : 'medium',
      lead: `${taskLabel} 当前按 ${displaySelectionLabel} 强度运行，已进入优先复核区`,
      detail: [
        baseScore != null && effectiveScore != null
          ? `推荐分 ${Number(baseScore).toFixed(2)}→${Number(effectiveScore).toFixed(2)}`
          : '',
        String(selectionQuality?.reason ?? template?.rankingPenaltyReason ?? '') || '',
      ].filter(Boolean).join('；'),
      recommendation: String(selectionQuality?.reason ?? template?.rankingPenaltyReason ?? '') || '',
      summary: String(selectionQuality?.reason ?? '') || '',
    });
  }

  const radar = (macroOverview?.structural_decay_radar ?? {}) as Record<string, unknown>;
  const radarLabel = String(radar?.label ?? template?.structuralDecayRadarLabel ?? '').trim().toLowerCase();
  const radarScore = normalizeScore(radar?.score ?? template?.structuralDecayRadarScore);
  if (isNonStableLabel(radarLabel, ['decay_alert', 'decay_watch']) || radarScore >= 0.6) {
    const topSignals = ((radar?.top_signals ?? template?.structuralDecayRadarTopSignals ?? []) as Array<Record<string, unknown>>)
      .slice(0, 3)
      .map((item) => String(item?.label ?? item?.axis ?? item?.name ?? ''))
      .filter(Boolean)
      .join(' / ');
    return buildEvent({
      reasonKey: 'structural_decay',
      severity: radarLabel === 'decay_alert' || radarScore >= 0.75 ? 'high' : 'medium',
      lead: String(radar?.action_hint ?? template?.structuralDecayRadarActionHint ?? '') || `${taskLabel} 对应的系统衰败雷达正在升温`,
      detail: [
        radarScore ? `雷达分 ${radarScore.toFixed(2)}` : '',
        topSignals ? `雷达焦点 ${topSignals}` : '',
      ].filter(Boolean).join('；'),
      summary: String(radar?.display_label ?? radar?.label ?? '') || '',
    });
  }

  const peopleLabel = String(template?.peopleFragilityLabel ?? '').trim().toLowerCase();
  const peopleScore = normalizeScore(template?.peopleFragilityScore);
  if (isNonStableLabel(peopleLabel, ['fragile', 'watch']) || peopleScore >= 0.6) {
    return buildEvent({
      reasonKey: 'people_layer',
      severity: peopleScore >= 0.75 ? 'high' : 'medium',
      lead: String(template?.peopleFragilityReason ?? '') || `${taskLabel} 的人的维度出现脆弱迹象`,
      detail: [
        peopleScore ? `组织脆弱度 ${peopleScore.toFixed(2)}` : '',
        template?.peopleFragilityFocus ? `关注公司 ${template.peopleFragilityFocus}` : '',
      ].filter(Boolean).join('；'),
      summary: String(template?.peopleFragilityReason ?? '') || '',
    });
  }

  const deptChaosSummary = (macroOverview?.department_chaos_summary ?? {}) as Record<string, unknown>;
  const departmentLabel = String(
    deptChaosSummary?.label ?? template?.departmentChaosLabel ?? ''
  ).trim().toLowerCase();
  const departmentScore = normalizeScore(
    deptChaosSummary?.avg_chaos_score ?? template?.departmentChaosScore
  );
  if (isNonStableLabel(departmentLabel, ['chaotic', 'watch']) || departmentScore >= 0.45) {
    return buildEvent({
      reasonKey: 'department_chaos',
      severity: departmentLabel === 'chaotic' || departmentScore >= 0.65 ? 'high' : 'medium',
      lead: String(template?.departmentChaosReason ?? deptChaosSummary?.summary ?? '') || `${taskLabel} 关联的部门政策出现明显混乱`,
      detail: [
        departmentScore ? `混乱度 ${departmentScore.toFixed(2)}` : '',
        template?.departmentChaosTopDepartment ? `部门焦点 ${template.departmentChaosTopDepartment}` : '',
      ].filter(Boolean).join('；'),
      summary: String(template?.departmentChaosReason ?? deptChaosSummary?.summary ?? '') || '',
    });
  }

  const inputReliability = (macroOverview?.input_reliability_summary ?? {}) as Record<string, unknown>;
  const reliabilityLabel = String(inputReliability?.label ?? '').trim().toLowerCase();
  if (isNonStableLabel(reliabilityLabel, ['watch', 'fragile'])) {
    return buildEvent({
      reasonKey: 'input_reliability',
      severity: reliabilityLabel === 'fragile' ? 'high' : 'medium',
      lead: String(inputReliability?.lead ?? '') || `${taskLabel} 的输入可靠度需要持续观察`,
      detail: [
        inputReliability?.score != null ? `可靠度 ${normalizeScore(inputReliability.score).toFixed(2)}` : '',
        String(inputReliability?.reason ?? '') || '',
      ].filter(Boolean).join('；'),
      summary: String(inputReliability?.reason ?? inputReliability?.lead ?? '') || '',
    });
  }

  return null;
};

export const buildTradeThesisRefreshPriorityEvent = (
  draft: Record<string, unknown> = {},
  template: Record<string, unknown> = {},
  backtestResult: Record<string, unknown> | null = null,
  researchInputs: Record<string, unknown> = {},
): PriorityEvent | null => {
  const structuralDecay = (draft?.structuralDecay ?? {}) as Record<string, unknown>;
  const peopleLayer = (draft?.peopleLayer ?? {}) as Record<string, unknown>;
  const symbol = String(draft?.symbol ?? '').trim().toUpperCase() || '该组合';
  const structuralScore = normalizeScore(structuralDecay?.score);

  if (structuralScore >= 0.6 || String(structuralDecay?.label ?? '').includes('衰败')) {
    return buildEvent({
      reasonKey: 'structural_decay',
      severity: structuralScore >= 0.75 ? 'high' : 'medium',
      lead: String(structuralDecay?.summary ?? '') || `${symbol} 的结构性衰败逻辑正在驱动该交易 Thesis`,
      detail: [
        structuralScore ? `衰败分 ${structuralScore.toFixed(2)}` : '',
        String(structuralDecay?.label ?? '') || '',
      ].filter(Boolean).join('；'),
      recommendation: String((draft?.thesis as Record<string, unknown>)?.summary ?? draft?.note ?? '') || '',
      summary: String(structuralDecay?.summary ?? (draft?.thesis as Record<string, unknown>)?.summary ?? '') || '',
    });
  }

  if (String(peopleLayer?.risk_level ?? '').toLowerCase() === 'high') {
    return buildEvent({
      reasonKey: 'people_layer',
      severity: 'medium',
      lead: String((draft?.thesis as Record<string, unknown>)?.summary ?? '') || `${symbol} 的人的维度风险正在支撑当前 Thesis`,
      detail: [
        peopleLayer?.risk_level ? `风险等级 ${peopleLayer.risk_level}` : '',
        String(draft?.note ?? '') || '',
      ].filter(Boolean).join('；'),
      summary: String((draft?.thesis as Record<string, unknown>)?.summary ?? '') || '',
    });
  }

  return buildCrossMarketRefreshPriorityEvent(template, backtestResult, researchInputs);
};
