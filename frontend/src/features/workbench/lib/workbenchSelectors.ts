// ---------------------------------------------------------------------------
// workbenchSelectors — ported from
// frontend/src/components/research-workbench/workbenchSelectors.js
// ---------------------------------------------------------------------------

import { buildSnapshotComparison } from './snapshotCompare';
import {
  MAIN_STATUSES,
  extractSnapshotViewContext,
  extractLatestRefreshPriorityEvent,
  sortTasksByRefreshPriority,
  sortByBoardOrder,
  TIMELINE_COLOR,
  formatRefreshPriorityChangeLabel,
  formatTimelineType,
  formatRefreshReasonLabel,
  getRefreshPriorityChangeColor,
} from './workbenchUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefreshSignal {
  severity?: string;
  urgencyScore?: number;
  priorityWeight?: number;
  priorityReason?: string;
  recommendation?: string;
  summary?: string;
  resonanceDriven?: boolean;
  policySourceDriven?: boolean;
  inputReliabilityDriven?: boolean;
  biasCompressionDriven?: boolean;
  selectionQualityDriven?: boolean;
  reviewContextDriven?: boolean;
  structuralDecayDriven?: boolean;
  structuralDecayRadarDriven?: boolean;
  tradeThesisDriven?: boolean;
  peopleLayerDriven?: boolean;
  departmentChaosDriven?: boolean;
  biasCompressionShift?: Record<string, unknown>;
  selectionQualityRunState?: Record<string, unknown>;
  reviewContextShift?: Record<string, unknown>;
  structuralDecayRadarShift?: Record<string, unknown>;
  peopleLayerShift?: Record<string, unknown>;
  structuralDecayShift?: Record<string, unknown>;
  tradeThesisShift?: Record<string, unknown>;
  departmentChaosShift?: Record<string, unknown>;
  inputReliabilityShift?: Record<string, unknown>;
  [key: string]: unknown;
}

interface WorkbenchFilters {
  type?: string;
  source?: string;
  refresh?: string;
  reason?: string;
  snapshotView?: string;
  snapshotFingerprint?: string;
  snapshotSummary?: string;
  keyword?: string;
}

interface WorkbenchTask {
  id: string;
  title?: string;
  symbol?: string;
  template?: string;
  note?: string;
  type?: string;
  source?: string;
  status?: string;
  snapshot?: Record<string, unknown> | null;
  timeline?: Array<Record<string, unknown>>;
  updated_at?: string;
  created_at?: string;
  board_order?: number;
  [key: string]: unknown;
}

interface PriorityMeta {
  reasonKey: string;
  reasonLabel: string;
  alertType: string;
  severity: string;
  urgencyScore: number;
  priorityWeight: number;
  lead: string;
  detail: string;
}

