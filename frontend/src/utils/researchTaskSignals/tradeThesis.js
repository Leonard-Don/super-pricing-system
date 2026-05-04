import { extractTaskPayload, extractLinkedPricingTask } from './taskExtractors';

const extractLeadLegSymbol = (thesis = {}) => {
  const normalizedTradeLegs = thesis?.trade_legs || [];
  const coreExpression = normalizedTradeLegs.find((leg) => leg?.role === 'core_expression' && leg?.symbol);
  if (coreExpression?.symbol) {
    return String(coreExpression.symbol).trim().toUpperCase();
  }
  if (thesis?.primary_leg?.symbol) {
    return String(thesis.primary_leg.symbol).trim().toUpperCase();
  }
  return '';
};

export const summarizeTradeThesisShift = (task = {}, researchTasks = []) => {
  const payload = extractTaskPayload(task);
  const savedTradeThesis = payload?.trade_thesis || {};
  const savedThesis = savedTradeThesis?.thesis || {};
  const linkedPricingTask = extractLinkedPricingTask(task, researchTasks);
  const currentPayload = extractTaskPayload(linkedPricingTask || {});
  const currentThesis = currentPayload?.macro_mispricing_thesis || {};
  const savedStance = savedThesis?.stance || '';
  const currentStance = currentThesis?.stance || savedStance || '';
  const savedHorizon = savedThesis?.horizon || '';
  const currentHorizon = currentThesis?.horizon || savedHorizon || '';
  const savedLeadLeg = extractLeadLegSymbol(savedThesis);
  const currentLeadLeg = extractLeadLegSymbol(currentThesis);
  const savedSummary = savedThesis?.summary || '';
  const currentSummary = currentThesis?.summary || savedSummary || '';
  const stanceChanged = Boolean(savedStance && currentStance && savedStance !== currentStance);
  const horizonChanged = Boolean(savedHorizon && currentHorizon && savedHorizon !== currentHorizon);
  const leadLegChanged = Boolean(savedLeadLeg && currentLeadLeg && savedLeadLeg !== currentLeadLeg);
  const summaryChanged = Boolean(savedSummary && currentSummary && savedSummary !== currentSummary);
  const currentTradeLegs = currentThesis?.trade_legs || [];

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

  const evidence = [];
  if (currentSummary && currentSummary !== savedSummary) {
    evidence.push(currentSummary);
  }
  if (currentTradeLegs.length) {
    evidence.push(
      `当前组合腿 ${currentTradeLegs.slice(0, 3).map((leg) => `${String(leg?.symbol || '').toUpperCase()} ${leg?.side || ''}`.trim()).join(' / ')}`
    );
  }

  return {
    available: Boolean(Object.keys(savedTradeThesis).length || Object.keys(currentThesis).length),
    linkedPricingTaskId: linkedPricingTask?.id || '',
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
