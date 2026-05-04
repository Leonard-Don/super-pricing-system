export const formatFactorName = (name = '') => {
  const mapping = {
    bureaucratic_friction: '官僚摩擦',
    tech_dilution: '技术稀释',
    baseload_mismatch: '基荷错配',
    rate_curve_pressure: '利率曲线压力',
    credit_spread_stress: '信用利差压力',
    fx_mismatch: '汇率错配',
  };
  return mapping[name] || name.replace(/_/g, ' ');
};

const getSnapshotSelectionQualityLabel = (snapshot = {}) => {
  const payload = snapshot?.payload || {};
  const label =
    payload?.allocation_overlay?.selection_quality?.label
    || payload?.template_meta?.selection_quality?.label
    || '';
  if (label) {
    return label;
  }
  return String(snapshot?.headline || '').includes('复核型结果') ? 'review_result' : 'original';
};

export const summarizeReviewContextShift = (task = {}) => {
  const history = task?.snapshot_history || [];
  if (history.length < 2) {
    return {
      changed: false,
      enteredReview: false,
      exitedReview: false,
      savedLabel: '',
      currentLabel: '',
      lead: '',
    };
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

  return {
    changed,
    enteredReview,
    exitedReview,
    savedLabel,
    currentLabel,
    lead,
    actionHint,
    transition,
  };
};

export const summarizeAltShifts = (altInput = {}, snapshot = {}) => {
  const currentSummary = snapshot?.category_summary || {};
  const savedCategories = altInput?.top_categories || [];
  const changedCategories = savedCategories
    .map((item) => {
      const current = currentSummary[item.category];
      if (!current) {
        return null;
      }

      const previousDelta = Number(item.delta_score || 0);
      const currentDelta = Number(current.delta_score || 0);
      const deltaGap = Number((currentDelta - previousDelta).toFixed(3));
      const previousMomentum = item.momentum || 'stable';
      const currentMomentum = current.momentum || 'stable';
      const momentumShift = previousMomentum !== currentMomentum;

      if (!momentumShift && Math.abs(deltaGap) < 0.12) {
        return null;
      }

      return {
        category: item.category,
        previousMomentum,
        currentMomentum,
        previousDelta,
        currentDelta,
        deltaGap,
      };
    })
    .filter(Boolean)
    .sort((left, right) => Math.abs(right.deltaGap) - Math.abs(left.deltaGap));

  const savedNames = new Set(savedCategories.map((item) => item.category));
  const emergentCategories = Object.entries(currentSummary)
    .filter(([category, current]) => !savedNames.has(category) && Math.abs(Number(current?.delta_score || 0)) >= 0.18)
    .sort((left, right) => Math.abs(Number(right[1]?.delta_score || 0)) - Math.abs(Number(left[1]?.delta_score || 0)))
    .slice(0, 2)
    .map(([category, current]) => ({
      category,
      momentum: current?.momentum || 'stable',
      delta: Number(current?.delta_score || 0),
    }));

  return {
    changedCategories,
    emergentCategories,
  };
};

export const summarizeFactorShifts = (overview = {}, templateMeta = {}) => {
  const factorDeltas = overview?.trend?.factor_deltas || {};
  const linked = new Set([
    ...(templateMeta?.dominant_drivers || []).map((item) => item?.key).filter(Boolean),
    ...(templateMeta?.driver_summary || []).map((item) => item?.key).filter(Boolean),
  ]);

  return Object.entries(factorDeltas)
    .filter(([key, item]) =>
      linked.has(key) || Boolean(item?.signal_changed) || Math.abs(Number(item?.z_score_delta || 0)) >= 0.35
    )
    .sort((left, right) => Math.abs(Number(right[1]?.z_score_delta || 0)) - Math.abs(Number(left[1]?.z_score_delta || 0)))
    .slice(0, 3)
    .map(([key, item]) => ({
      key,
      label: formatFactorName(key),
      zScoreDelta: Number(item?.z_score_delta || 0),
      signalChanged: Boolean(item?.signal_changed),
    }));
};
