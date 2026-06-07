// ---------------------------------------------------------------------------
// researchTaskSignals — ported from frontend/src/utils/researchTaskSignals/*.js
// Only the functions used by taskIntelligenceViewModels (via dashboardDataHelpers).
// Sub-module files are inlined here to avoid a deep nested util tree.
// ---------------------------------------------------------------------------

// ============ taskExtractors ============

type TaskLike = Record<string, unknown>;
type Payload = Record<string, unknown>;

export const extractTaskPayload = (task: TaskLike = {}): Payload =>
  (task?.snapshot as Payload)?.payload as Payload ??
  ((task?.snapshot_history as Array<Record<string, unknown>>)?.[0]?.payload as Payload) ??
  {};

export const extractTaskResearchInput = (task: TaskLike = {}): Payload =>
  (extractTaskPayload(task)?.research_input as Payload) ?? {};

export const extractTaskTemplateMeta = (task: TaskLike = {}): Payload =>
  (extractTaskPayload(task)?.template_meta as Payload) ?? {};

export const extractLinkedPricingTask = (
  task: TaskLike = {},
  researchTasks: TaskLike[] = [],
): TaskLike | null => {
  const payload = extractTaskPayload(task);
  const sourceTaskId = String(
    (payload?.source_task_id as string) ??
      ((payload?.trade_thesis as Payload)?.source_task_id as string) ??
      ((task?.context as Payload)?.pricing_task_id as string) ??
      ((task?.context as Payload)?.source_task_id as string) ??
      ''
  ).trim();
  const symbol = String(
    task?.symbol ??
      payload?.symbol ??
      (payload?.trade_thesis as Payload)?.symbol ??
      ''
  )
    .trim()
    .toUpperCase();

  return (
    researchTasks.find((item) => {
      if (item?.type !== 'pricing' || item?.status === 'archived') return false;
      if (sourceTaskId && item?.id === sourceTaskId) return true;
      return String(item?.symbol ?? '').trim().toUpperCase() === symbol;
    }) ?? null
  );
};

// ============ snapshotShifts ============

const FACTOR_LABELS_SHIFT: Record<string, string> = {
  bureaucratic_friction: '官僚摩擦',
  tech_dilution: '技术稀释',
  baseload_mismatch: '基荷错配',
  rate_curve_pressure: '利率曲线压力',
  credit_spread_stress: '信用利差压力',
  fx_mismatch: '汇率错配',
};

const formatFactorNameShift = (name = ''): string =>
  FACTOR_LABELS_SHIFT[name] ?? String(name).replace(/_/g, ' ');

const getSnapshotSelectionQualityLabel = (snapshot: Record<string, unknown> = {}): string => {
  const payload = (snapshot?.payload as Record<string, unknown>) ?? {};
  const label =
    ((payload?.allocation_overlay as Record<string, unknown>)?.selection_quality as Record<string, unknown>)?.label as string ??
    ((payload?.template_meta as Record<string, unknown>)?.selection_quality as Record<string, unknown>)?.label as string ??
    '';
  if (label) return label;
  return String(snapshot?.headline ?? '').includes('复核型结果') ? 'review_result' : 'original';
};

export interface ReviewContextShift {
  changed: boolean;
  enteredReview: boolean;
  exitedReview: boolean;
  savedLabel: string;
  currentLabel: string;
  lead: string;
  actionHint: string;
  transition: string;
}

export const summarizeReviewContextShift = (task: TaskLike = {}): ReviewContextShift => {
  const history = (task?.snapshot_history as Array<Record<string, unknown>>) ?? [];
  if (history.length < 2) {
    return { changed: false, enteredReview: false, exitedReview: false, savedLabel: '', currentLabel: '', lead: '', actionHint: '', transition: '' };
  }
  const currentLabel = getSnapshotSelectionQualityLabel(history[0]);
  const savedLabel = getSnapshotSelectionQualityLabel(history[1]);
  const currentIsReview = currentLabel !== 'original';
  const savedIsReview = savedLabel !== 'original';
  const changed = currentIsReview !== savedIsReview || currentLabel !== savedLabel;
  const enteredReview = !savedIsReview && currentIsReview;
  const exitedReview = savedIsReview && !currentIsReview;

  let lead = '';
  let actionHint = '';
  let transition = '';
  if (enteredReview) {
    lead = '最近两版已从普通结果切到复核型结果';
    actionHint = '建议按复核型结果重看当前判断，而不是继续沿用普通结果理解。';
    transition = 'enter_review';
  } else if (exitedReview) {
    lead = '最近两版已从复核型结果回到普通结果';
    actionHint = '建议确认当前主题是否已可恢复普通结果理解，不必继续沿用复核语境。';
    transition = 'exit_review';
  } else if (changed && currentIsReview) {
    lead = `最近两版复核强度已从 ${savedLabel} 切到 ${currentLabel}`;
    actionHint = '建议按新的复核强度重新理解这条任务，不要直接沿用上一版复核结论。';
    transition = 'review_strength_changed';
  } else if (changed) {
    lead = `最近两版结果语境已从 ${savedLabel} 切到 ${currentLabel}`;
    actionHint = '建议重新确认当前结果语境，避免继续沿用旧的理解方式。';
    transition = 'context_changed';
  }

  return { changed, enteredReview, exitedReview, savedLabel, currentLabel, lead, actionHint, transition };
};

export interface AltShift {
  changedCategories: Array<{
    category: string;
    previousMomentum: string;
    currentMomentum: string;
    previousDelta: number;
    currentDelta: number;
    deltaGap: number;
  }>;
  emergentCategories: Array<{ category: string; momentum: string; delta: number }>;
}

