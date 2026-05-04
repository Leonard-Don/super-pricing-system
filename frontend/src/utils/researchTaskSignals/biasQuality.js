const BIAS_QUALITY_MAP = {
  fragile: { label: 'compressed', scale: 0.55 },
  watch: { label: 'cautious', scale: 0.78 },
  healthy: { label: 'full', scale: 1 },
  unknown: { label: 'full', scale: 1 },
};

const extractCompressedLeader = (allocationOverlay = {}) =>
  (allocationOverlay.rows || [])
    .slice()
    .sort((left, right) => Math.abs(Number(right?.compression_delta || 0)) - Math.abs(Number(left?.compression_delta || 0)))
    .find((item) => Math.abs(Number(item?.compression_delta || 0)) >= 0.005) || null;

export const summarizeBiasCompressionShift = (templateMeta = {}, overview = {}, allocationOverlay = {}) => {
  const currentHealth = overview?.evidence_summary?.policy_source_health_summary || {};
  const currentHealthLabel = currentHealth.label || 'unknown';
  const currentBiasMeta = BIAS_QUALITY_MAP[currentHealthLabel] || BIAS_QUALITY_MAP.unknown;
  const savedLabel = templateMeta?.bias_quality_label || 'full';
  const savedScale = Number(templateMeta?.bias_scale ?? 1);
  const currentLabel = currentBiasMeta.label || 'full';
  const currentScale = Number(currentBiasMeta.scale ?? 1);
  const scaleGap = Number((currentScale - savedScale).toFixed(3));
  const labelChanged = savedLabel !== currentLabel;
  const compressed = currentScale < savedScale - 0.05;
  const expanded = currentScale > savedScale + 0.05;
  const compressedLeader = extractCompressedLeader(allocationOverlay);
  const coreLegSymbols = new Set([
    ...(templateMeta?.core_legs || []).map((item) => String(item?.symbol || '').toUpperCase()).filter(Boolean),
  ]);
  const themeCoreText = String(templateMeta?.theme_core || '').toUpperCase();
  const topCompressedSymbol = String(compressedLeader?.symbol || '').toUpperCase();
  const coreLegAffected = Boolean(
    topCompressedSymbol
    && (coreLegSymbols.has(topCompressedSymbol) || themeCoreText.includes(topCompressedSymbol))
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
      ? `${compressedLeader.symbol} ${(Math.abs(Number(compressedLeader.compression_delta || 0)) * 100).toFixed(2)}pp`
      : '',
    topCompressedSymbol,
    coreLegAffected,
    currentReason: currentHealth.reason || templateMeta?.bias_quality_reason || '',
  };
};

export const summarizeSelectionQualityShift = (templateMeta = {}, biasCompressionShift = {}) => {
  const severityRank = {
    original: 0,
    softened: 1,
    auto_downgraded: 2,
  };
  const savedSelectionQuality = templateMeta?.selection_quality || {};
  const savedLabel = savedSelectionQuality.label
    || (templateMeta?.ranking_penalty > 0 ? 'softened' : 'original');
  const currentLabel = biasCompressionShift?.coreLegAffected
    ? 'auto_downgraded'
    : (biasCompressionShift?.compressed || biasCompressionShift?.labelChanged)
      ? 'softened'
      : 'original';
  const savedPenalty = Number(templateMeta?.ranking_penalty || 0);
  const currentPenalty = currentLabel === 'auto_downgraded'
    ? 0.45
    : currentLabel === 'softened'
      ? 0.2
      : 0;
  const labelChanged = savedLabel !== currentLabel;
  const penaltyGap = Number((currentPenalty - savedPenalty).toFixed(3));
  const worsening = (severityRank[currentLabel] || 0) > (severityRank[savedLabel] || 0);
  const improving = (severityRank[currentLabel] || 0) < (severityRank[savedLabel] || 0);

  return {
    savedLabel,
    currentLabel,
    savedPenalty,
    currentPenalty,
    penaltyGap,
    labelChanged,
    worsening,
    improving,
    currentReason: biasCompressionShift?.currentReason || savedSelectionQuality.reason || '',
  };
};

export const summarizeSelectionQualityRunState = (templateMeta = {}, allocationOverlay = {}) => {
  const selectionQuality = allocationOverlay?.selection_quality || templateMeta?.selection_quality || {};
  const label = selectionQuality.label || 'original';
  const baseScore = Number(
    selectionQuality.base_recommendation_score
    ?? templateMeta?.base_recommendation_score
    ?? 0
  );
  const effectiveScore = Number(
    selectionQuality.effective_recommendation_score
    ?? templateMeta?.recommendation_score
    ?? templateMeta?.base_recommendation_score
    ?? 0
  );
  const baseTier = selectionQuality.base_recommendation_tier
    || templateMeta?.base_recommendation_tier
    || '';
  const effectiveTier = selectionQuality.effective_recommendation_tier
    || templateMeta?.recommendation_tier
    || baseTier;
  const rankingPenalty = Number(
    selectionQuality.ranking_penalty
    ?? templateMeta?.ranking_penalty
    ?? 0
  );

  return {
    label,
    active: label !== 'original' || rankingPenalty > 0.01,
    baseScore,
    effectiveScore,
    baseTier,
    effectiveTier,
    rankingPenalty,
    reason: selectionQuality.reason
      || templateMeta?.selection_quality?.reason
      || templateMeta?.ranking_penalty_reason
      || '',
  };
};
