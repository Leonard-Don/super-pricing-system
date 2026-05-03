import { extractTaskPayload, extractLinkedPricingTask } from './taskExtractors';

const STRUCTURAL_DECAY_ACTION_RANK = {
  stable: 0,
  watch: 1,
  structural_avoid: 2,
  structural_short: 3,
};

export const summarizeStructuralDecayShift = (task = {}, researchTasks = []) => {
  const payload = extractTaskPayload(task);
  const savedDecay = payload?.structural_decay || {};
  const symbol = String(task?.symbol || payload?.symbol || '').trim().toUpperCase();
  const linkedPricingTask = extractLinkedPricingTask(task, researchTasks);

  const currentPayload = extractTaskPayload(linkedPricingTask || {});
  const currentDecay = currentPayload?.structural_decay || {};

  const savedScore = Number(savedDecay?.score || 0);
  const currentScore = Number(currentDecay?.score ?? savedScore);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedAction = savedDecay?.action || 'watch';
  const currentAction = currentDecay?.action || savedAction || 'watch';
  const savedLabel = savedDecay?.label || '-';
  const currentLabel = currentDecay?.label || savedLabel || '-';
  const savedRank = STRUCTURAL_DECAY_ACTION_RANK[savedAction] || 0;
  const currentRank = STRUCTURAL_DECAY_ACTION_RANK[currentAction] || 0;
  const actionWorsening = currentRank > savedRank;
  const actionImproving = currentRank < savedRank;
  const labelChanged = savedLabel !== currentLabel;
  const enteredCritical = currentAction === 'structural_short' && savedAction !== 'structural_short';
  const savedFailure = savedDecay?.dominant_failure_label || '';
  const currentFailure = currentDecay?.dominant_failure_label || savedFailure || '';
  const failureChanged = Boolean(savedFailure && currentFailure && savedFailure !== currentFailure);
  const currentSummary = currentDecay?.summary || '';

  const savedEvidence = new Set(savedDecay?.evidence || []);
  const currentEvidence = currentDecay?.evidence || [];
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
    linkedPricingTaskId: linkedPricingTask?.id || '',
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

const STRUCTURAL_RADAR_RANK = {
  stable: 0,
  decay_watch: 1,
  decay_alert: 2,
};

export const summarizeStructuralDecayRadarShift = (macroInput = {}, overview = {}) => {
  const savedRadar = macroInput?.structural_decay_radar || {};
  const currentRadar = overview?.structural_decay_radar || {};
  const savedLabel = savedRadar.label || 'stable';
  const currentLabel = currentRadar.label || savedLabel || 'stable';
  const savedRank = STRUCTURAL_RADAR_RANK[savedLabel] || 0;
  const currentRank = STRUCTURAL_RADAR_RANK[currentLabel] || 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const savedScore = Number(savedRadar.score || 0);
  const currentScore = Number(currentRadar.score ?? savedScore);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedCriticalAxisCount = Number(savedRadar.critical_axis_count || 0);
  const currentCriticalAxisCount = Number(currentRadar.critical_axis_count || savedCriticalAxisCount);
  const criticalAxisGap = currentCriticalAxisCount - savedCriticalAxisCount;
  const enteredAlert = currentLabel === 'decay_alert' && savedLabel !== 'decay_alert';
  const topSignalLabels = (currentRadar.top_signals || []).slice(0, 2).map((item) => item?.label).filter(Boolean);

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
    currentSummary: currentRadar.action_hint || '',
    topSignalLabels,
    topSignalSummary: topSignalLabels.join(' · '),
    lead,
    actionHint,
  };
};