interface EventPayload {
  reason_key: string;
  reason_label: string;
  severity: string;
  urgency_score: number;
  priority_weight: number;
  lead: string;
  detail: string;
  recommendation: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// buildRefreshStats
// ---------------------------------------------------------------------------

export function buildRefreshStats(
  refreshSignals: { prioritized?: RefreshSignal[] },
  tasks: WorkbenchTask[] = [],
) {
  const prioritized = refreshSignals.prioritized || [];
  const latestPriorityEvents = (tasks || [])
    .map((task) => extractLatestRefreshPriorityEvent(task))
    .filter(Boolean);
  const snapshotViewContexts = (tasks || []).map((task) => extractSnapshotViewContext(task.snapshot ?? null));
  return {
    high: prioritized.filter((item) => item.severity === 'high').length,
    medium: prioritized.filter((item) => item.severity === 'medium').length,
    low: prioritized.filter((item) => item.severity === 'low').length,
    resonance: prioritized.filter((item) => item.resonanceDriven).length,
    biasQualityCore: prioritized.filter((item) => (item.biasCompressionShift as Record<string, unknown>)?.coreLegAffected).length,
    selectionQualityActive: prioritized.filter((item) => (item.selectionQualityRunState as Record<string, unknown>)?.active).length,
    reviewContext: prioritized.filter((item) => item.reviewContextDriven).length,
    structuralDecay: prioritized.filter((item) => item.structuralDecayDriven || item.structuralDecayRadarDriven).length,
    structuralDecayRadar: prioritized.filter((item) => item.structuralDecayRadarDriven).length,
    tradeThesis: prioritized.filter((item) => item.tradeThesisDriven).length,
    peopleLayer: prioritized.filter((item) => item.peopleLayerDriven).length,
    peopleFragility: prioritized.filter((item) => item.peopleLayerDriven).length,
    departmentChaos: prioritized.filter((item) => item.departmentChaosDriven).length,
    policyExecution: prioritized.filter((item) => item.departmentChaosDriven).length,
    selectionQuality: prioritized.filter((item) => item.selectionQualityDriven || (item.selectionQualityRunState as Record<string, unknown>)?.active).length,
    inputReliability: prioritized.filter((item) => item.inputReliabilityDriven).length,
    sourceHealthDegradation: prioritized.filter((item) => item.inputReliabilityDriven || item.policySourceDriven).length,
    policySource: prioritized.filter((item) => item.policySourceDriven).length,
    biasQuality: prioritized.filter((item) => item.biasCompressionDriven).length,
    priorityEscalated: latestPriorityEvents.filter((event) => (event?.meta as Record<string, unknown>)?.change_type === 'escalated').length,
    priorityRelaxed: latestPriorityEvents.filter((event) => (event?.meta as Record<string, unknown>)?.change_type === 'relaxed').length,
    priorityNew: latestPriorityEvents.filter((event) => (event?.meta as Record<string, unknown>)?.change_type === 'new').length,
    priorityUpdated: latestPriorityEvents.filter((event) => (event?.meta as Record<string, unknown>)?.change_type === 'updated').length,
    snapshotViewFiltered: snapshotViewContexts.filter((item) => item.hasFilters || item.summary).length,
    snapshotViewScoped: snapshotViewContexts.filter((item) => item.scopedTaskLabel).length,
  };
}

// ---------------------------------------------------------------------------
// filterWorkbenchTasks
// ---------------------------------------------------------------------------

export function filterWorkbenchTasks(
  tasks: WorkbenchTask[],
  filters: WorkbenchFilters,
  refreshSignalsByTaskId: Record<string, RefreshSignal>,
): WorkbenchTask[] {
  const keyword = (filters.keyword ?? '').trim().toLowerCase();
  const matches = tasks.filter((task) => {
    const signal = refreshSignalsByTaskId[task.id];
    const latestPriorityEvent = extractLatestRefreshPriorityEvent(task);
    const snapshotViewContext = extractSnapshotViewContext(task.snapshot ?? null);
    if (filters.type && task.type !== filters.type) return false;
    if (filters.source && task.source !== filters.source) return false;
    if (filters.refresh) {
      const severity = signal?.severity || 'low';
      if (severity !== filters.refresh) return false;
    }
    if (filters.snapshotView === 'filtered' && !(snapshotViewContext.hasFilters || snapshotViewContext.summary)) return false;
    if (filters.snapshotView === 'scoped' && !snapshotViewContext.scopedTaskLabel) return false;
    if (filters.snapshotFingerprint) {
      const fingerprintMatches = snapshotViewContext.fingerprint === filters.snapshotFingerprint;
      const legacySummaryMatches = !snapshotViewContext.fingerprint
        && filters.snapshotSummary
        && snapshotViewContext.summary === filters.snapshotSummary;
      if (!fingerprintMatches && !legacySummaryMatches) return false;
    } else if (filters.snapshotSummary && snapshotViewContext.summary !== filters.snapshotSummary) {
      return false;
    }
    const latestMeta = (latestPriorityEvent?.meta as Record<string, unknown>) ?? {};
    if (filters.reason === 'priority_new' && latestMeta?.change_type !== 'new') return false;
    if (filters.reason === 'priority_escalated' && latestMeta?.change_type !== 'escalated') return false;
    if (filters.reason === 'priority_relaxed' && latestMeta?.change_type !== 'relaxed') return false;
    if (filters.reason === 'priority_updated' && latestMeta?.change_type !== 'updated') return false;
    if (filters.reason === 'resonance' && !signal?.resonanceDriven) return false;
    if (filters.reason === 'policy_source' && !signal?.policySourceDriven) return false;
    if (filters.reason === 'input_reliability' && !signal?.inputReliabilityDriven) return false;
    if (filters.reason === 'source_health_degradation' && !(signal?.inputReliabilityDriven || signal?.policySourceDriven)) return false;
    if (filters.reason === 'bias_quality_core' && !(signal?.biasCompressionShift as Record<string, unknown>)?.coreLegAffected) return false;
    if (filters.reason === 'selection_quality_active' && !(signal?.selectionQualityRunState as Record<string, unknown>)?.active) return false;
    if (filters.reason === 'review_context' && !signal?.reviewContextDriven) return false;
    if (filters.reason === 'structural_decay' && !(signal?.structuralDecayDriven || signal?.structuralDecayRadarDriven)) return false;
    if (filters.reason === 'trade_thesis' && !signal?.tradeThesisDriven) return false;
    if ((filters.reason === 'people_layer' || filters.reason === 'people_fragility') && !signal?.peopleLayerDriven) return false;
    if ((filters.reason === 'department_chaos' || filters.reason === 'policy_execution') && !signal?.departmentChaosDriven) return false;
    if (filters.reason === 'selection_quality' && !(signal?.selectionQualityDriven || (signal?.selectionQualityRunState as Record<string, unknown>)?.active)) {
      return false;
    }
    if (filters.reason === 'bias_quality' && !signal?.biasCompressionDriven) return false;
    if (!keyword) return true;
    const haystack = [
      task.title,
      task.symbol,
      task.template,
      task.note,
      (task.snapshot as Record<string, unknown>)?.headline,
      (task.snapshot as Record<string, unknown>)?.summary,
      snapshotViewContext.summary,
      snapshotViewContext.scopedTaskLabel,
      snapshotViewContext.note,
    ].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });

  return sortTasksByRefreshPriority(
    matches,
    refreshSignalsByTaskId,
    Boolean(filters.refresh || filters.reason),
  );
}

// ---------------------------------------------------------------------------
// buildOpenTaskPriorityLabel
// ---------------------------------------------------------------------------

export function buildOpenTaskPriorityLabel(selectedTaskRefreshSignal: RefreshSignal | null = null): string {
  return (selectedTaskRefreshSignal?.selectionQualityRunState as Record<string, unknown>)?.active
    ? '优先重看研究页'
    : (selectedTaskRefreshSignal?.reviewContextShift as Record<string, unknown>)?.enteredReview
      ? '按复核结果重看'
    : (selectedTaskRefreshSignal?.reviewContextShift as Record<string, unknown>)?.exitedReview
      ? '确认恢复普通结果'
    : selectedTaskRefreshSignal?.reviewContextDriven
      ? '重新确认结果语境'
    : selectedTaskRefreshSignal?.structuralDecayRadarDriven
      ? '优先复核系统衰败雷达'
    : selectedTaskRefreshSignal?.structuralDecayDriven
      ? '优先复核衰败判断'
    : selectedTaskRefreshSignal?.tradeThesisDriven
      ? '优先复核交易 Thesis'
    : selectedTaskRefreshSignal?.peopleLayerDriven
      ? '优先复核人的维度'
    : selectedTaskRefreshSignal?.departmentChaosDriven
      ? '复核部门混乱'
    : (selectedTaskRefreshSignal?.inputReliabilityShift as Record<string, unknown>)?.enteredFragile
      ? '先复核输入可靠度'
    : (selectedTaskRefreshSignal?.inputReliabilityShift as Record<string, unknown>)?.recoveredRobust
      ? '确认恢复正常强度'
    : selectedTaskRefreshSignal?.inputReliabilityDriven
      ? '重新确认输入质量'
    : '重新打开研究页';
}

// ---------------------------------------------------------------------------
// buildOpenTaskPriorityNote
// ---------------------------------------------------------------------------

export function buildOpenTaskPriorityNote(
  selectedTask: WorkbenchTask | null = null,
  selectedTaskRefreshSignal: RefreshSignal | null = null,
): string {
  if (!selectedTask) return '';
  const runState = (selectedTaskRefreshSignal?.selectionQualityRunState as Record<string, unknown>);
  if (runState?.active) {
    return `${
      selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`
    } · 当前结果已按 ${runState.label} 强度运行，建议优先重看`;
  }
  const reviewHint = (selectedTaskRefreshSignal?.reviewContextShift as Record<string, unknown>)?.actionHint;
  if (reviewHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${reviewHint}`;
  }
  const radarHint = (selectedTaskRefreshSignal?.structuralDecayRadarShift as Record<string, unknown>)?.actionHint;
  if (radarHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${radarHint}`;
  }
  const peopleHint = (selectedTaskRefreshSignal?.peopleLayerShift as Record<string, unknown>)?.actionHint;
  if (peopleHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${peopleHint}`;
  }
  const decayHint = (selectedTaskRefreshSignal?.structuralDecayShift as Record<string, unknown>)?.actionHint;
  if (decayHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${decayHint}`;
  }
  const thesisHint = (selectedTaskRefreshSignal?.tradeThesisShift as Record<string, unknown>)?.actionHint;
  if (thesisHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${thesisHint}`;
  }
  const chaosHint = (selectedTaskRefreshSignal?.departmentChaosShift as Record<string, unknown>)?.actionHint;
  if (chaosHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${chaosHint}`;
  }
  const reliabilityHint = (selectedTaskRefreshSignal?.inputReliabilityShift as Record<string, unknown>)?.actionHint;
  if (reliabilityHint) {
    return `${selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`} · ${reliabilityHint}`;
  }
  return String(selectedTask.note || `从研究工作台重新打开 ${selectedTask.title}`);
}

// ---------------------------------------------------------------------------
// buildRefreshPriorityMeta
// ---------------------------------------------------------------------------

export function buildRefreshPriorityMeta(selectedTaskRefreshSignal: RefreshSignal | null = null): PriorityMeta | null {
  if (!selectedTaskRefreshSignal || selectedTaskRefreshSignal.severity === 'low') {
    return null;
  }

  const reasonKey = selectedTaskRefreshSignal.priorityReason as string || 'observe';
  const reasonLabel = formatRefreshReasonLabel(reasonKey);
  const urgencyScore = Number(selectedTaskRefreshSignal.urgencyScore || 0);
  const priorityWeight = Number(selectedTaskRefreshSignal.priorityWeight || 0);
  const metrics = [
    selectedTaskRefreshSignal.urgencyScore !== undefined
      ? `紧急度 ${urgencyScore.toFixed(1)}`
      : '',
    selectedTaskRefreshSignal.priorityWeight !== undefined
      ? `排序权重 ${priorityWeight.toFixed(1)}`
      : '',
  ].filter(Boolean).join(' · ');

  const buildMeta = (lead: string, detail: string): PriorityMeta => ({
    reasonKey,
    reasonLabel,
    alertType: selectedTaskRefreshSignal.severity === 'high' ? 'error' : 'warning',
    severity: selectedTaskRefreshSignal.severity || 'medium',
    urgencyScore,
    priorityWeight,
    lead: lead || String(selectedTaskRefreshSignal.summary || '') || '当前任务的输入结构已变化，建议优先复核。',
    detail: [metrics, detail].filter(Boolean).join('；'),
  });

  const runState = (selectedTaskRefreshSignal.selectionQualityRunState as Record<string, unknown>);
  if (runState?.active) {
    return buildMeta(
      '当前保存结果已经处于降级运行状态',
      [
        runState.label ? `当前按 ${runState.label} 强度运行` : '',
        runState.baseScore || runState.effectiveScore
          ? `推荐分 ${Number(runState.baseScore || 0).toFixed(2)}→${Number(runState.effectiveScore || 0).toFixed(2)}`
          : '',
        String(runState.reason || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.structuralDecayRadarDriven) {
    const shift = (selectedTaskRefreshSignal.structuralDecayRadarShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.lead || '') || '系统级结构衰败雷达正在驱动当前任务的自动排序',
      [
        shift.topSignalSummary ? `雷达焦点 ${shift.topSignalSummary}` : '',
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.structuralDecayDriven) {
    const shift = (selectedTaskRefreshSignal.structuralDecayShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.lead || '') || '结构性衰败判断较保存时进一步恶化',
      [
        shift.evidenceSummary ? `衰败证据 ${shift.evidenceSummary}` : '',
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.tradeThesisDriven) {
    const shift = (selectedTaskRefreshSignal.tradeThesisShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.lead || '') || '交易 Thesis 与最新证据出现漂移',
      [
        shift.evidenceSummary ? `Thesis 证据 ${shift.evidenceSummary}` : '',
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.peopleLayerDriven) {
    const shift = (selectedTaskRefreshSignal.peopleLayerShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.lead || '') || '人的维度较保存时明显走弱',
      [
        shift.evidenceSummary ? `人事证据 ${shift.evidenceSummary}` : '',
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.departmentChaosDriven) {
    const shift = (selectedTaskRefreshSignal.departmentChaosShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.lead || '') || '部门级政策混乱较保存时明显恶化',
      [
        shift.topDepartmentLabel ? `部门焦点 ${shift.topDepartmentLabel}` : '',
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  if (selectedTaskRefreshSignal.inputReliabilityDriven) {
    const shift = (selectedTaskRefreshSignal.inputReliabilityShift ?? {}) as Record<string, unknown>;
    return buildMeta(
      String(shift.currentLead || '') || '输入可靠度正在影响当前任务的优先级',
      [
        String(shift.currentSummary || '') || '',
        String(shift.actionHint || '') || String(selectedTaskRefreshSignal.recommendation || ''),
      ].filter(Boolean).join('；'),
    );
  }

  return buildMeta(
    `${reasonLabel} 正在驱动当前任务的自动排序`,
    String(selectedTaskRefreshSignal.recommendation || '') || String(selectedTaskRefreshSignal.summary || '') || '',
  );
}

// ---------------------------------------------------------------------------
// buildRefreshPriorityEventPayload
// ---------------------------------------------------------------------------

export function buildRefreshPriorityEventPayload(
  selectedTaskRefreshSignal: RefreshSignal | null = null,
  selectedTaskPriorityMeta: PriorityMeta | null = null,
): EventPayload | null {
  if (!selectedTaskRefreshSignal || !selectedTaskPriorityMeta) {
    return null;
  }

  return {
    reason_key: selectedTaskPriorityMeta.reasonKey,
    reason_label: selectedTaskPriorityMeta.reasonLabel,
    severity: selectedTaskPriorityMeta.severity,
    urgency_score: selectedTaskPriorityMeta.urgencyScore,
    priority_weight: selectedTaskPriorityMeta.priorityWeight,
    lead: selectedTaskPriorityMeta.lead,
    detail: selectedTaskPriorityMeta.detail,
    recommendation: selectedTaskRefreshSignal.recommendation as string || '',
    summary: selectedTaskRefreshSignal.summary as string || '',
  };
}

// ---------------------------------------------------------------------------
// buildLatestSnapshotComparison
// ---------------------------------------------------------------------------

export function buildLatestSnapshotComparison(selectedTask: WorkbenchTask | null = null) {
  const history = (selectedTask?.snapshot_history as Array<Record<string, unknown>>) || [];
  if (history.length < 2) return null;
  return buildSnapshotComparison(selectedTask?.type as string, history[1], history[0]);
}

// ---------------------------------------------------------------------------
// buildRefreshPriorityChangeMeta (internal)
// ---------------------------------------------------------------------------

const getSeverityRank = (value: unknown): number => ({
  low: 1,
  medium: 2,
  high: 3,
}[String(value || '').trim()] || 0);

const buildRefreshPriorityChangeMeta = (eventPayload: EventPayload | null = null, timeline: Array<Record<string, unknown>> = []) => {
  if (!eventPayload) {
    return {
      changeType: 'new',
      changeLabel: formatRefreshPriorityChangeLabel('new'),
      changeColor: getRefreshPriorityChangeColor('new'),
    };
  }

  const latestRefreshPriorityEvent = (timeline || []).find((event) => event?.type === 'refresh_priority');
  if (!latestRefreshPriorityEvent) {
    return {
      changeType: 'new',
      changeLabel: formatRefreshPriorityChangeLabel('new'),
      changeColor: getRefreshPriorityChangeColor('new'),
    };
  }

  const previousMeta = (latestRefreshPriorityEvent?.meta ?? {}) as Record<string, unknown>;
  const urgencyDelta = (
    eventPayload.urgency_score !== undefined
    && previousMeta.urgency_score !== undefined
    && previousMeta.urgency_score !== null
  )
    ? Number(eventPayload.urgency_score || 0) - Number(previousMeta.urgency_score || 0)
    : null;
  const priorityWeightDelta = (
    eventPayload.priority_weight !== undefined
    && previousMeta.priority_weight !== undefined
    && previousMeta.priority_weight !== null
  )
    ? Number(eventPayload.priority_weight || 0) - Number(previousMeta.priority_weight || 0)
    : null;
  const severityDelta = getSeverityRank(eventPayload.severity) - getSeverityRank(previousMeta.severity);
  const reasonChanged = (eventPayload.reason_key || '') !== (String(previousMeta.priority_reason || '') || String(previousMeta.reason_key || ''));

  let changeType = 'updated';
  if (severityDelta > 0 || (urgencyDelta !== null && urgencyDelta > 0.25) || (priorityWeightDelta !== null && priorityWeightDelta > 0.25)) {
    changeType = 'escalated';
  } else if (
    severityDelta < 0
    || (urgencyDelta !== null && urgencyDelta < -0.25)
    || (priorityWeightDelta !== null && priorityWeightDelta < -0.25)
  ) {
    changeType = 'relaxed';
  }

  return {
    changeType,
    changeLabel: formatRefreshPriorityChangeLabel(changeType),
    changeColor: getRefreshPriorityChangeColor(changeType),
    reasonChanged,
    previousReasonLabel: String(previousMeta.reason_label || ''),
    previousSeverity: String(previousMeta.severity || ''),
    urgencyDelta,
    priorityWeightDelta,
    severityDelta,
  };
};

const buildRefreshPriorityTimelineLabel = (reasonLabel: string, changeType = 'new'): string => {
  if (changeType === 'escalated') {
    return `系统自动重排升级：${reasonLabel}`;
  }
  if (changeType === 'relaxed') {
    return `系统自动重排缓和：${reasonLabel}`;
  }
  if (changeType === 'updated') {
    return `系统自动重排更新：${reasonLabel}`;
  }
  return `系统自动重排：${reasonLabel}`;
};

const matchesPriorityEvent = (
  event: Record<string, unknown>,
  eventPayload: EventPayload,
  detail: string,
  label: string,
  reasonLabel: string,
): boolean => (
  event?.type === 'refresh_priority'
  && event?.detail === detail
  && (String((event?.meta as Record<string, unknown>)?.priority_reason || '') || String((event?.meta as Record<string, unknown>)?.reason_key || '')) === (eventPayload?.reason_key || '')
  && (
    event?.label === label
    || String(event?.label || '').endsWith(`：${reasonLabel}`)
  )
);

// ---------------------------------------------------------------------------
// buildPriorityTimelineEvent
// ---------------------------------------------------------------------------

export function buildPriorityTimelineEvent(
  selectedTask: WorkbenchTask | null = null,
  selectedTaskRefreshSignal: RefreshSignal | null = null,
  selectedTaskPriorityMeta: PriorityMeta | null = null,
  timeline: Array<Record<string, unknown>> = [],
) {
  if (!selectedTask || !selectedTaskRefreshSignal || !selectedTaskPriorityMeta) {
    return null;
  }

  const eventPayload = buildRefreshPriorityEventPayload(selectedTaskRefreshSignal, selectedTaskPriorityMeta);
  if (!eventPayload) {
    return null;
  }

  const changeMeta = buildRefreshPriorityChangeMeta(eventPayload, timeline);
  const detail = [
    selectedTaskPriorityMeta.lead,
    selectedTaskPriorityMeta.detail,
  ].filter(Boolean).join('；');
  const label = buildRefreshPriorityTimelineLabel(selectedTaskPriorityMeta.reasonLabel, changeMeta.changeType);

  if ((timeline || []).some((event) => matchesPriorityEvent(
    event,
    eventPayload,
    detail,
    label,
    selectedTaskPriorityMeta.reasonLabel,
  ))) {
    return null;
  }

  return {
    id: `synthetic_refresh_priority_${selectedTask.id}`,
    type: 'refresh_priority',
    label,
    detail,
    created_at: selectedTask.updated_at || (selectedTask.snapshot as Record<string, unknown>)?.saved_at || selectedTask.created_at || '',
    meta: {
      ...eventPayload,
      change_type: changeMeta.changeType,
      change_label: changeMeta.changeLabel,
      synthetic: true,
    },
  };
}

// ---------------------------------------------------------------------------
// buildTimelineItems
// ---------------------------------------------------------------------------

export function buildTimelineItems(
  timeline: Array<Record<string, unknown>>,
  showAllTimeline: boolean,
  selectedTask: WorkbenchTask | null = null,
  selectedTaskRefreshSignal: RefreshSignal | null = null,
  selectedTaskPriorityMeta: PriorityMeta | null = null,
) {
  const syntheticPriorityEvent = buildPriorityTimelineEvent(
    selectedTask,
    selectedTaskRefreshSignal,
    selectedTaskPriorityMeta,
    timeline,
  );
  const sourceTimeline = syntheticPriorityEvent
    ? [syntheticPriorityEvent, ...(timeline || [])]
    : (timeline || []);
  const visible = showAllTimeline ? sourceTimeline : sourceTimeline.slice(0, 8);
  return visible.map((event) => ({
    color: TIMELINE_COLOR[String(event.type)] || 'blue',
    dot: event.type === 'comment_added' ? 'comment' : 'clock',
    children: {
      changeLabel: String((event?.meta as Record<string, unknown>)?.change_label || ''),
      changeColor: getRefreshPriorityChangeColor(String((event?.meta as Record<string, unknown>)?.change_type || 'updated')),
      detail: event.detail,
      label: event.label,
      type: formatTimelineType(String(event.type)),
      createdAt: event.created_at,
      color: TIMELINE_COLOR[String(event.type)] || 'default',
      snapshotViewSummary: String((event?.meta as Record<string, unknown>)?.view_context_summary || ''),
      snapshotViewFocus: String((event?.meta as Record<string, unknown>)?.view_context_scoped_task_label || ''),
      snapshotViewNote: String((event?.meta as Record<string, unknown>)?.view_context_note || ''),
    },
  }));
}

// ---------------------------------------------------------------------------
// buildBoardReorderItems
// ---------------------------------------------------------------------------

export function buildBoardReorderItems(
  tasks: WorkbenchTask[],
  previousTasks: WorkbenchTask[] = [],
  refreshLookup: Record<string, RefreshSignal> = {},
) {
  const previousById = Object.fromEntries((previousTasks || []).map((task) => [task.id, task]));

  return MAIN_STATUSES.flatMap((status) =>
    (tasks || [])
      .filter((task) => task.status === status)
      .sort(sortByBoardOrder)
      .map((task, index) => {
        const previousTask = previousById[task.id] || null;
        const changed = !previousTask
          || previousTask.status !== status
          || Number(previousTask.board_order || 0) !== index;
        const refreshSignal = refreshLookup[task.id] || null;
        const priorityMeta = changed ? buildRefreshPriorityMeta(refreshSignal) : null;
        const refreshPriorityEvent = changed
          ? buildRefreshPriorityEventPayload(refreshSignal, priorityMeta)
          : null;
        return {
          task_id: task.id,
          status,
          board_order: index,
          ...(refreshPriorityEvent ? { refresh_priority_event: refreshPriorityEvent } : {}),
        };
      }),
  );
}
