export const DIMENSION_META = {
  investment_activity: { label: '投资活跃度', group: 'Supply Chain' },
  project_pipeline: { label: '项目管线', group: 'Supply Chain' },
  talent_structure: { label: '人才结构', group: 'Supply Chain' },
  inventory: { label: '库存压力', group: 'Macro HF' },
  trade: { label: '贸易脉冲', group: 'Macro HF' },
  logistics: { label: '物流摩擦', group: 'Macro HF' },
  people_layer: { label: '人的维度', group: 'People Layer' },
  policy_execution: { label: '政策执行', group: 'Policy Execution' },
  source_mode_summary: { label: '来源治理', group: 'Input Quality' },
};

export const FACTOR_LABELS = {
  bureaucratic_friction: '官僚摩擦',
  tech_dilution: '技术稀释',
  baseload_mismatch: '基荷错配',
  rate_curve_pressure: '利率曲线压力',
  credit_spread_stress: '信用利差压力',
  fx_mismatch: '汇率错配',
  people_fragility: '人的维度脆弱',
  policy_execution_disorder: '政策执行混乱',
};

export const DEFENSIVE_LONG_SYMBOLS = new Set(['XLU', 'DUK', 'CEG', 'NEE', 'XLE', 'VDE']);
export const PHYSICAL_LONG_SYMBOLS = new Set(['HG=F', 'XLE', 'VDE', 'XLU', 'DUK', 'CEG', 'NEE']);
export const GROWTH_SHORT_SYMBOLS = new Set(['QQQ', 'ARKK', 'IGV', 'CLOU', 'SOXX', 'SMH']);
export const SEMI_SHORT_SYMBOLS = new Set(['SOXX', 'SMH']);
export const RISK_ON_LONG_SYMBOLS = new Set(['QQQ', 'ARKK', 'IGV', 'CLOU', 'SOXX', 'SMH']);

export const formatFactorName = (name = '') => FACTOR_LABELS[name] || name.replace(/_/g, ' ');

export const clampMin = (value, minimum = 0.05) => Math.max(minimum, Number(value || 0));
export const pushContribution = (list, key, label, value) => {
  const numeric = Number(value || 0);
  if (numeric <= 0.005) {
    return;
  }
  list.push({
    key,
    label,
    value: Number(numeric.toFixed(4)),
  });
};

export const buildFactorLookup = (overview = {}) =>
  Object.fromEntries((overview?.factors || []).map((factor) => [factor.name, factor]));

export const buildDimensionLookup = (snapshot = {}) => ({
  ...(snapshot?.signals?.supply_chain?.dimensions || {}),
  ...(snapshot?.signals?.macro_hf?.dimensions || {}),
});

export const buildRecommendationTier = (score) => {
  if (score >= 2.6) return '优先部署';
  if (score >= 1.4) return '重点跟踪';
  return '候选模板';
};

export const buildRecommendationTone = (score) => {
  if (score >= 2.6) return 'volcano';
  if (score >= 1.4) return 'gold';
  return 'blue';
};

export const buildResonanceMeta = (overview = {}) => {
  const resonance = overview?.resonance_summary || {};
  return {
    label: resonance.label || 'mixed',
    reason: resonance.reason || '',
    positive: new Set(resonance.positive_cluster || []),
    negative: new Set(resonance.negative_cluster || []),
    weakening: new Set(resonance.weakening || []),
    precursor: new Set(resonance.precursor || []),
    reversed: new Set(resonance.reversed_factors || []),
  };
};

export const buildPolicySourceHealthMeta = (overview = {}) => {
  const summary = overview?.evidence_summary?.policy_source_health_summary || {};
  return {
    label: summary.label || 'unknown',
    reason: summary.reason || '',
    fragileSources: summary.fragile_sources || [],
    watchSources: summary.watch_sources || [],
    avgFullTextRatio: Number(summary.avg_full_text_ratio || 0),
  };
};

export const buildInputReliabilityMeta = (overview = {}) => {
  const summary = overview?.input_reliability_summary || {};
  return {
    label: summary.label || 'unknown',
    score: Number(summary.score || 0),
    lead: summary.lead || '',
    posture: summary.posture || '',
    reason: summary.reason || '',
    dominantIssueLabels: summary.dominant_issue_labels || [],
    dominantSupportLabels: summary.dominant_support_labels || [],
  };
};