export const summarizeAltShifts = (
  altInput: Record<string, unknown> = {},
  snapshot: Record<string, unknown> = {},
): AltShift => {
  const currentSummary = (snapshot?.category_summary as Record<string, Record<string, unknown>>) ?? {};
  const savedCategories = (altInput?.top_categories as Array<Record<string, unknown>>) ?? [];

  const changedCategories = savedCategories
    .map((item) => {
      const current = currentSummary[item.category as string];
      if (!current) return null;
      const previousDelta = Number(item.delta_score ?? 0);
      const currentDelta = Number(current.delta_score ?? 0);
      const deltaGap = Number((currentDelta - previousDelta).toFixed(3));
      const previousMomentum = (item.momentum as string) || 'stable';
      const currentMomentum = (current.momentum as string) || 'stable';
      const momentumShift = previousMomentum !== currentMomentum;
      if (!momentumShift && Math.abs(deltaGap) < 0.12) return null;
      return { category: item.category as string, previousMomentum, currentMomentum, previousDelta, currentDelta, deltaGap };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => Math.abs(right.deltaGap) - Math.abs(left.deltaGap));

  const savedNames = new Set(savedCategories.map((item) => item.category as string));
  const emergentCategories = Object.entries(currentSummary)
    .filter(([category, current]) => !savedNames.has(category) && Math.abs(Number(current?.delta_score ?? 0)) >= 0.18)
    .sort((left, right) => Math.abs(Number(right[1]?.delta_score ?? 0)) - Math.abs(Number(left[1]?.delta_score ?? 0)))
    .slice(0, 2)
    .map(([category, current]) => ({
      category,
      momentum: (current?.momentum as string) || 'stable',
      delta: Number(current?.delta_score ?? 0),
    }));

  return { changedCategories, emergentCategories };
};

export interface FactorShiftItem {
  key: string;
  label: string;
  zScoreDelta: number;
  signalChanged: boolean;
}

export const summarizeFactorShifts = (
  overview: Record<string, unknown> = {},
  templateMeta: Record<string, unknown> = {},
): FactorShiftItem[] => {
  const factorDeltas = ((overview?.trend as Record<string, unknown>)?.factor_deltas as Record<string, Record<string, unknown>>) ?? {};
  const linked = new Set([
    ...((templateMeta?.dominant_drivers as Array<Record<string, unknown>>) ?? []).map((item) => item?.key as string).filter(Boolean),
    ...((templateMeta?.driver_summary as Array<Record<string, unknown>>) ?? []).map((item) => item?.key as string).filter(Boolean),
  ]);

  return Object.entries(factorDeltas)
    .filter(([key, item]) =>
      linked.has(key) || Boolean(item?.signal_changed) || Math.abs(Number(item?.z_score_delta ?? 0)) >= 0.35
    )
    .sort((left, right) => Math.abs(Number(right[1]?.z_score_delta ?? 0)) - Math.abs(Number(left[1]?.z_score_delta ?? 0)))
    .slice(0, 3)
    .map(([key, item]) => ({
      key,
      label: formatFactorNameShift(key),
      zScoreDelta: Number(item?.z_score_delta ?? 0),
      signalChanged: Boolean(item?.signal_changed),
    }));
};

// ============ macroShifts ============

export interface MacroShift {
  currentScore: number;
  savedScore: number;
  scoreGap: number;
  currentSignal: number;
  savedSignal: number;
  signalShift: boolean;
}

export const summarizeMacroShift = (macroInput: Record<string, unknown> = {}, overview: Record<string, unknown> = {}): MacroShift => {
  const currentScore = Number(overview?.macro_score ?? 0);
  const savedScore = Number(macroInput?.macro_score ?? 0);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const currentSignal = Number(overview?.macro_signal ?? 0);
  const savedSignal = Number(macroInput?.macro_signal ?? 0);
  const signalShift = currentSignal !== savedSignal;
  return { currentScore, savedScore, scoreGap, currentSignal, savedSignal, signalShift };
};

export interface ResonanceShift {
  savedLabel: string;
  currentLabel: string;
  labelChanged: boolean;
  addedFactors: string[];
  removedFactors: string[];
  currentReason: string;
}

export const summarizeResonanceShift = (
  macroInput: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
): ResonanceShift => {
  const savedResonance = (macroInput?.resonance as Record<string, unknown>) ?? {};
  const currentResonance = (overview?.resonance_summary as Record<string, unknown>) ?? {};
  const savedLabel = (savedResonance.label as string) || 'mixed';
  const currentLabel = (currentResonance.label as string) || 'mixed';
  const labelChanged = savedLabel !== currentLabel;
  const savedFactors = new Set([
    ...((savedResonance.positive_cluster as string[]) ?? []),
    ...((savedResonance.negative_cluster as string[]) ?? []),
    ...((savedResonance.weakening as string[]) ?? []),
    ...((savedResonance.precursor as string[]) ?? []),
    ...((savedResonance.reversed_factors as string[]) ?? []),
  ]);
  const currentFactors = new Set([
    ...((currentResonance.positive_cluster as string[]) ?? []),
    ...((currentResonance.negative_cluster as string[]) ?? []),
    ...((currentResonance.weakening as string[]) ?? []),
    ...((currentResonance.precursor as string[]) ?? []),
    ...((currentResonance.reversed_factors as string[]) ?? []),
  ]);
  const addedFactors = Array.from(currentFactors).filter((item) => !savedFactors.has(item));
  const removedFactors = Array.from(savedFactors).filter((item) => !currentFactors.has(item));
  return { savedLabel, currentLabel, labelChanged, addedFactors, removedFactors, currentReason: (currentResonance.reason as string) || '' };
};

export interface PolicySourceShift {
  savedLabel: string;
  currentLabel: string;
  labelChanged: boolean;
  worsening: boolean;
  improving: boolean;
  addedFragileSources: string[];
  removedFragileSources: string[];
  fullTextRatioGap: number;
  currentReason: string;
}

export const summarizePolicySourceShift = (
  macroInput: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
): PolicySourceShift => {
  const savedHealth = (macroInput?.policy_source_health as Record<string, unknown>) ?? {};
  const currentHealth =
    ((overview?.evidence_summary as Record<string, unknown>)?.policy_source_health_summary as Record<string, unknown>) ?? {};
  const severityRank: Record<string, number> = { unknown: 0, healthy: 1, watch: 2, fragile: 3 };
  const savedLabel = (savedHealth.label as string) || 'unknown';
  const currentLabel = (currentHealth.label as string) || 'unknown';
  const savedRank = severityRank[savedLabel] ?? 0;
  const currentRank = severityRank[currentLabel] ?? 0;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const labelChanged = currentLabel !== savedLabel;
  const savedFragile = new Set((savedHealth.fragile_sources as string[]) ?? []);
  const currentFragile = new Set((currentHealth.fragile_sources as string[]) ?? []);
  const addedFragileSources = Array.from(currentFragile).filter((item) => !savedFragile.has(item));
  const removedFragileSources = Array.from(savedFragile).filter((item) => !currentFragile.has(item));
  const fullTextRatioGap = Number(
    (Number(currentHealth.avg_full_text_ratio ?? 0) - Number(savedHealth.avg_full_text_ratio ?? 0)).toFixed(3)
  );
  return { savedLabel, currentLabel, labelChanged, worsening, improving, addedFragileSources, removedFragileSources, fullTextRatioGap, currentReason: (currentHealth.reason as string) || '' };
};

export interface DepartmentChaosShift {
  savedLabel: string;
  currentLabel: string;
  labelChanged: boolean;
  worsening: boolean;
  improving: boolean;
  savedScore: number;
  currentScore: number;
  scoreGap: number;
  newChaoticDepartments: string[];
  topDepartmentLabel: string;
  topDepartmentReason: string;
  currentSummary: string;
  lead: string;
  actionHint: string;
}

export const summarizeDepartmentChaosShift = (
  macroInput: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
): DepartmentChaosShift => {
  const savedChaos = (macroInput?.department_chaos as Record<string, unknown>) ?? {};
  const currentChaos = (overview?.department_chaos_summary as Record<string, unknown>) ?? {};
  const severityRank: Record<string, number> = { unknown: 0, stable: 1, watch: 2, chaotic: 3 };
  const savedLabel = (savedChaos.label as string) || 'unknown';
  const currentLabel = (currentChaos.label as string) || 'unknown';
  const savedRank = severityRank[savedLabel] ?? 0;
  const currentRank = severityRank[currentLabel] ?? 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const savedScore = Number(savedChaos.avg_chaos_score ?? 0);
  const currentScore = Number(currentChaos.avg_chaos_score ?? 0);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedDepartments = new Set(
    ((savedChaos.top_departments as Array<Record<string, unknown>>) ?? [])
      .map((item) => item?.department as string)
      .filter(Boolean)
  );
  const currentTopDepartments = (currentChaos.top_departments as Array<Record<string, unknown>>) ?? [];
  const newChaoticDepartments = currentTopDepartments
    .filter(
      (item) =>
        (item?.label === 'chaotic' || Number(item?.chaos_score ?? 0) >= 0.58) &&
        !savedDepartments.has(item?.department as string)
    )
    .map((item) => (item?.department_label as string) || (item?.department as string))
    .filter(Boolean);
  const topDepartment = currentTopDepartments[0] ?? {};

  let lead = '';
  let actionHint = '';
  if (currentLabel === 'chaotic' && savedLabel !== 'chaotic') {
    lead = '部门级政策混乱度已进入高风险区';
    actionHint = '建议优先复核当前跨市场或交易 Thesis 是否仍能承受部门级政策混乱和政策主体反复带来的传导风险。';
  } else if (worsening || scoreGap >= 0.14) {
    lead = '部门级政策混乱度较保存时明显抬升';
    actionHint = '建议重新确认政策主体反复是否已经改变宏观错价方向或组合风险边界。';
  } else if (improving || scoreGap <= -0.14) {
    lead = '部门级政策混乱度较保存时有所缓和';
    actionHint = '建议确认这是否足以降低政策错价风险，而不是暂时性话术收敛。';
  }

  return {
    savedLabel,
    currentLabel,
    labelChanged,
    worsening,
    improving,
    savedScore,
    currentScore,
    scoreGap,
    newChaoticDepartments,
    topDepartmentLabel: (topDepartment?.department_label as string) || (topDepartment?.department as string) || '',
    topDepartmentReason: (topDepartment?.reason as string) || '',
    currentSummary: (currentChaos.summary as string) || '',
    lead,
    actionHint,
  };
};

export interface InputReliabilityShift {
  savedLabel: string;
  currentLabel: string;
  labelChanged: boolean;
  worsening: boolean;
  improving: boolean;
  enteredFragile: boolean;
  recoveredFromFragile: boolean;
  recoveredRobust: boolean;
  scoreGap: number;
  currentLead: string;
  currentReason: string;
  transition: string;
  actionHint: string;
}

export const summarizeInputReliabilityShift = (
  macroInput: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
): InputReliabilityShift => {
  const savedReliability = (macroInput?.input_reliability as Record<string, unknown>) ?? {};
  const currentReliability = (overview?.input_reliability_summary as Record<string, unknown>) ?? {};
  const severityRank: Record<string, number> = { unknown: 0, robust: 1, watch: 2, fragile: 3 };
  const savedLabel = (savedReliability.label as string) || 'unknown';
  const currentLabel = (currentReliability.label as string) || 'unknown';
  const savedRank = severityRank[savedLabel] ?? 0;
  const currentRank = severityRank[currentLabel] ?? 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const scoreGap = Number(
    (Number(currentReliability.score ?? 0) - Number(savedReliability.score ?? 0)).toFixed(3)
  );
  const enteredFragile = currentLabel === 'fragile' && savedLabel !== 'fragile';
  const recoveredFromFragile = savedLabel === 'fragile' && currentLabel !== 'fragile';
  const recoveredRobust = currentLabel === 'robust' && savedLabel !== 'robust';

  let transition = '';
  let actionHint = '';
  if (enteredFragile) {
    transition = 'enter_fragile';
    actionHint = '建议先复核当前宏观输入可靠度，再决定是否继续沿用当前模板强度。';
  } else if (recoveredFromFragile) {
    transition = 'exit_fragile';
    actionHint = '建议确认当前输入是否已恢复到可支撑更正常模板强度，再决定是否解除谨慎处理。';
  } else if (recoveredRobust) {
    transition = 'recover_robust';
    actionHint = '建议确认当前宏观输入已恢复稳健，评估是否可以逐步恢复普通结果理解与模板强度。';
  } else if (worsening || (labelChanged && currentLabel === 'watch')) {
    transition = 'weakening';
    actionHint = '建议先复核当前输入质量，再决定是否继续沿用现有模板和结论。';
  } else if (improving || Math.abs(scoreGap) >= 0.12) {
    transition = 'strength_changed';
    actionHint = '建议重新确认当前输入质量变化是否已经足以改变模板强度判断。';
  }

  return {
    savedLabel,
    currentLabel,
    labelChanged,
    worsening,
    improving,
    enteredFragile,
    recoveredFromFragile,
    recoveredRobust,
    scoreGap,
    currentLead: (currentReliability.lead as string) || '',
    currentReason: (currentReliability.reason as string) || '',
    transition,
    actionHint,
  };
};

// ============ structuralDecay ============

const STRUCTURAL_DECAY_ACTION_RANK: Record<string, number> = {
  stable: 0,
  watch: 1,
  structural_avoid: 2,
  structural_short: 3,
};

export interface StructuralDecayShift {
  symbol: string;
  available: boolean;
  linkedPricingTaskId: string;
  savedScore: number;
  currentScore: number;
  scoreGap: number;
  savedAction: string;
  currentAction: string;
  savedLabel: string;
  currentLabel: string;
  actionWorsening: boolean;
  actionImproving: boolean;
  labelChanged: boolean;
  enteredCritical: boolean;
  savedFailure: string;
  currentFailure: string;
  failureChanged: boolean;
  currentSummary: string;
  newEvidence: string[];
  evidenceSummary: string;
  lead: string;
  actionHint: string;
}

export const summarizeStructuralDecayShift = (
  task: TaskLike = {},
  researchTasks: TaskLike[] = [],
): StructuralDecayShift => {
  const payload = extractTaskPayload(task);
  const savedDecay = (payload?.structural_decay as Record<string, unknown>) ?? {};
  const symbol = String(task?.symbol ?? payload?.symbol ?? '').trim().toUpperCase();
  const linkedPricingTask = extractLinkedPricingTask(task, researchTasks);
  const currentPayload = extractTaskPayload(linkedPricingTask ?? {});
  const currentDecay = (currentPayload?.structural_decay as Record<string, unknown>) ?? {};

  const savedScore = Number(savedDecay?.score ?? 0);
  const currentScore = Number(currentDecay?.score ?? savedScore);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedAction = (savedDecay?.action as string) || 'watch';
  const currentAction = (currentDecay?.action as string) || savedAction || 'watch';
  const savedLabel = (savedDecay?.label as string) || '-';
  const currentLabel = (currentDecay?.label as string) || savedLabel || '-';
  const savedRank = STRUCTURAL_DECAY_ACTION_RANK[savedAction] ?? 0;
  const currentRank = STRUCTURAL_DECAY_ACTION_RANK[currentAction] ?? 0;
  const actionWorsening = currentRank > savedRank;
  const actionImproving = currentRank < savedRank;
  const labelChanged = savedLabel !== currentLabel;
  const enteredCritical = currentAction === 'structural_short' && savedAction !== 'structural_short';
  const savedFailure = (savedDecay?.dominant_failure_label as string) || '';
  const currentFailure = (currentDecay?.dominant_failure_label as string) || savedFailure || '';
  const failureChanged = Boolean(savedFailure && currentFailure && savedFailure !== currentFailure);
  const currentSummary = (currentDecay?.summary as string) || '';
  const savedEvidence = new Set((savedDecay?.evidence as string[]) ?? []);
  const currentEvidence = (currentDecay?.evidence as string[]) ?? [];
  const newEvidence = currentEvidence.filter((item) => !savedEvidence.has(item));

  let lead = '';
  let actionHint = '';
  if (enteredCritical) {
    lead = `${symbol || '该标的'} 的结构性衰败判断已升级到可执行警报`;
    actionHint = '建议优先重开定价研究并确认是否需要按结构性衰败处理，而不是继续作为普通错价观察。';
  } else if (actionWorsening || scoreGap >= 0.12) {
    lead = `${symbol || '该标的'} 的结构性衰败信号较保存时继续恶化`;
    actionHint = '建议优先检查主导失效模式、人的维度和定价结论是否形成更强的负向共振。';
  } else if (actionImproving || scoreGap <= -0.12) {
    lead = `${symbol || '该标的'} 的结构性衰败信号较保存时有所缓和`;
    actionHint = '建议确认这是否属于真正修复，而不是暂时性的噪音缓和。';
  } else if (failureChanged) {
    lead = `${symbol || '该标的'} 的主导失效模式已经变化`;
    actionHint = '建议重新确认当前衰败逻辑的主导矛盾，避免继续沿用旧的失败叙事。';
  }

  return {
    symbol,
    available: Boolean(Object.keys(savedDecay).length || Object.keys(currentDecay).length),
    linkedPricingTaskId: (linkedPricingTask?.id as string) || '',
    savedScore,
    currentScore,
    scoreGap,
    savedAction,
    currentAction,
    savedLabel,
    currentLabel,
    actionWorsening,
    actionImproving,
    labelChanged,
    enteredCritical,
    savedFailure,
    currentFailure,
    failureChanged,
    currentSummary,
    newEvidence,
    evidenceSummary: newEvidence.slice(0, 3).join(' · '),
    lead,
    actionHint,
  };
};

const STRUCTURAL_RADAR_RANK: Record<string, number> = {
  stable: 0,
  decay_watch: 1,
  decay_alert: 2,
};

export interface StructuralDecayRadarShift {
  savedLabel: string;
  currentLabel: string;
  savedScore: number;
  currentScore: number;
  scoreGap: number;
  savedCriticalAxisCount: number;
  currentCriticalAxisCount: number;
  criticalAxisGap: number;
  enteredAlert: boolean;
  labelChanged: boolean;
  worsening: boolean;
  improving: boolean;
  currentSummary: string;
  topSignalLabels: string[];
  topSignalSummary: string;
  lead: string;
  actionHint: string;
}

export const summarizeStructuralDecayRadarShift = (
  macroInput: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
): StructuralDecayRadarShift => {
  const savedRadar = (macroInput?.structural_decay_radar as Record<string, unknown>) ?? {};
  const currentRadar = (overview?.structural_decay_radar as Record<string, unknown>) ?? {};
  const savedLabel = (savedRadar.label as string) || 'stable';
  const currentLabel = (currentRadar.label as string) || savedLabel || 'stable';
  const savedRank = STRUCTURAL_RADAR_RANK[savedLabel] ?? 0;
  const currentRank = STRUCTURAL_RADAR_RANK[currentLabel] ?? 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const savedScore = Number(savedRadar.score ?? 0);
  const currentScore = Number(currentRadar.score ?? savedScore);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedCriticalAxisCount = Number(savedRadar.critical_axis_count ?? 0);
  const currentCriticalAxisCount = Number(currentRadar.critical_axis_count ?? savedCriticalAxisCount);
  const criticalAxisGap = currentCriticalAxisCount - savedCriticalAxisCount;
  const enteredAlert = currentLabel === 'decay_alert' && savedLabel !== 'decay_alert';
  const topSignalLabels = ((currentRadar.top_signals as Array<Record<string, unknown>>) ?? [])
    .slice(0, 2)
    .map((item) => (item?.label as string))
    .filter(Boolean);

  let lead = '';
  let actionHint = '';
  if (enteredAlert) {
    lead = '系统级结构衰败雷达已升级到警报区';
    actionHint = '建议优先重开跨市场研究，确认组合是否需要收缩风险预算并切到更强的防御/做空约束。';
  } else if (worsening || scoreGap >= 0.12 || criticalAxisGap >= 1) {
    lead = '系统级结构衰败雷达较保存时继续升温';
    actionHint = '建议复核人的维度、治理和执行证据是否已经形成新的系统级负向共振，并下调风险预算。';
  } else if (improving || scoreGap <= -0.12) {
    lead = '系统级结构衰败雷达较保存时有所缓和';
    actionHint = '建议确认这是否足以放松防御构造，而不是暂时性的噪音回落。';
  }

  return {
    savedLabel,
    currentLabel,
    savedScore,
    currentScore,
    scoreGap,
    savedCriticalAxisCount,
    currentCriticalAxisCount,
    criticalAxisGap,
    enteredAlert,
    labelChanged,
    worsening,
    improving,
    currentSummary: (currentRadar.action_hint as string) || '',
    topSignalLabels,
    topSignalSummary: topSignalLabels.join(' · '),
    lead,
    actionHint,
  };
};

// ============ peopleLayer ============

function currentLayerHasFragileSignal(entry: Record<string, unknown> = {}): boolean {
  return entry?.risk_level === 'high' || Number(entry?.people_fragility_score ?? 0) >= 0.62;
}

const PEOPLE_RISK_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, unknown: 0 };
const PEOPLE_STANCE_RANK: Record<string, number> = { supportive: 1, neutral: 0, fragile: -1, unknown: 0 };

