import { formatResearchSource } from '../../utils/researchContext';
import { buildWorkbenchViewFingerprint } from '../../utils/workbenchViewFingerprint';

export const STATUS_LABELS = {
  ready: '待执行',
  blocked: '待数据',
  warning: '需复核',
  complete: '已完成',
};

export const AI_SYMBOLS = new Set(['NVDA', 'AMD', 'TSM', 'SMH', 'QQQ']);
export const POWER_SYMBOLS = new Set(['DUK', 'XLU', 'CEG', 'NEE', 'XLE']);

export const toPercent = (value, digits = 1) => `${(Number(value || 0) * 100).toFixed(digits)}%`;
export const toSignedPercent = (value, digits = 1) => {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : ''}${(numeric * 100).toFixed(digits)}%`;
};
export const toSignedPercentPoints = (value, digits = 1) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
};

export const compactText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const WORKBENCH_REFRESH_LABELS = {
  high: '建议更新',
  medium: '建议复核',
  low: '继续观察',
};

export const WORKBENCH_TYPE_LABELS = {
  pricing: 'Pricing',
  cross_market: 'Cross-Market',
  macro_mispricing: 'Macro Mispricing',
  trade_thesis: 'Trade Thesis',
};

export const WORKBENCH_SNAPSHOT_VIEW_LABELS = {
  filtered: '带筛选视角快照',
  scoped: '带任务焦点快照',
};

export const WORKBENCH_REASON_LABELS = {
  priority_new: '自动排序首次入列',
  priority_escalated: '自动排序升档',
  priority_relaxed: '自动排序缓和',
  priority_updated: '自动排序同类更新',
  resonance: '共振驱动',
  bias_quality_core: '核心腿受压',
  selection_quality_active: '降级运行',
  review_context: '复核语境切换',
  structural_decay: '结构衰败/系统雷达',
  trade_thesis: '交易 Thesis 漂移',
  people_layer: '人的维度',
  people_fragility: '人的维度',
  department_chaos: '部门混乱',
  policy_execution: '政策执行混乱',
  selection_quality: '自动降级',
  input_reliability: '输入可靠度',
  source_health_degradation: '来源健康退化',
  policy_source: '政策源驱动',
  bias_quality: '偏置收缩',
};

export const buildWorkbenchViewContext = (context = {}) => {
  const refresh = String(context?.workbenchRefresh || '').trim();
  const type = String(context?.workbenchType || '').trim();
  const sourceFilter = String(context?.workbenchSource || '').trim();
  const reason = String(context?.workbenchReason || '').trim();
  const snapshotView = String(context?.workbenchSnapshotView || '').trim();
  const snapshotFingerprint = String(context?.workbenchSnapshotFingerprint || '').trim();
  const snapshotSummary = String(context?.workbenchSnapshotSummary || '').trim();
  const keyword = String(context?.workbenchKeyword || '').trim();
  const taskId = String(context?.task || '').trim();

  if (![refresh, type, sourceFilter, reason, snapshotView, snapshotFingerprint, snapshotSummary, keyword, taskId].some(Boolean)) {
    return null;
  }

  const summaryParts = [];

  if (reason) {
    summaryParts.push(
      `${reason.startsWith('priority_') ? '快速视图' : '更新原因'}：${WORKBENCH_REASON_LABELS[reason] || reason}`
    );
  }
  if (keyword) {
    summaryParts.push(`关键词：${keyword}`);
  }
  if (refresh) {
    summaryParts.push(`更新级别：${WORKBENCH_REFRESH_LABELS[refresh] || refresh}`);
  }
  if (snapshotView) {
    summaryParts.push(`快照视角：${WORKBENCH_SNAPSHOT_VIEW_LABELS[snapshotView] || snapshotView}`);
  }
  if (snapshotSummary) {
    summaryParts.push(`研究视角：${snapshotSummary}`);
  }
  if (type) {
    summaryParts.push(`类型：${WORKBENCH_TYPE_LABELS[type] || type}`);
  }
  if (sourceFilter) {
    summaryParts.push(`来源：${formatResearchSource(sourceFilter)}`);
  }

  const viewFingerprint = snapshotFingerprint || buildWorkbenchViewFingerprint({
    refresh,
    type,
    source_filter: sourceFilter,
    reason,
    snapshot_view: snapshotView,
    keyword,
    task_id: taskId,
  });

  return {
    source_view: 'workbench',
    has_filters: summaryParts.length > 0,
    refresh,
    type,
    source_filter: sourceFilter,
    reason,
    snapshot_view: snapshotView,
    view_fingerprint: viewFingerprint,
    snapshot_summary: snapshotSummary,
    keyword,
    task_id: taskId,
    summary: summaryParts.length ? summaryParts.join(' · ') : '全部任务视图',
    scoped_task_label: taskId ? `当前定位：${taskId}` : '',
    note: summaryParts.length
      ? '这次快照是在带筛选的工作台视图下保存的。'
      : '这次快照是在完整工作台视图下保存的。',
  };
};

export const buildPricingAction = (symbol, source, note) =>
  symbol
    ? {
        label: '打开定价剧本',
        target: 'pricing',
        symbol,
        source,
        note,
      }
    : null;

export const buildCrossMarketAction = (template, source, note) =>
  template
    ? {
        label: '打开跨市场剧本',
        target: 'cross-market',
        template,
        source,
        note,
      }
    : null;

export const buildGodEyeAction = (note = '返回 GodEye 继续筛选宏观线索') => ({
  label: '回到 GodEye',
  target: 'godsEye',
  source: 'playbook',
  note,
});

export const buildHighlights = (playbook = {}, fallback = []) => {
  const safePlaybook = playbook || {};
  const highlights = [
    ...(safePlaybook.warnings || []),
    ...(fallback || []),
  ].filter(Boolean);
  return highlights.slice(0, 4);
};

export const detectMacroCue = (texts = []) =>
  /政策|宏观|能源|电力|电网|地缘|供应|供给|库存|物流|利率|关税|算力|火电|核电/i.test(
    texts.map((item) => compactText(item)).join(' ')
  );

export const isMacroSensitiveSector = (sector = '') =>
  /energy|utilities|industrials|materials/i.test(String(sector || '').trim());

export const hasProxyFactorInputs = (factorModel = {}) =>
  Boolean(factorModel?.factor_source?.is_proxy || factorModel?.five_factor_source?.is_proxy);

export const deriveCrossMarketSignal = (symbol, pricingResult = {}) => {
  const gap = pricingResult?.gap_analysis || {};
  const drivers = pricingResult?.deviation_drivers?.drivers || [];
  const valuation = pricingResult?.valuation || {};
  const implications = pricingResult?.implications || {};
  const factorModel = pricingResult?.factor_model || {};
  const insights = implications?.insights || [];
  const texts = [
    gap.direction,
    gap.severity_label,
    ...drivers.map((item) => item?.description),
    implications?.factor_alignment?.summary,
    implications?.primary_view,
    ...insights,
  ];
  const reasons = [];
  const confidence = implications?.confidence;
  const riskLevel = implications?.risk_level;
  const alignmentStatus = implications?.factor_alignment?.status;
  const severity = gap?.severity;
  const sector = valuation?.comparables?.sector || valuation?.fundamentals?.sector || '';
  const macroCue = detectMacroCue(texts);
  const proxyInputs = hasProxyFactorInputs(factorModel);

  if (alignmentStatus === 'conflict') {
    reasons.push('因子信号与估值结论存在冲突');
  }
  if (confidence === 'low') {
    reasons.push('当前结论置信度偏低');
  }
  if (riskLevel === 'high') {
    reasons.push('风险等级偏高');
  }
  if (proxyInputs) {
    reasons.push('因子数据包含代理估算值');
  }
  if (isMacroSensitiveSector(sector)) {
    reasons.push(`标的处在 ${sector || '宏观敏感行业'}，更容易受跨资产变量驱动`);
  }
  if (macroCue) {
    reasons.push('驱动描述里出现明显的宏观或供需线索');
  }
  if (['moderate', 'extreme', 'unknown'].includes(severity)) {
    reasons.push('当前偏差等级需要额外验证');
  }
  if (POWER_SYMBOLS.has(symbol) || AI_SYMBOLS.has(symbol)) {
    reasons.push(`${symbol} 所在主题常和跨市场变量联动`);
  }

  const hardTriggers = [alignmentStatus === 'conflict', riskLevel === 'high', confidence === 'low'].filter(Boolean).length;
  const supportingSignals = [macroCue, proxyInputs, isMacroSensitiveSector(sector), ['moderate', 'extreme', 'unknown'].includes(severity), POWER_SYMBOLS.has(symbol) || AI_SYMBOLS.has(symbol)].filter(Boolean).length;
  const shouldCrossMarket = hardTriggers >= 2 || (hardTriggers >= 1 && supportingSignals >= 1) || (macroCue && isMacroSensitiveSector(sector));

  return {
    shouldCrossMarket,
    reasons: Array.from(new Set(reasons)),
    macroCue,
    sector,
  };
};

export const recommendTemplateForSymbol = (symbol = '', texts = []) => {
  const upper = String(symbol || '').toUpperCase();
  const joined = texts.map((item) => compactText(item)).join(' ');

  if (/能源|电力|电网|火电|核电/i.test(joined) || POWER_SYMBOLS.has(upper)) {
    return 'energy_vs_ai_apps';
  }

  if (/半导体|铜|算力|芯片/i.test(joined) || AI_SYMBOLS.has(upper)) {
    return 'copper_vs_semis';
  }

  return 'defensive_beta_hedge';
};

export const describeConfidence = (level = '') => {
  const mapping = {
    low: '低',
    medium: '中',
    high: '高',
  };
  return mapping[level] || '中';
};