export const buildDepartmentChaosMeta = (overview = {}) => {
  const summary = overview?.department_chaos_summary || {};
  const topDepartment = (summary.top_departments || [])[0] || {};
  const avgScore = Number(summary.avg_chaos_score || 0);
  const topScore = Number(topDepartment.chaos_score || 0);
  const intensity = Math.max(avgScore, topScore);
  const label = summary.label || 'unknown';
  const active = label === 'chaotic' || intensity >= 0.58;
  const watch = label === 'watch' || intensity >= 0.38;
  const riskBudgetScale = active ? 0.82 : watch ? 0.92 : 1;

  return {
    label,
    summary: summary.summary || '',
    score: Number(avgScore.toFixed(4)),
    intensity: Number(Math.min(1, intensity).toFixed(4)),
    active,
    watch,
    riskBudgetScale,
    topDepartment: topDepartment.department || '',
    topDepartmentLabel: topDepartment.department_label || topDepartment.department || '',
    topDepartmentReason: topDepartment.reason || '',
    defensiveTilt: active ? Math.min(0.16, intensity * 0.16) : watch ? Math.min(0.07, intensity * 0.09) : 0,
    hedgeBoost: active ? Math.min(0.14, intensity * 0.14) : watch ? Math.min(0.06, intensity * 0.08) : 0,
    offensiveHaircut: active ? Math.min(0.12, intensity * 0.12) : watch ? Math.min(0.05, intensity * 0.06) : 0,
  };
};

export const buildPeopleFragilityMeta = (overview = {}) => {
  const summary = overview?.people_layer_summary || {};
  const watchlist = summary.watchlist || [];
  const fragileCompanies = summary.fragile_companies || [];
  const topCompany = [...fragileCompanies, ...watchlist]
    .sort((left, right) => Number(right?.people_fragility_score || 0) - Number(left?.people_fragility_score || 0))[0] || {};
  const avgScore = Number(summary.avg_fragility_score || 0);
  const topScore = Number(topCompany.people_fragility_score || 0);
  const dilutionRatio = Number(topCompany?.hiring_signal?.dilution_ratio || 0);
  const dilutionPressure = dilutionRatio > 1 ? Math.min(1, (dilutionRatio - 1) / 1.5) : 0;
  const intensity = Math.max(avgScore, topScore, dilutionPressure);
  const label = summary.label || (fragileCompanies.length ? 'fragile' : watchlist.length ? 'watch' : 'stable');
  const active = label === 'fragile' || topScore >= 0.68 || dilutionRatio >= 1.6;
  const watch = active || label === 'watch' || topScore >= 0.48 || dilutionRatio >= 1.35;
  const riskBudgetScale = active ? 0.88 : watch ? 0.96 : 1;

  return {
    label,
    summary: summary.summary || '',
    score: Number(Math.max(avgScore, topScore).toFixed(4)),
    intensity: Number(Math.min(1, intensity).toFixed(4)),
    active,
    watch,
    riskBudgetScale,
    companySymbol: topCompany.symbol || '',
    companyName: topCompany.company_name || topCompany.symbol || '',
    reason: topCompany.summary || summary.summary || '',
    shortBoost: active ? Math.min(0.18, intensity * 0.18) : watch ? Math.min(0.08, intensity * 0.1) : 0,
    defensiveTilt: active ? Math.min(0.08, intensity * 0.08) : watch ? Math.min(0.04, intensity * 0.05) : 0,
    riskOnHaircut: active ? Math.min(0.14, intensity * 0.14) : watch ? Math.min(0.06, intensity * 0.08) : 0,
  };
};

export const buildPolicyExecutionMeta = (overview = {}) => {
  const summary = overview?.department_chaos_summary || {};
  const factorLookup = buildFactorLookup(overview);
  const factor = factorLookup.policy_execution_disorder || {};
  const topDepartment = (summary.top_departments || [])[0] || {};
  const avgScore = Number(summary.avg_chaos_score || 0);
  const factorStrength = Math.abs(Number(factor.z_score || factor.value || 0));
  const intensity = Math.max(avgScore, factorStrength * 0.28);
  const label = summary.label || (intensity >= 0.6 ? 'chaotic' : intensity >= 0.36 ? 'watch' : 'stable');
  const active = label === 'chaotic' || intensity >= 0.58;
  const watch = active || label === 'watch' || intensity >= 0.38;
  const riskBudgetScale = active ? 0.84 : watch ? 0.94 : 1;

  return {
    label,
    summary: summary.summary || '',
    score: Number(avgScore.toFixed(4)),
    intensity: Number(Math.min(1, intensity).toFixed(4)),
    active,
    watch,
    riskBudgetScale,
    topDepartment: topDepartment.department || '',
    topDepartmentLabel: topDepartment.department_label || topDepartment.department || '',
    reason: topDepartment.reason || summary.summary || '',
    hedgeBoost: active ? Math.min(0.16, intensity * 0.16) : watch ? Math.min(0.07, intensity * 0.09) : 0,
    offensiveHaircut: active ? Math.min(0.14, intensity * 0.14) : watch ? Math.min(0.06, intensity * 0.08) : 0,
  };
};