export interface PeopleLayerShift {
  symbol: string;
  available: boolean;
  savedRiskLevel: string;
  currentRiskLevel: string;
  savedStance: string;
  currentStance: string;
  savedFragility: number;
  currentFragility: number;
  fragilityGap: number;
  savedQuality: number;
  currentQuality: number;
  qualityGap: number;
  riskWorsening: boolean;
  riskImproving: boolean;
  stanceWorsening: boolean;
  labelChanged: boolean;
  enteredFragile: boolean;
  currentSummary: string;
  evidence: string[];
  evidenceSummary: string;
  lead: string;
  actionHint: string;
}

export const summarizePeopleLayerShift = (
  task: TaskLike = {},
  overview: Record<string, unknown> = {},
): PeopleLayerShift => {
  const payload = extractTaskPayload(task);
  const savedLayer = (payload?.people_layer as Record<string, unknown>) ?? {};
  const symbol = String(task?.symbol ?? payload?.symbol ?? '').trim().toUpperCase();
  const watchlist = ((overview?.people_layer_summary as Record<string, unknown>)?.watchlist as Array<Record<string, unknown>>) ?? [];
  const currentEntry =
    watchlist.find(
      (item) => String(item?.symbol ?? '').trim().toUpperCase() === symbol
    ) ?? null;

  const savedRiskLevel = (savedLayer?.risk_level as string) || 'unknown';
  const currentRiskLevel = (currentEntry?.risk_level as string) || savedRiskLevel || 'unknown';
  const savedStance = (savedLayer?.stance as string) || 'unknown';
  const currentStance = (currentEntry?.stance as string) || savedStance || 'unknown';
  const savedFragility = Number(savedLayer?.people_fragility_score ?? 0);
  const currentFragility = Number(currentEntry?.people_fragility_score ?? savedFragility);
  const savedQuality = Number(savedLayer?.people_quality_score ?? 0);
  const currentQuality = Number(currentEntry?.people_quality_score ?? savedQuality);
  const savedHiringSignal = (savedLayer?.hiring_signal as Record<string, unknown>) ?? {};
  const currentHiringSignal = (currentEntry?.hiring_signal as Record<string, unknown>) ?? {};
  const savedInsiderFlow = (savedLayer?.insider_flow as Record<string, unknown>) ?? {};
  const currentInsiderFlow = (currentEntry?.insider_flow as Record<string, unknown>) ?? {};
  const fragilityGap = Number((currentFragility - savedFragility).toFixed(3));
  const qualityGap = Number((currentQuality - savedQuality).toFixed(3));
  const riskWorsening = (PEOPLE_RISK_RANK[currentRiskLevel] ?? 0) > (PEOPLE_RISK_RANK[savedRiskLevel] ?? 0);
  const riskImproving = (PEOPLE_RISK_RANK[currentRiskLevel] ?? 0) < (PEOPLE_RISK_RANK[savedRiskLevel] ?? 0);
  const stanceWorsening = (PEOPLE_STANCE_RANK[currentStance] ?? 0) < (PEOPLE_STANCE_RANK[savedStance] ?? 0);
  const labelChanged = savedRiskLevel !== currentRiskLevel || savedStance !== currentStance;
  const enteredFragile = currentRiskLevel === 'high' && savedRiskLevel !== 'high';
  const currentSummary =
    (currentEntry?.summary as string) ||
    ((overview?.people_layer_summary as Record<string, unknown>)?.summary as string) ||
    '';

  let lead = '';
  let actionHint = '';
  if (enteredFragile) {
    lead = `${symbol || '该标的'} 的人的维度已进入高风险区`;
    actionHint = '建议优先重开定价研究，确认组织结构恶化是否已经改变长期判断。';
  } else if (riskWorsening || stanceWorsening) {
    lead = `${symbol || '该标的'} 的人的维度较保存时明显走弱`;
    actionHint = '建议复核管理层质量、内部人交易和技术稀释度，再决定是否保留原结论。';
  } else if (riskImproving || qualityGap >= 0.12) {
    lead = `${symbol || '该标的'} 的人的维度较保存时有所修复`;
    actionHint = '建议确认组织层修复是否足以提高结论置信度或调整行动姿态。';
  }

  const evidence: string[] = [];
  const currentDilution = Number((currentHiringSignal?.dilution_ratio as number) ?? 0);
  const savedDilution = Number((savedHiringSignal?.dilution_ratio as number) ?? 0);
  if (currentDilution > 0 && (currentDilution >= 1.5 || Math.abs(currentDilution - savedDilution) >= 0.2)) {
    evidence.push(`招聘稀释度 ${savedDilution > 0 ? `${savedDilution.toFixed(2)}→` : ''}${currentDilution.toFixed(2)}`);
  }
  const currentConviction = Number((currentInsiderFlow?.conviction_score as number) ?? 0);
  const savedConviction = Number((savedInsiderFlow?.conviction_score as number) ?? 0);
  if (currentConviction <= -0.18 || savedConviction - currentConviction >= 0.12) {
    evidence.push(`内部人信号 ${savedConviction.toFixed(2)}→${currentConviction.toFixed(2)}`);
  } else if (currentConviction >= 0.18 && currentConviction - savedConviction >= 0.12) {
    evidence.push(`内部人背书 ${savedConviction.toFixed(2)}→${currentConviction.toFixed(2)}`);
  }
  if (currentEntry && currentLayerHasFragileSignal(currentEntry)) {
    evidence.push('当前 watchlist 已把该标的列入组织脆弱观察');
  }

  return {
    symbol,
    available: Boolean(currentEntry || Object.keys(savedLayer).length),
    savedRiskLevel,
    currentRiskLevel,
    savedStance,
    currentStance,
    savedFragility,
    currentFragility,
    fragilityGap,
    savedQuality,
    currentQuality,
    qualityGap,
    riskWorsening,
    riskImproving,
    stanceWorsening,
    labelChanged,
    enteredFragile,
    currentSummary,
    evidence,
    evidenceSummary: evidence.join(' · '),
    lead,
    actionHint,
  };
};

