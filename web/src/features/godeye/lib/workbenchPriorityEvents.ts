// ---------------------------------------------------------------------------
// workbenchPriorityEvents — ported from frontend/src/utils/workbenchPriorityEvents.js
// Only buildMacroMispricingRefreshPriorityEvent is used by taskIntelligenceViewModels.
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
