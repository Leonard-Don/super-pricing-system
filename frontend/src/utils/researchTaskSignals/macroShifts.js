export const summarizeMacroShift = (macroInput = {}, overview = {}) => {
  const currentScore = Number(overview?.macro_score || 0);
  const savedScore = Number(macroInput?.macro_score || 0);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const currentSignal = Number(overview?.macro_signal ?? 0);
  const savedSignal = Number(macroInput?.macro_signal ?? 0);
  const signalShift = currentSignal !== savedSignal;

  return {
    currentScore,
    savedScore,
    scoreGap,
    currentSignal,
    savedSignal,
    signalShift,
  };
};

export const summarizeResonanceShift = (macroInput = {}, overview = {}) => {
  const savedResonance = macroInput?.resonance || {};
  const currentResonance = overview?.resonance_summary || {};
  const savedLabel = savedResonance.label || 'mixed';
  const currentLabel = currentResonance.label || 'mixed';
  const labelChanged = savedLabel !== currentLabel;
  const savedFactors = new Set([
    ...(savedResonance.positive_cluster || []),
    ...(savedResonance.negative_cluster || []),
    ...(savedResonance.weakening || []),
    ...(savedResonance.precursor || []),
    ...(savedResonance.reversed_factors || []),
  ]);
  const currentFactors = new Set([
    ...(currentResonance.positive_cluster || []),
    ...(currentResonance.negative_cluster || []),
    ...(currentResonance.weakening || []),
    ...(currentResonance.precursor || []),
    ...(currentResonance.reversed_factors || []),
  ]);
  const addedFactors = Array.from(currentFactors).filter((item) => !savedFactors.has(item));
  const removedFactors = Array.from(savedFactors).filter((item) => !currentFactors.has(item));

  return {
    savedLabel,
    currentLabel,
    labelChanged,
    addedFactors,
    removedFactors,
    currentReason: currentResonance.reason || '',
  };
};

export const summarizePolicySourceShift = (macroInput = {}, overview = {}) => {
  const savedHealth = macroInput?.policy_source_health || {};
  const currentHealth = overview?.evidence_summary?.policy_source_health_summary || {};
  const severityRank = { unknown: 0, healthy: 1, watch: 2, fragile: 3 };
  const savedLabel = savedHealth.label || 'unknown';
  const currentLabel = currentHealth.label || 'unknown';
  const savedRank = severityRank[savedLabel] || 0;
  const currentRank = severityRank[currentLabel] || 0;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const labelChanged = currentLabel !== savedLabel;
  const savedFragile = new Set(savedHealth.fragile_sources || []);
  const currentFragile = new Set(currentHealth.fragile_sources || []);
  const addedFragileSources = Array.from(currentFragile).filter((item) => !savedFragile.has(item));
  const removedFragileSources = Array.from(savedFragile).filter((item) => !currentFragile.has(item));
  const fullTextRatioGap = Number(
    (
      Number(currentHealth.avg_full_text_ratio || 0)
      - Number(savedHealth.avg_full_text_ratio || 0)
    ).toFixed(3)
  );

  return {
    savedLabel,
    currentLabel,
    labelChanged,
    worsening,
    improving,
    addedFragileSources,
    removedFragileSources,
    fullTextRatioGap,
    currentReason: currentHealth.reason || '',
  };
};

export const summarizeDepartmentChaosShift = (macroInput = {}, overview = {}) => {
  const savedChaos = macroInput?.department_chaos || {};
  const currentChaos = overview?.department_chaos_summary || {};
  const severityRank = { unknown: 0, stable: 1, watch: 2, chaotic: 3 };
  const savedLabel = savedChaos.label || 'unknown';
  const currentLabel = currentChaos.label || 'unknown';
  const savedRank = severityRank[savedLabel] || 0;
  const currentRank = severityRank[currentLabel] || 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const savedScore = Number(savedChaos.avg_chaos_score || 0);
  const currentScore = Number(currentChaos.avg_chaos_score || 0);
  const scoreGap = Number((currentScore - savedScore).toFixed(3));
  const savedDepartments = new Set((savedChaos.top_departments || []).map((item) => item?.department).filter(Boolean));
  const currentTopDepartments = currentChaos.top_departments || [];
  const newChaoticDepartments = currentTopDepartments
    .filter((item) => (item?.label === 'chaotic' || Number(item?.chaos_score || 0) >= 0.58) && !savedDepartments.has(item?.department))
    .map((item) => item?.department_label || item?.department)
    .filter(Boolean);
  const topDepartment = currentTopDepartments[0] || {};

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
    topDepartmentLabel: topDepartment?.department_label || topDepartment?.department || '',
    topDepartmentReason: topDepartment?.reason || '',
    currentSummary: currentChaos.summary || '',
    lead,
    actionHint,
  };
};

export const summarizeInputReliabilityShift = (macroInput = {}, overview = {}) => {
  const savedReliability = macroInput?.input_reliability || {};
  const currentReliability = overview?.input_reliability_summary || {};
  const severityRank = { unknown: 0, robust: 1, watch: 2, fragile: 3 };
  const savedLabel = savedReliability.label || 'unknown';
  const currentLabel = currentReliability.label || 'unknown';
  const savedRank = severityRank[savedLabel] || 0;
  const currentRank = severityRank[currentLabel] || 0;
  const labelChanged = savedLabel !== currentLabel;
  const worsening = currentRank > savedRank;
  const improving = currentRank < savedRank;
  const scoreGap = Number(
    (
      Number(currentReliability.score || 0)
      - Number(savedReliability.score || 0)
    ).toFixed(3)
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
    currentLead: currentReliability.lead || '',
    currentReason: currentReliability.reason || '',
    transition,
    actionHint,
  };
};