// ============ tradeThesis ============

const extractLeadLegSymbol = (thesis: Record<string, unknown> = {}): string => {
  const normalizedTradeLegs = (thesis?.trade_legs as Array<Record<string, unknown>>) ?? [];
  const coreExpression = normalizedTradeLegs.find((leg) => leg?.role === 'core_expression' && leg?.symbol);
  if (coreExpression?.symbol) return String(coreExpression.symbol).trim().toUpperCase();
  if ((thesis?.primary_leg as Record<string, unknown>)?.symbol)
    return String((thesis.primary_leg as Record<string, unknown>).symbol).trim().toUpperCase();
  return '';
};

export interface TradeThesisShift {
  available: boolean;
  linkedPricingTaskId: string;
  savedStance: string;
  currentStance: string;
  savedHorizon: string;
  currentHorizon: string;
  savedLeadLeg: string;
  currentLeadLeg: string;
  stanceChanged: boolean;
  horizonChanged: boolean;
  leadLegChanged: boolean;
  summaryChanged: boolean;
  currentSummary: string;
  evidence: string[];
  evidenceSummary: string;
  lead: string;
  actionHint: string;
}

export const summarizeTradeThesisShift = (
  task: TaskLike = {},
  researchTasks: TaskLike[] = [],
): TradeThesisShift => {
  const payload = extractTaskPayload(task);
  const savedTradeThesis = (payload?.trade_thesis as Record<string, unknown>) ?? {};
  const savedThesis = (savedTradeThesis?.thesis as Record<string, unknown>) ?? {};
  const linkedPricingTask = extractLinkedPricingTask(task, researchTasks);
  const currentPayload = extractTaskPayload(linkedPricingTask ?? {});
  const currentThesis = (currentPayload?.macro_mispricing_thesis as Record<string, unknown>) ?? {};

  const savedStance = (savedThesis?.stance as string) || '';
  const currentStance = (currentThesis?.stance as string) || savedStance || '';
  const savedHorizon = (savedThesis?.horizon as string) || '';
  const currentHorizon = (currentThesis?.horizon as string) || savedHorizon || '';
  const savedLeadLeg = extractLeadLegSymbol(savedThesis);
  const currentLeadLeg = extractLeadLegSymbol(currentThesis);
  const savedSummary = (savedThesis?.summary as string) || '';
  const currentSummary = (currentThesis?.summary as string) || savedSummary || '';
  const stanceChanged = Boolean(savedStance && currentStance && savedStance !== currentStance);
  const horizonChanged = Boolean(savedHorizon && currentHorizon && savedHorizon !== currentHorizon);
  const leadLegChanged = Boolean(savedLeadLeg && currentLeadLeg && savedLeadLeg !== currentLeadLeg);
  const summaryChanged = Boolean(savedSummary && currentSummary && savedSummary !== currentSummary);
  const currentTradeLegs = (currentThesis?.trade_legs as Array<Record<string, unknown>>) ?? [];

  let lead = '';
  let actionHint = '';
  if (stanceChanged) {
    lead = `交易 Thesis 已从 ${savedStance} 切到 ${currentStance}`;
    actionHint = '建议优先重看当前交易 Thesis，确认主逻辑是否已经切换，避免继续沿用旧的交易表达。';
  } else if (leadLegChanged) {
    lead = `主表达腿已从 ${savedLeadLeg} 切到 ${currentLeadLeg}`;
    actionHint = '建议优先复核主表达腿和对冲腿是否还成立，不要继续沿用旧的组合骨架。';
  } else if (summaryChanged || horizonChanged) {
    lead = '交易 Thesis 的核心叙事发生变化';
    actionHint = '建议优先确认 thesis 的叙事、周期和执行边界是否还与当前证据一致。';
  }

  const evidence: string[] = [];
  if (currentSummary && currentSummary !== savedSummary) evidence.push(currentSummary);
  if (currentTradeLegs.length) {
    evidence.push(
      `当前组合腿 ${currentTradeLegs
        .slice(0, 3)
        .map((leg) => `${String(leg?.symbol ?? '').toUpperCase()} ${(leg?.side as string) || ''}`.trim())
        .join(' / ')}`
    );
  }

  return {
    available: Boolean(Object.keys(savedTradeThesis).length || Object.keys(currentThesis).length),
    linkedPricingTaskId: (linkedPricingTask?.id as string) || '',
    savedStance,
    currentStance,
    savedHorizon,
    currentHorizon,
    savedLeadLeg,
    currentLeadLeg,
    stanceChanged,
    horizonChanged,
    leadLegChanged,
    summaryChanged,
    currentSummary,
    evidence,
    evidenceSummary: evidence.slice(0, 2).join(' · '),
    lead,
    actionHint,
  };
};

// ============ biasQuality ============

const BIAS_QUALITY_MAP: Record<string, { label: string; scale: number }> = {
  fragile: { label: 'compressed', scale: 0.55 },
  watch: { label: 'cautious', scale: 0.78 },
  healthy: { label: 'full', scale: 1 },
  unknown: { label: 'full', scale: 1 },
};

const extractCompressedLeader = (allocationOverlay: Record<string, unknown> = {}): Record<string, unknown> | null =>
  ((allocationOverlay.rows as Array<Record<string, unknown>>) ?? [])
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Number(right?.compression_delta ?? 0)) - Math.abs(Number(left?.compression_delta ?? 0))
    )
    .find((item) => Math.abs(Number(item?.compression_delta ?? 0)) >= 0.005) ?? null;

export interface BiasCompressionShift {
  savedLabel: string;
  currentLabel: string;
  savedScale: number;
  currentScale: number;
  scaleGap: number;
  labelChanged: boolean;
  compressed: boolean;
  expanded: boolean;
  topCompressedAsset: string;
  topCompressedSymbol: string;
  coreLegAffected: boolean;
  currentReason: string;
}

export const summarizeBiasCompressionShift = (
  templateMeta: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
  allocationOverlay: Record<string, unknown> = {},
): BiasCompressionShift => {
  const currentHealth =
    ((overview?.evidence_summary as Record<string, unknown>)?.policy_source_health_summary as Record<string, unknown>) ?? {};
  const currentHealthLabel = (currentHealth.label as string) || 'unknown';
  const currentBiasMeta = BIAS_QUALITY_MAP[currentHealthLabel] ?? BIAS_QUALITY_MAP.unknown;
  const savedLabel = (templateMeta?.bias_quality_label as string) || 'full';
  const savedScale = Number(templateMeta?.bias_scale ?? 1);
  const currentLabel = currentBiasMeta.label || 'full';
  const currentScale = Number(currentBiasMeta.scale ?? 1);
  const scaleGap = Number((currentScale - savedScale).toFixed(3));
  const labelChanged = savedLabel !== currentLabel;
  const compressed = currentScale < savedScale - 0.05;
  const expanded = currentScale > savedScale + 0.05;
  const compressedLeader = extractCompressedLeader(allocationOverlay);
  const coreLegSymbols = new Set(
    ((templateMeta?.core_legs as Array<Record<string, unknown>>) ?? [])
      .map((item) => String(item?.symbol ?? '').toUpperCase())
      .filter(Boolean)
  );
  const themeCoreText = String(templateMeta?.theme_core ?? '').toUpperCase();
  const topCompressedSymbol = String(compressedLeader?.symbol ?? '').toUpperCase();
  const coreLegAffected = Boolean(
    topCompressedSymbol &&
      (coreLegSymbols.has(topCompressedSymbol) || themeCoreText.includes(topCompressedSymbol))
  );

  return {
    savedLabel,
    currentLabel,
    savedScale,
    currentScale,
    scaleGap,
    labelChanged,
    compressed,
    expanded,
    topCompressedAsset: compressedLeader
      ? `${compressedLeader.symbol} ${(Math.abs(Number(compressedLeader.compression_delta ?? 0)) * 100).toFixed(2)}pp`
      : '',
    topCompressedSymbol,
    coreLegAffected,
    currentReason: (currentHealth.reason as string) || (templateMeta?.bias_quality_reason as string) || '',
  };
};

