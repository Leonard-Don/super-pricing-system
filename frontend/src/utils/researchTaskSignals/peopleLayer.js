import { extractTaskPayload } from './taskExtractors';

function currentLayerHasFragileSignal(entry = {}) {
  return (entry?.risk_level === 'high')
    || Number(entry?.people_fragility_score || 0) >= 0.62;
}

const PEOPLE_RISK_RANK = {
  low: 1,
  medium: 2,
  high: 3,
  unknown: 0,
};

const PEOPLE_STANCE_RANK = {
  supportive: 1,
  neutral: 0,
  fragile: -1,
  unknown: 0,
};

export const summarizePeopleLayerShift = (task = {}, overview = {}) => {
  const payload = extractTaskPayload(task);
  const savedLayer = payload?.people_layer || {};
  const symbol = String(task?.symbol || payload?.symbol || '').trim().toUpperCase();
  const watchlist = overview?.people_layer_summary?.watchlist || [];
  const currentEntry = watchlist.find(
    (item) => String(item?.symbol || '').trim().toUpperCase() === symbol
  ) || null;

  const savedRiskLevel = savedLayer?.risk_level || 'unknown';
  const currentRiskLevel = currentEntry?.risk_level || savedRiskLevel || 'unknown';
  const savedStance = savedLayer?.stance || 'unknown';
  const currentStance = currentEntry?.stance || savedStance || 'unknown';
  const savedFragility = Number(savedLayer?.people_fragility_score || 0);
  const currentFragility = Number(currentEntry?.people_fragility_score ?? savedFragility);
  const savedQuality = Number(savedLayer?.people_quality_score || 0);
  const currentQuality = Number(currentEntry?.people_quality_score ?? savedQuality);
  const savedHiringSignal = savedLayer?.hiring_signal || {};
  const currentHiringSignal = currentEntry?.hiring_signal || {};
  const savedInsiderFlow = savedLayer?.insider_flow || {};
  const currentInsiderFlow = currentEntry?.insider_flow || {};
  const fragilityGap = Number((currentFragility - savedFragility).toFixed(3));
  const qualityGap = Number((currentQuality - savedQuality).toFixed(3));
  const riskWorsening =
    (PEOPLE_RISK_RANK[currentRiskLevel] || 0) > (PEOPLE_RISK_RANK[savedRiskLevel] || 0);
  const riskImproving =
    (PEOPLE_RISK_RANK[currentRiskLevel] || 0) < (PEOPLE_RISK_RANK[savedRiskLevel] || 0);
  const stanceWorsening =
    (PEOPLE_STANCE_RANK[currentStance] || 0) < (PEOPLE_STANCE_RANK[savedStance] || 0);
  const labelChanged = savedRiskLevel !== currentRiskLevel || savedStance !== currentStance;
  const enteredFragile = currentRiskLevel === 'high' && savedRiskLevel !== 'high';
  const currentSummary = currentEntry?.summary || overview?.people_layer_summary?.summary || '';

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

  const evidence = [];
  const currentDilution = Number(currentHiringSignal?.dilution_ratio || 0);
  const savedDilution = Number(savedHiringSignal?.dilution_ratio || 0);
  if (currentDilution > 0 && (currentDilution >= 1.5 || Math.abs(currentDilution - savedDilution) >= 0.2)) {
    evidence.push(`招聘稀释度 ${savedDilution > 0 ? `${savedDilution.toFixed(2)}→` : ''}${currentDilution.toFixed(2)}`);
  }
  const currentConviction = Number(currentInsiderFlow?.conviction_score || 0);
  const savedConviction = Number(savedInsiderFlow?.conviction_score || 0);
  if (currentConviction <= -0.18 || (savedConviction - currentConviction) >= 0.12) {
    evidence.push(`内部人信号 ${savedConviction.toFixed(2)}→${currentConviction.toFixed(2)}`);
  } else if (currentConviction >= 0.18 && (currentConviction - savedConviction) >= 0.12) {
    evidence.push(`内部人背书 ${savedConviction.toFixed(2)}→${currentConviction.toFixed(2)}`);
  }
  if (currentLayerHasFragileSignal(currentEntry)) {
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