export const buildSourceModeMeta = (overview = {}, snapshot = {}) => {
  const summary = overview?.source_mode_summary || snapshot?.source_mode_summary || {};
  const counts = summary?.counts || {};
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  const officialLike = ['official', 'corporate_governance', 'market_disclosure', 'market', 'public_procurement', 'regulatory_filing']
    .reduce((sum, key) => sum + Number(counts?.[key] || 0), 0);
  const fallbackLike = ['proxy', 'curated', 'derived']
    .reduce((sum, key) => sum + Number(counts?.[key] || 0), 0);
  const officialShare = total ? officialLike / total : 0;
  const fallbackShare = total ? fallbackLike / total : 0;
  const providerHealth = snapshot?.provider_health || {};
  const degradedProviders = Number(providerHealth?.degraded_providers || 0) + Number(providerHealth?.error_providers || 0);
  const label = summary?.label
    || (fallbackShare >= 0.45 ? 'fallback-heavy' : officialShare >= 0.5 ? 'official-led' : 'mixed');
  const riskBudgetScale = label === 'fallback-heavy' ? (degradedProviders ? 0.72 : 0.8) : 1;

  return {
    label,
    dominant: summary?.dominant || '',
    counts,
    coverage: total,
    officialShare: Number(officialShare.toFixed(4)),
    fallbackShare: Number(fallbackShare.toFixed(4)),
    degradedProviders,
    riskBudgetScale,
    active: label === 'fallback-heavy',
    watch: label === 'mixed',
    reason:
      label === 'fallback-heavy'
        ? `当前来源治理偏回退，degraded provider ${degradedProviders} 个，建议压缩偏置强度。`
        : label === 'official-led'
          ? '当前研究输入以官方/披露源为主，来源治理对结论形成小幅正向支撑。'
          : '当前研究输入由多类来源混合组成，方向保持不变，但需要继续观察来源治理质量。',
  };
};

export const buildStructuralDecayRadarMeta = (overview = {}) => {
  const radar = overview?.structural_decay_radar || {};
  const axes = radar.axes || [];
  const score = Number(radar.score || 0);
  const criticalAxisCount = Number(radar.critical_axis_count || 0);
  const topSignals = radar.top_signals || [];
  const active = radar.label === 'decay_alert' || score >= 0.68 || criticalAxisCount >= 3;
  const watch = active || radar.label === 'decay_watch' || score >= 0.44 || criticalAxisCount >= 1;
  const riskBudgetScale = active ? 0.78 : watch ? 0.9 : 1;
  const intensity = Math.min(1, Math.max(score, criticalAxisCount / 5));

  return {
    label: radar.label || 'stable',
    displayLabel: radar.display_label || '',
    score: Number(score.toFixed(4)),
    criticalAxisCount,
    axes,
    topSignals,
    actionHint: radar.action_hint || '',
    active,
    watch,
    riskBudgetScale,
    defensiveTilt: active ? Math.min(0.14, intensity * 0.14) : watch ? Math.min(0.06, intensity * 0.08) : 0,
    hedgeBoost: active ? Math.min(0.16, intensity * 0.16) : watch ? Math.min(0.07, intensity * 0.09) : 0,
    riskOnHaircut: active ? Math.min(0.13, intensity * 0.13) : watch ? Math.min(0.06, intensity * 0.08) : 0,
  };
};

export const CROSS_MARKET_FACTOR_LABELS = FACTOR_LABELS;
export const CROSS_MARKET_DIMENSION_LABELS = Object.fromEntries(
  Object.entries(DIMENSION_META).map(([key, meta]) => [key, meta.label])
);