export interface SelectionQualityShift {
  savedLabel: string;
  currentLabel: string;
  savedPenalty: number;
  currentPenalty: number;
  penaltyGap: number;
  labelChanged: boolean;
  worsening: boolean;
  improving: boolean;
  currentReason: string;
}

export const summarizeSelectionQualityShift = (
  templateMeta: Record<string, unknown> = {},
  biasCompressionShift: BiasCompressionShift = {} as BiasCompressionShift,
): SelectionQualityShift => {
  const severityRank: Record<string, number> = { original: 0, softened: 1, auto_downgraded: 2 };
  const savedSelectionQuality = (templateMeta?.selection_quality as Record<string, unknown>) ?? {};
  const savedLabel =
    (savedSelectionQuality.label as string) ||
    ((templateMeta?.ranking_penalty as number) > 0 ? 'softened' : 'original');
  const currentLabel = biasCompressionShift?.coreLegAffected
    ? 'auto_downgraded'
    : biasCompressionShift?.compressed || biasCompressionShift?.labelChanged
      ? 'softened'
      : 'original';
  const savedPenalty = Number(templateMeta?.ranking_penalty ?? 0);
  const currentPenalty = currentLabel === 'auto_downgraded' ? 0.45 : currentLabel === 'softened' ? 0.2 : 0;
  const labelChanged = savedLabel !== currentLabel;
  const penaltyGap = Number((currentPenalty - savedPenalty).toFixed(3));
  const worsening = (severityRank[currentLabel] ?? 0) > (severityRank[savedLabel] ?? 0);
  const improving = (severityRank[currentLabel] ?? 0) < (severityRank[savedLabel] ?? 0);

  return {
    savedLabel,
    currentLabel,
    savedPenalty,
    currentPenalty,
    penaltyGap,
    labelChanged,
    worsening,
    improving,
    currentReason: biasCompressionShift?.currentReason || (savedSelectionQuality.reason as string) || '',
  };
};

export interface SelectionQualityRunState {
  label: string;
  active: boolean;
  baseScore: number;
  effectiveScore: number;
  baseTier: string;
  effectiveTier: string;
  rankingPenalty: number;
  reason: string;
}

export const summarizeSelectionQualityRunState = (
  templateMeta: Record<string, unknown> = {},
  allocationOverlay: Record<string, unknown> = {},
): SelectionQualityRunState => {
  const selectionQuality =
    (allocationOverlay?.selection_quality as Record<string, unknown>) ??
    (templateMeta?.selection_quality as Record<string, unknown>) ??
    {};
  const label = (selectionQuality.label as string) || 'original';
  const baseScore = Number(
    (selectionQuality.base_recommendation_score as number) ??
      (templateMeta?.base_recommendation_score as number) ??
      0
  );
  const effectiveScore = Number(
    (selectionQuality.effective_recommendation_score as number) ??
      (templateMeta?.recommendation_score as number) ??
      (templateMeta?.base_recommendation_score as number) ??
      0
  );
  const baseTier =
    (selectionQuality.base_recommendation_tier as string) ||
    (templateMeta?.base_recommendation_tier as string) ||
    '';
  const effectiveTier =
    (selectionQuality.effective_recommendation_tier as string) ||
    (templateMeta?.recommendation_tier as string) ||
    baseTier;
  const rankingPenalty = Number(
    (selectionQuality.ranking_penalty as number) ?? (templateMeta?.ranking_penalty as number) ?? 0
  );

  return {
    label,
    active: label !== 'original' || rankingPenalty > 0.01,
    baseScore,
    effectiveScore,
    baseTier,
    effectiveTier,
    rankingPenalty,
    reason:
      (selectionQuality.reason as string) ||
      ((templateMeta?.selection_quality as Record<string, unknown>)?.reason as string) ||
      (templateMeta?.ranking_penalty_reason as string) ||
      '',
  };
};

// ============ priorityReasoning ============

export interface BuildSummaryLinesParams {
  macroShift: MacroShift | null;
  resonanceShift: ResonanceShift | null;
  policySourceShift: PolicySourceShift | null;
  departmentChaosShift: DepartmentChaosShift | null;
  inputReliabilityShift: InputReliabilityShift | null;
  peopleLayerShift: PeopleLayerShift | null;
  structuralDecayShift: StructuralDecayShift | null;
  structuralDecayRadarShift: StructuralDecayRadarShift | null;
  tradeThesisShift: TradeThesisShift | null;
  biasCompressionShift: BiasCompressionShift | null;
  selectionQualityShift: SelectionQualityShift | null;
  selectionQualityRunState: SelectionQualityRunState | null;
  reviewContextShift: ReviewContextShift | null;
  altShift: AltShift;
  factorShift: FactorShiftItem[];
}

export const buildSummaryLines = ({
  macroShift,
  resonanceShift,
  policySourceShift,
  departmentChaosShift,
  inputReliabilityShift,
  peopleLayerShift,
  structuralDecayShift,
  structuralDecayRadarShift,
  tradeThesisShift,
  biasCompressionShift,
  selectionQualityShift,
  selectionQualityRunState,
  reviewContextShift,
  altShift,
  factorShift,
}: BuildSummaryLinesParams): string[] => {
  const lines: string[] = [];

  if (macroShift?.signalShift) {
    lines.push(`宏观信号从 ${macroShift.savedSignal} 切到 ${macroShift.currentSignal}`);
  } else if (Math.abs(Number(macroShift?.scoreGap ?? 0)) >= 0.1) {
    lines.push(`宏观分数相对保存时 ${(macroShift?.scoreGap ?? 0) >= 0 ? '上行' : '下行'} ${Math.abs(macroShift?.scoreGap ?? 0).toFixed(2)}`);
  }

  if (resonanceShift?.labelChanged) {
    lines.push(`共振从 ${resonanceShift.savedLabel} 切到 ${resonanceShift.currentLabel}`);
  } else if (resonanceShift?.addedFactors?.[0]) {
    lines.push(`${formatFactorNameShift(resonanceShift.addedFactors[0])} 新进入共振簇`);
  }

  if (policySourceShift?.labelChanged) {
    lines.push(`政策源从 ${policySourceShift.savedLabel} 切到 ${policySourceShift.currentLabel}`);
  } else if (policySourceShift?.addedFragileSources?.[0]) {
    lines.push(`${policySourceShift.addedFragileSources[0]} 进入政策脆弱源`);
  }

  if (departmentChaosShift?.labelChanged) {
    lines.push(`部门混乱从 ${departmentChaosShift.savedLabel} 切到 ${departmentChaosShift.currentLabel}`);
  } else if (departmentChaosShift?.newChaoticDepartments?.[0]) {
    lines.push(`${departmentChaosShift.newChaoticDepartments[0]} 新进入高混乱区`);
  } else if (Math.abs(Number(departmentChaosShift?.scoreGap ?? 0)) >= 0.14) {
    lines.push(
      `部门混乱度 ${Number(departmentChaosShift?.scoreGap ?? 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(departmentChaosShift?.scoreGap ?? 0)).toFixed(2)}`
    );
  }

  if (inputReliabilityShift?.labelChanged) {
    lines.push(`输入可靠度从 ${inputReliabilityShift.savedLabel} 切到 ${inputReliabilityShift.currentLabel}`);
  } else if (Math.abs(Number(inputReliabilityShift?.scoreGap ?? 0)) >= 0.12) {
    lines.push(
      `输入可靠度 ${Number(inputReliabilityShift?.scoreGap ?? 0) >= 0 ? '抬升' : '走弱'} ${Math.abs(Number(inputReliabilityShift?.scoreGap ?? 0)).toFixed(2)}`
    );
  }

  if (peopleLayerShift?.enteredFragile) {
    lines.push(`人的维度从 ${peopleLayerShift.savedRiskLevel} 切到 ${peopleLayerShift.currentRiskLevel}`);
  } else if (peopleLayerShift?.labelChanged) {
    lines.push(`人的维度 ${peopleLayerShift.savedRiskLevel}/${peopleLayerShift.savedStance} 切到 ${peopleLayerShift.currentRiskLevel}/${peopleLayerShift.currentStance}`);
  } else if (Math.abs(Number(peopleLayerShift?.fragilityGap ?? 0)) >= 0.12) {
    lines.push(
      `人的脆弱度 ${Number(peopleLayerShift?.fragilityGap ?? 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(peopleLayerShift?.fragilityGap ?? 0)).toFixed(2)}`
    );
  }

  if (structuralDecayShift?.enteredCritical) {
    lines.push(`衰败判断从 ${structuralDecayShift.savedAction} 升级到 ${structuralDecayShift.currentAction}`);
  } else if (structuralDecayShift?.actionWorsening || structuralDecayShift?.labelChanged) {
    lines.push(`衰败信号 ${structuralDecayShift?.savedLabel} → ${structuralDecayShift?.currentLabel}`);
  } else if (Math.abs(Number(structuralDecayShift?.scoreGap ?? 0)) >= 0.12) {
    lines.push(
      `衰败评分 ${Number(structuralDecayShift?.scoreGap ?? 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(structuralDecayShift?.scoreGap ?? 0)).toFixed(2)}`
    );
  }
  if (structuralDecayShift?.failureChanged && structuralDecayShift?.currentFailure) {
    lines.push(`主导失效模式切到 ${structuralDecayShift.currentFailure}`);
  }
  if (structuralDecayRadarShift?.enteredAlert) {
    lines.push(`系统级衰败雷达从 ${structuralDecayRadarShift.savedLabel} 升级到 ${structuralDecayRadarShift.currentLabel}`);
  } else if (structuralDecayRadarShift?.worsening || structuralDecayRadarShift?.labelChanged) {
    lines.push(`系统级衰败雷达 ${structuralDecayRadarShift?.savedLabel} → ${structuralDecayRadarShift?.currentLabel}`);
  } else if (Math.abs(Number(structuralDecayRadarShift?.scoreGap ?? 0)) >= 0.12) {
    lines.push(
      `系统级衰败雷达 ${Number(structuralDecayRadarShift?.scoreGap ?? 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(structuralDecayRadarShift?.scoreGap ?? 0)).toFixed(2)}`
    );
  }
  if ((structuralDecayRadarShift?.criticalAxisGap ?? 0) >= 1) {
    lines.push(`系统级衰败关键轴增加 ${structuralDecayRadarShift?.criticalAxisGap}`);
  }
  if (tradeThesisShift?.stanceChanged) {
    lines.push(`交易 Thesis 从 ${tradeThesisShift.savedStance} 切到 ${tradeThesisShift.currentStance}`);
  } else if (tradeThesisShift?.leadLegChanged) {
    lines.push(`主表达腿从 ${tradeThesisShift.savedLeadLeg} 切到 ${tradeThesisShift.currentLeadLeg}`);
  } else if (tradeThesisShift?.summaryChanged || tradeThesisShift?.horizonChanged) {
    lines.push('交易 Thesis 的核心叙事已变化');
  }

  if (biasCompressionShift?.labelChanged) {
    lines.push(`偏置收缩从 ${biasCompressionShift.savedLabel} 切到 ${biasCompressionShift.currentLabel}`);
  } else if (biasCompressionShift?.compressed) {
    lines.push(`偏置 scale ${biasCompressionShift.savedScale.toFixed(2)}x 下调到 ${biasCompressionShift.currentScale.toFixed(2)}x`);
  }
  if (biasCompressionShift?.coreLegAffected && biasCompressionShift?.topCompressedAsset) {
    lines.push(`核心腿受压 ${biasCompressionShift.topCompressedAsset}`);
  }
  if (selectionQualityShift?.labelChanged) {
    lines.push(`自动降级从 ${selectionQualityShift.savedLabel} 切到 ${selectionQualityShift.currentLabel}`);
  } else if ((selectionQualityShift?.penaltyGap ?? 0) >= 0.1) {
    lines.push(`排序惩罚 ${selectionQualityShift?.savedPenalty.toFixed(2)} 提升到 ${selectionQualityShift?.currentPenalty.toFixed(2)}`);
  }
  if (selectionQualityRunState?.active) {
    lines.push(
      `当前结果已按 ${selectionQualityRunState.label} 强度运行` +
        (selectionQualityRunState.baseScore || selectionQualityRunState.effectiveScore
          ? ` (${selectionQualityRunState.baseScore.toFixed(2)}→${selectionQualityRunState.effectiveScore.toFixed(2)})`
          : '')
    );
  }
  if (reviewContextShift?.lead) {
    lines.push(reviewContextShift.lead);
  }

  if (altShift?.changedCategories?.[0]) {
    const item = altShift.changedCategories[0];
    lines.push(
      `${item.category} 从 ${item.previousMomentum === 'strengthening' ? '增强' : item.previousMomentum === 'weakening' ? '走弱' : '稳定'} 变为 ${item.currentMomentum === 'strengthening' ? '增强' : item.currentMomentum === 'weakening' ? '走弱' : '稳定'}`
    );
  } else if (altShift?.emergentCategories?.[0]) {
    const item = altShift.emergentCategories[0];
    lines.push(`${item.category} 新进入高变化区`);
  }

  if (factorShift?.[0]) {
    const item = factorShift[0];
    lines.push(`${item.label} ΔZ ${item.zScoreDelta >= 0 ? '+' : ''}${item.zScoreDelta.toFixed(2)}`);
  }

  return lines;
};

export interface DeterminePriorityReasonParams {
  resonanceDriven: boolean;
  structuralDecayDriven: boolean;
  structuralDecayRadarDriven: boolean;
  tradeThesisDriven: boolean;
  selectionQualityDriven: boolean;
  selectionQualityRunState: SelectionQualityRunState | null;
  reviewContextDriven: boolean;
  peopleLayerDriven: boolean;
  biasCompressionDriven: boolean;
  biasCompressionShift: BiasCompressionShift | null;
  policySourceDriven: boolean;
  departmentChaosDriven: boolean;
  inputReliabilityDriven: boolean;
  macroShift: MacroShift | null;
  altShift: AltShift;
  factorShift: FactorShiftItem[];
}

export const determinePriorityReason = ({
  resonanceDriven,
  structuralDecayDriven,
  structuralDecayRadarDriven,
  tradeThesisDriven,
  selectionQualityDriven,
  selectionQualityRunState,
  reviewContextDriven,
  peopleLayerDriven,
  biasCompressionDriven,
  biasCompressionShift,
  policySourceDriven,
  departmentChaosDriven,
  inputReliabilityDriven,
  macroShift,
  altShift,
  factorShift,
}: DeterminePriorityReasonParams): string => {
  if (resonanceDriven) return 'resonance';
  if (biasCompressionShift?.coreLegAffected) return 'bias_quality_core';
  if (selectionQualityRunState?.active) return 'selection_quality_active';
  if (reviewContextDriven) return 'review_context';
  if (structuralDecayRadarDriven) return 'structural_decay';
  if (structuralDecayDriven) return 'structural_decay';
  if (tradeThesisDriven) return 'trade_thesis';
  if (peopleLayerDriven) return 'people_fragility';
  if (selectionQualityDriven) return 'selection_quality';
  if (biasCompressionDriven) return 'bias_quality';
  if (departmentChaosDriven) return 'policy_execution';
  if (policySourceDriven || inputReliabilityDriven) return 'source_health_degradation';
  if (macroShift?.signalShift || Math.abs(Number(macroShift?.scoreGap ?? 0)) >= 0.18) return 'macro';
  if ((altShift?.changedCategories ?? []).length || (altShift?.emergentCategories ?? []).length) return 'alt_data';
  if ((factorShift ?? []).length) return 'factor_shift';
  return 'observe';
};

export const getPriorityWeight = (reason = ''): number => {
  switch (reason) {
    case 'resonance': return 5;
    case 'bias_quality_core': return 4;
    case 'selection_quality_active': return 3.75;
    case 'review_context': return 3.6;
    case 'structural_decay': return 3.4;
    case 'trade_thesis': return 3.3;
    case 'people_fragility':
    case 'people_layer': return 3.2;
    case 'selection_quality': return 3.5;
    case 'bias_quality': return 3;
    case 'policy_execution': return 2.4;
    case 'source_health_degradation': return 2.1;
    case 'policy_source': return 2;
    case 'department_chaos': return 2.4;
    case 'input_reliability': return 1.8;
    case 'macro': return 1;
    case 'alt_data': return 1;
    case 'factor_shift': return 1;
    default: return 0;
  }
};

// ============ buildResearchTaskRefreshSignals (main export) ============

export interface RefreshSignalItem {
  taskId: string;
  taskType: string;
  templateId: string;
  title: string;
  refreshLabel: string;
  refreshTone: string;
  severity: 'high' | 'medium' | 'low';
  urgencyScore: number;
  summary: string;
  macroShift: MacroShift | null;
  resonanceShift: ResonanceShift | null;
  policySourceShift: PolicySourceShift | null;
  departmentChaosShift: DepartmentChaosShift | null;
  inputReliabilityShift: InputReliabilityShift | null;
  peopleLayerShift: PeopleLayerShift | null;
  structuralDecayShift: StructuralDecayShift | null;
  structuralDecayRadarShift: StructuralDecayRadarShift | null;
  tradeThesisShift: TradeThesisShift | null;
  biasCompressionShift: BiasCompressionShift | null;
  selectionQualityShift: SelectionQualityShift | null;
  selectionQualityRunState: SelectionQualityRunState | null;
  reviewContextShift: ReviewContextShift | null;
  resonanceDriven: boolean;
  policySourceDriven: boolean;
  departmentChaosDriven: boolean;
  inputReliabilityDriven: boolean;
  peopleLayerDriven: boolean;
  structuralDecayDriven: boolean;
  structuralDecayRadarDriven: boolean;
  tradeThesisDriven: boolean;
  biasCompressionDriven: boolean;
  selectionQualityDriven: boolean;
  reviewContextDriven: boolean;
  priorityReason: string;
  priorityWeight: number;
  altShift: AltShift;
  factorShift: FactorShiftItem[];
  recommendation: string;
}

export const buildResearchTaskRefreshSignals = ({
  researchTasks = [],
  overview = {},
  snapshot = {},
}: {
  researchTasks?: TaskLike[];
  overview?: Record<string, unknown>;
  snapshot?: Record<string, unknown>;
} = {}): {
  byTaskId: Record<string, RefreshSignalItem>;
  byTemplateId: Record<string, RefreshSignalItem>;
  prioritized: RefreshSignalItem[];
} => {
  const activeTasks = researchTasks.filter(
    (task) =>
      ['cross_market', 'pricing', 'macro_mispricing', 'trade_thesis'].includes(task?.type as string) &&
      task?.status !== 'archived'
  );

  const suggestions = activeTasks.map((task): RefreshSignalItem => {
    const emptyAltShift: AltShift = { changedCategories: [], emergentCategories: [] };

    if (task?.type === 'macro_mispricing') {
      const peopleLayerShift = summarizePeopleLayerShift(task, overview);
      const structuralDecayShift = summarizeStructuralDecayShift(task, researchTasks);
      const peopleLayerDriven =
        peopleLayerShift.enteredFragile ||
        peopleLayerShift.riskWorsening ||
        peopleLayerShift.stanceWorsening ||
        Math.abs(Number(peopleLayerShift.fragilityGap ?? 0)) >= 0.12;
      const structuralDecayDriven =
        structuralDecayShift.enteredCritical ||
        structuralDecayShift.actionWorsening ||
        structuralDecayShift.failureChanged ||
        Math.abs(Number(structuralDecayShift.scoreGap ?? 0)) >= 0.12;
      const urgencyScore = structuralDecayShift.enteredCritical
        ? 4.5
        : structuralDecayDriven
          ? 3
          : peopleLayerDriven
            ? 2
            : Math.abs(Number(structuralDecayShift.scoreGap ?? 0)) >= 0.08
              ? 1
              : 0;
      const severity: 'high' | 'medium' | 'low' = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high' ? '建议更新' : severity === 'medium' ? '建议复核' : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift, structuralDecayShift, structuralDecayRadarShift: null, tradeThesisShift: null,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift: null,
        inputReliabilityShift: null, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null, altShift: emptyAltShift, factorShift: [],
      });
      const summary = summaryLines.length ? summaryLines.join('；') : '结构性衰败与人的维度较保存时暂无明显变化，可继续观察。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false, structuralDecayDriven, structuralDecayRadarDriven: false, tradeThesisDriven: false,
        selectionQualityDriven: false, selectionQualityRunState: null, reviewContextDriven: false,
        peopleLayerDriven, biasCompressionDriven: false, biasCompressionShift: null,
        policySourceDriven: false, departmentChaosDriven: false, inputReliabilityDriven: false,
        macroShift: null, altShift: emptyAltShift, factorShift: [],
      });

      return {
        taskId: task.id as string, taskType: task.type as string, templateId: '',
        title: (task.title as string) || (task.symbol as string) || '',
        refreshLabel, refreshTone, severity, urgencyScore, summary,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift: null,
        inputReliabilityShift: null, peopleLayerShift, structuralDecayShift, structuralDecayRadarShift: null,
        tradeThesisShift: null, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null,
        resonanceDriven: false, policySourceDriven: false, departmentChaosDriven: false,
        inputReliabilityDriven: false, peopleLayerDriven, structuralDecayDriven, structuralDecayRadarDriven: false,
        tradeThesisDriven: false, biasCompressionDriven: false, selectionQualityDriven: false, reviewContextDriven: false,
        priorityReason, priorityWeight: getPriorityWeight(priorityReason), altShift: emptyAltShift, factorShift: [],
        recommendation:
          severity === 'high'
            ? structuralDecayShift.actionHint || '建议优先重开定价研究，确认结构性衰败判断是否已经进一步升级。'
            : severity === 'medium'
              ? structuralDecayShift.actionHint || peopleLayerShift.actionHint || '建议复核衰败逻辑与人的维度是否继续恶化。'
              : '当前可继续观察结构性衰败与人的维度的后续演化。',
      };
    }

    if (task?.type === 'trade_thesis') {
      const researchInput = extractTaskResearchInput(task);
      const peopleLayerShift = summarizePeopleLayerShift(task, overview);
      const structuralDecayShift = summarizeStructuralDecayShift(task, researchTasks);
      const tradeThesisShift = summarizeTradeThesisShift(task, researchTasks);
      const departmentChaosShift = summarizeDepartmentChaosShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
      const peopleLayerDriven =
        peopleLayerShift.enteredFragile || peopleLayerShift.riskWorsening ||
        peopleLayerShift.stanceWorsening || Math.abs(Number(peopleLayerShift.fragilityGap ?? 0)) >= 0.12;
      const structuralDecayDriven =
        structuralDecayShift.enteredCritical || structuralDecayShift.actionWorsening ||
        structuralDecayShift.failureChanged || Math.abs(Number(structuralDecayShift.scoreGap ?? 0)) >= 0.12;
      const tradeThesisDriven =
        tradeThesisShift.stanceChanged || tradeThesisShift.leadLegChanged ||
        tradeThesisShift.summaryChanged || tradeThesisShift.horizonChanged;
      const departmentChaosDriven =
        departmentChaosShift.worsening || departmentChaosShift.labelChanged ||
        departmentChaosShift.newChaoticDepartments.length > 0 ||
        Math.abs(Number(departmentChaosShift.scoreGap ?? 0)) >= 0.14;
      const urgencyScore = structuralDecayShift.enteredCritical
        ? 4.5
        : structuralDecayDriven && tradeThesisDriven ? 4
        : structuralDecayDriven ? 3
        : tradeThesisDriven ? 2.5
        : departmentChaosDriven ? 2.2
        : peopleLayerDriven ? 2
        : Math.abs(Number(structuralDecayShift.scoreGap ?? 0)) >= 0.08 ? 1 : 0;
      const severity: 'high' | 'medium' | 'low' = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high' ? '建议更新' : severity === 'medium' ? '建议复核' : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift, structuralDecayShift, structuralDecayRadarShift: null, tradeThesisShift,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift,
        inputReliabilityShift: null, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null, altShift: emptyAltShift, factorShift: [],
      });
      const summary = summaryLines.length ? summaryLines.join('；') : '交易 Thesis 相对保存时没有明显漂移，可继续观察组合执行条件。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false, structuralDecayDriven, structuralDecayRadarDriven: false, tradeThesisDriven,
        selectionQualityDriven: false, selectionQualityRunState: null, reviewContextDriven: false,
        peopleLayerDriven, biasCompressionDriven: false, biasCompressionShift: null,
        policySourceDriven: false, departmentChaosDriven, inputReliabilityDriven: false,
        macroShift: null, altShift: emptyAltShift, factorShift: [],
      });

      return {
        taskId: task.id as string, taskType: task.type as string, templateId: (task.template as string) || '',
        title: (task.title as string) || (task.symbol as string) || '',
        refreshLabel, refreshTone, severity, urgencyScore, summary,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift,
        inputReliabilityShift: null, peopleLayerShift, structuralDecayShift, structuralDecayRadarShift: null,
        tradeThesisShift, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null,
        resonanceDriven: false, policySourceDriven: false, departmentChaosDriven, inputReliabilityDriven: false,
        peopleLayerDriven, structuralDecayDriven, structuralDecayRadarDriven: false, tradeThesisDriven,
        biasCompressionDriven: false, selectionQualityDriven: false, reviewContextDriven: false,
        priorityReason, priorityWeight: getPriorityWeight(priorityReason), altShift: emptyAltShift, factorShift: [],
        recommendation:
          severity === 'high'
            ? tradeThesisShift.actionHint || structuralDecayShift.actionHint || '建议优先重看交易 Thesis，确认组合逻辑是否已经被最新证据打破。'
            : severity === 'medium'
              ? tradeThesisShift.actionHint || departmentChaosShift.actionHint || peopleLayerShift.actionHint || '建议复核交易 Thesis 的主腿、叙事和人的维度是否仍然成立。'
              : '当前可继续观察交易 Thesis 与定价证据是否保持一致。',
      };
    }

    if (task?.type === 'pricing') {
      const peopleLayerShift = summarizePeopleLayerShift(task, overview);
      const peopleLayerDriven =
        peopleLayerShift.enteredFragile || peopleLayerShift.riskWorsening ||
        peopleLayerShift.stanceWorsening || Math.abs(Number(peopleLayerShift.fragilityGap ?? 0)) >= 0.12;
      const urgencyScore = peopleLayerShift.enteredFragile ? 4
        : peopleLayerDriven ? 2.5
        : Math.abs(Number(peopleLayerShift.fragilityGap ?? 0)) >= 0.08 ? 1 : 0;
      const severity: 'high' | 'medium' | 'low' = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high' ? '建议更新' : severity === 'medium' ? '建议复核' : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift, structuralDecayShift: null, structuralDecayRadarShift: null, tradeThesisShift: null,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift: null,
        inputReliabilityShift: null, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null, altShift: emptyAltShift, factorShift: [],
      });
      const summary = summaryLines.length ? summaryLines.join('；') : '人的维度较保存时没有明显变化，当前可继续观察。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false, structuralDecayDriven: false, structuralDecayRadarDriven: false,
        tradeThesisDriven: false, selectionQualityDriven: false, selectionQualityRunState: null,
        reviewContextDriven: false, peopleLayerDriven, biasCompressionDriven: false, biasCompressionShift: null,
        policySourceDriven: false, departmentChaosDriven: false, inputReliabilityDriven: false,
        macroShift: null, altShift: emptyAltShift, factorShift: [],
      });

      return {
        taskId: task.id as string, taskType: task.type as string, templateId: '',
        title: (task.title as string) || (task.symbol as string) || '',
        refreshLabel, refreshTone, severity, urgencyScore, summary,
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift: null,
        inputReliabilityShift: null, peopleLayerShift, structuralDecayShift: null, structuralDecayRadarShift: null,
        tradeThesisShift: null, biasCompressionShift: null, selectionQualityShift: null,
        selectionQualityRunState: null, reviewContextShift: null,
        resonanceDriven: false, policySourceDriven: false, departmentChaosDriven: false,
        inputReliabilityDriven: false, peopleLayerDriven, structuralDecayDriven: false,
        structuralDecayRadarDriven: false, tradeThesisDriven: false,
        biasCompressionDriven: false, selectionQualityDriven: false, reviewContextDriven: false,
        priorityReason, priorityWeight: getPriorityWeight(priorityReason), altShift: emptyAltShift, factorShift: [],
        recommendation:
          severity === 'high'
            ? peopleLayerShift.actionHint || '建议优先重开定价研究，确认人的维度恶化是否已经改变长期判断。'
            : severity === 'medium'
              ? peopleLayerShift.actionHint || '建议复核组织结构与内部人信号，再决定是否沿用当前定价结论。'
              : '当前人的维度变化有限，可继续观察并等待更多证据。',
      };
    }

    // cross_market task
    const researchInput = extractTaskResearchInput(task);
    const templateMeta = extractTaskTemplateMeta(task);
    const hasSavedInput =
      Object.keys((researchInput?.macro as Record<string, unknown>) ?? {}).length > 0 ||
      ((researchInput?.alt_data as Record<string, unknown>)?.top_categories as unknown[])?.length > 0;

    if (!hasSavedInput) {
      return {
        taskId: task.id as string, taskType: task.type as string,
        templateId: (task.template as string) || (templateMeta.template_id as string) || '',
        title: (task.title as string) || (templateMeta.template_name as string) || '',
        refreshLabel: '继续观察', refreshTone: 'blue', severity: 'low', urgencyScore: 0,
        summary: '当前任务还没有保存足够的输入快照，建议先运行一次研究并记录结果。',
        macroShift: null, resonanceShift: null, policySourceShift: null, departmentChaosShift: null,
        inputReliabilityShift: null, peopleLayerShift: null, structuralDecayShift: null,
        structuralDecayRadarShift: null, tradeThesisShift: null, biasCompressionShift: null,
        selectionQualityShift: null, selectionQualityRunState: null, reviewContextShift: null,
        resonanceDriven: false, policySourceDriven: false, departmentChaosDriven: false,
        inputReliabilityDriven: false, peopleLayerDriven: false, structuralDecayDriven: false,
        structuralDecayRadarDriven: false, tradeThesisDriven: false,
        biasCompressionDriven: false, selectionQualityDriven: false, reviewContextDriven: false,
        priorityReason: 'observe', priorityWeight: 0, altShift: emptyAltShift, factorShift: [],
        recommendation: '先生成首个研究快照，再判断是否需要更新任务',
      };
    }

    const macroShift = summarizeMacroShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const resonanceShift = summarizeResonanceShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const policySourceShift = summarizePolicySourceShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const departmentChaosShift = summarizeDepartmentChaosShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const inputReliabilityShift = summarizeInputReliabilityShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const structuralDecayRadarShift = summarizeStructuralDecayRadarShift((researchInput?.macro as Record<string, unknown>) ?? {}, overview);
    const allocationOverlay = (extractTaskPayload(task)?.allocation_overlay as Record<string, unknown>) ?? {};
    const biasCompressionShift = summarizeBiasCompressionShift(templateMeta, overview, allocationOverlay);
    const selectionQualityShift = summarizeSelectionQualityShift(templateMeta, biasCompressionShift);
    const selectionQualityRunState = summarizeSelectionQualityRunState(templateMeta, allocationOverlay);
    const reviewContextShift = summarizeReviewContextShift(task);
    const altShift = summarizeAltShifts((researchInput?.alt_data as Record<string, unknown>) ?? {}, snapshot);
    const factorShift = summarizeFactorShifts(overview, templateMeta);

    let urgencyScore = 0;
    if (macroShift.signalShift) urgencyScore += 2;
    if (Math.abs(macroShift.scoreGap) >= 0.18) urgencyScore += 2;
    else if (Math.abs(macroShift.scoreGap) >= 0.1) urgencyScore += 1;
    if (resonanceShift.labelChanged) urgencyScore += 2;
    else if (resonanceShift.addedFactors.length || resonanceShift.removedFactors.length) urgencyScore += 1;
    if (policySourceShift.worsening) urgencyScore += 2;
    else if (policySourceShift.labelChanged || policySourceShift.addedFragileSources.length) urgencyScore += 1;
    if (departmentChaosShift.currentLabel === 'chaotic' || departmentChaosShift.newChaoticDepartments.length) urgencyScore += 4;
    else if (departmentChaosShift.worsening) urgencyScore += 2;
    else if (departmentChaosShift.labelChanged || Math.abs(departmentChaosShift.scoreGap) >= 0.14) urgencyScore += 1;
    if (inputReliabilityShift.worsening) urgencyScore += 2;
    else if (inputReliabilityShift.labelChanged || Math.abs(inputReliabilityShift.scoreGap) >= 0.12) urgencyScore += 1;
    if (structuralDecayRadarShift.enteredAlert) urgencyScore += 3;
    else if (structuralDecayRadarShift.worsening) urgencyScore += 2;
    else if (structuralDecayRadarShift.labelChanged || Math.abs(Number(structuralDecayRadarShift.scoreGap ?? 0)) >= 0.12 || structuralDecayRadarShift.criticalAxisGap >= 1) urgencyScore += 1;
    if (biasCompressionShift.compressed) urgencyScore += biasCompressionShift.scaleGap <= -0.2 ? 2 : 1;
    else if (biasCompressionShift.labelChanged) urgencyScore += 1;
    if (biasCompressionShift.coreLegAffected) urgencyScore += 1;
    if (selectionQualityShift.worsening) urgencyScore += 1;
    else if (selectionQualityShift.labelChanged || selectionQualityShift.penaltyGap >= 0.1) urgencyScore += 1;
    if (selectionQualityRunState.active) urgencyScore += selectionQualityRunState.label === 'auto_downgraded' ? 2 : 1;
    if (reviewContextShift.enteredReview) urgencyScore += 1;
    else if (reviewContextShift.exitedReview) urgencyScore += 0.5;
    urgencyScore += Math.min(2, altShift.changedCategories.length);
    if (altShift.emergentCategories.length) urgencyScore += 1;
    if (factorShift.some((item) => item.signalChanged)) urgencyScore += 1;

    let refreshLabel = '继续观察';
    let refreshTone = 'blue';
    let severity: 'high' | 'medium' | 'low' = 'low';
    if (urgencyScore >= 4) { refreshLabel = '建议更新'; refreshTone = 'red'; severity = 'high'; }
    else if (urgencyScore >= 2) { refreshLabel = '建议复核'; refreshTone = 'orange'; severity = 'medium'; }

    const summaryLines = buildSummaryLines({
      macroShift, resonanceShift, policySourceShift, departmentChaosShift, inputReliabilityShift,
      peopleLayerShift: null, structuralDecayShift: null, structuralDecayRadarShift, tradeThesisShift: null,
      biasCompressionShift, selectionQualityShift, selectionQualityRunState, reviewContextShift,
      altShift, factorShift,
    });
    const summary = summaryLines.length ? summaryLines.join('；') : '保存时的宏观与另类数据输入仍然基本稳定，可继续沿当前研究方向推进。';

    const resonanceDriven = resonanceShift.labelChanged || resonanceShift.addedFactors.length > 0 || resonanceShift.removedFactors.length > 0;
    const policySourceDriven = policySourceShift.worsening || policySourceShift.labelChanged || policySourceShift.addedFragileSources.length > 0;
    const departmentChaosDriven = departmentChaosShift.worsening || departmentChaosShift.labelChanged || departmentChaosShift.newChaoticDepartments.length > 0 || Math.abs(Number(departmentChaosShift.scoreGap ?? 0)) >= 0.14;
    const inputReliabilityDriven = inputReliabilityShift.worsening || inputReliabilityShift.labelChanged || Math.abs(inputReliabilityShift.scoreGap) >= 0.12;
    const structuralDecayRadarDriven = structuralDecayRadarShift.enteredAlert || structuralDecayRadarShift.worsening || structuralDecayRadarShift.labelChanged || Math.abs(Number(structuralDecayRadarShift.scoreGap ?? 0)) >= 0.12 || structuralDecayRadarShift.criticalAxisGap >= 1;
    const biasCompressionDriven = biasCompressionShift.compressed || biasCompressionShift.labelChanged;
    const selectionQualityDriven = selectionQualityShift.worsening || selectionQualityShift.labelChanged || selectionQualityShift.penaltyGap >= 0.1;
    const reviewContextDriven = reviewContextShift.changed;

    const priorityReason = determinePriorityReason({
      resonanceDriven, structuralDecayDriven: false, structuralDecayRadarDriven, tradeThesisDriven: false,
      selectionQualityDriven, selectionQualityRunState, reviewContextDriven, peopleLayerDriven: false,
      biasCompressionDriven, biasCompressionShift, policySourceDriven, departmentChaosDriven,
      inputReliabilityDriven, macroShift, altShift, factorShift,
    });

    return {
      taskId: task.id as string, taskType: task.type as string,
      templateId: (task.template as string) || (templateMeta.template_id as string) || '',
      title: (task.title as string) || (templateMeta.template_name as string) || '',
      refreshLabel, refreshTone, severity, urgencyScore, summary,
      macroShift, resonanceShift, policySourceShift, departmentChaosShift, inputReliabilityShift,
      peopleLayerShift: null, structuralDecayShift: null, structuralDecayRadarShift, tradeThesisShift: null,
      biasCompressionShift, selectionQualityShift, selectionQualityRunState, reviewContextShift,
      resonanceDriven, policySourceDriven, departmentChaosDriven, inputReliabilityDriven,
      peopleLayerDriven: false, structuralDecayDriven: false, structuralDecayRadarDriven, tradeThesisDriven: false,
      biasCompressionDriven, selectionQualityDriven, reviewContextDriven,
      priorityReason, priorityWeight: getPriorityWeight(priorityReason), altShift, factorShift,
      recommendation:
        severity === 'high'
          ? selectionQualityRunState.active
            ? '建议优先重开研究页并更新快照，当前结果已处于降级运行状态'
            : reviewContextShift.enteredReview
              ? '建议优先按复核型结果重看当前判断'
              : reviewContextShift.exitedReview
                ? '建议优先确认是否可恢复普通结果理解'
                : structuralDecayRadarDriven && structuralDecayRadarShift.enteredAlert
                  ? structuralDecayRadarShift.actionHint || '建议优先重开跨市场剧本，确认是否需要进入更强的系统级防御构造。'
                  : inputReliabilityDriven && inputReliabilityShift.worsening
                    ? inputReliabilityShift.actionHint || '建议优先重开研究页并重新确认当前输入可靠度'
                    : departmentChaosDriven && departmentChaosShift.worsening
                      ? departmentChaosShift.actionHint || '建议优先重开研究页并确认部门级政策混乱是否改变组合风险。'
                      : '建议重新打开研究页并更新快照'
          : severity === 'medium'
            ? selectionQualityRunState.active
              ? '建议优先复核当前结果，当前结果已处于降级运行状态'
              : reviewContextShift.changed
                ? reviewContextShift.actionHint || '建议优先复核当前结果语境'
                : structuralDecayRadarDriven
                  ? structuralDecayRadarShift.actionHint || '建议优先复核系统级衰败雷达是否已经改变当前组合的风险预算。'
                  : inputReliabilityDriven
                    ? inputReliabilityShift.actionHint || '建议先复核当前宏观输入可靠度，再决定是否继续沿用当前模板'
                    : departmentChaosDriven
                      ? departmentChaosShift.actionHint || '建议复核部门级政策混乱是否已经影响当前研究结论。'
                      : '建议在当前工作台内复核关键输入后再推进'
            : selectionQualityRunState.active
              ? '当前结果已处于降级运行状态，建议继续观察并准备重开研究'
              : reviewContextShift.changed
                ? reviewContextShift.actionHint || '当前结果语境刚发生切换，建议继续观察并准备重看'
                : structuralDecayRadarDriven
                  ? structuralDecayRadarShift.actionHint || '系统级衰败雷达已变化，建议继续观察并准备重估组合防御强度。'
                  : inputReliabilityDriven
                    ? inputReliabilityShift.actionHint || '当前输入可靠度已变化，建议继续观察并准备重估模板强度'
                    : departmentChaosDriven
                      ? departmentChaosShift.actionHint || '当前部门级政策混乱已变化，建议继续观察并准备重估政策风险。'
                      : '当前可以继续执行现有研究路线',
    };
  });

  return {
    byTaskId: Object.fromEntries(suggestions.map((item) => [item.taskId, item])),
    byTemplateId: Object.fromEntries(
      suggestions.filter((item) => item.templateId).map((item) => [item.templateId, item])
    ),
    prioritized: [...suggestions].sort((left, right) => {
      if (right.urgencyScore !== left.urgencyScore) return right.urgencyScore - left.urgencyScore;
      return (right.priorityWeight ?? 0) - (left.priorityWeight ?? 0);
    }),
  };
};
