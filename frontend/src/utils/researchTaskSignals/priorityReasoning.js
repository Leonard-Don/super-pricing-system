import { formatFactorName } from './snapshotShifts';

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
}) => {
  const lines = [];

  if (macroShift?.signalShift) {
    lines.push(`宏观信号从 ${macroShift.savedSignal} 切到 ${macroShift.currentSignal}`);
  } else if (Math.abs(Number(macroShift?.scoreGap || 0)) >= 0.1) {
    lines.push(`宏观分数相对保存时 ${macroShift.scoreGap >= 0 ? '上行' : '下行'} ${Math.abs(macroShift.scoreGap).toFixed(2)}`);
  }

  if (resonanceShift?.labelChanged) {
    lines.push(`共振从 ${resonanceShift.savedLabel} 切到 ${resonanceShift.currentLabel}`);
  } else if (resonanceShift?.addedFactors?.[0]) {
    lines.push(`${formatFactorName(resonanceShift.addedFactors[0])} 新进入共振簇`);
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
  } else if (Math.abs(Number(departmentChaosShift?.scoreGap || 0)) >= 0.14) {
    lines.push(
      `部门混乱度 ${Number(departmentChaosShift.scoreGap || 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(departmentChaosShift.scoreGap || 0)).toFixed(2)}`
    );
  }

  if (inputReliabilityShift?.labelChanged) {
    lines.push(`输入可靠度从 ${inputReliabilityShift.savedLabel} 切到 ${inputReliabilityShift.currentLabel}`);
  } else if (Math.abs(Number(inputReliabilityShift?.scoreGap || 0)) >= 0.12) {
    lines.push(
      `输入可靠度 ${Number(inputReliabilityShift.scoreGap || 0) >= 0 ? '抬升' : '走弱'} ${Math.abs(Number(inputReliabilityShift.scoreGap || 0)).toFixed(2)}`
    );
  }

  if (peopleLayerShift?.enteredFragile) {
    lines.push(`人的维度从 ${peopleLayerShift.savedRiskLevel} 切到 ${peopleLayerShift.currentRiskLevel}`);
  } else if (peopleLayerShift?.labelChanged) {
    lines.push(`人的维度 ${peopleLayerShift.savedRiskLevel}/${peopleLayerShift.savedStance} 切到 ${peopleLayerShift.currentRiskLevel}/${peopleLayerShift.currentStance}`);
  } else if (Math.abs(Number(peopleLayerShift?.fragilityGap || 0)) >= 0.12) {
    lines.push(
      `人的脆弱度 ${Number(peopleLayerShift.fragilityGap || 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(peopleLayerShift.fragilityGap || 0)).toFixed(2)}`
    );
  }

  if (structuralDecayShift?.enteredCritical) {
    lines.push(`衰败判断从 ${structuralDecayShift.savedAction} 升级到 ${structuralDecayShift.currentAction}`);
  } else if (structuralDecayShift?.actionWorsening || structuralDecayShift?.labelChanged) {
    lines.push(`衰败信号 ${structuralDecayShift.savedLabel} → ${structuralDecayShift.currentLabel}`);
  } else if (Math.abs(Number(structuralDecayShift?.scoreGap || 0)) >= 0.12) {
    lines.push(
      `衰败评分 ${Number(structuralDecayShift.scoreGap || 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(structuralDecayShift.scoreGap || 0)).toFixed(2)}`
    );
  }
  if (structuralDecayShift?.failureChanged && structuralDecayShift?.currentFailure) {
    lines.push(`主导失效模式切到 ${structuralDecayShift.currentFailure}`);
  }
  if (structuralDecayRadarShift?.enteredAlert) {
    lines.push(`系统级衰败雷达从 ${structuralDecayRadarShift.savedLabel} 升级到 ${structuralDecayRadarShift.currentLabel}`);
  } else if (structuralDecayRadarShift?.worsening || structuralDecayRadarShift?.labelChanged) {
    lines.push(`系统级衰败雷达 ${structuralDecayRadarShift.savedLabel} → ${structuralDecayRadarShift.currentLabel}`);
  } else if (Math.abs(Number(structuralDecayRadarShift?.scoreGap || 0)) >= 0.12) {
    lines.push(
      `系统级衰败雷达 ${Number(structuralDecayRadarShift.scoreGap || 0) >= 0 ? '抬升' : '回落'} ${Math.abs(Number(structuralDecayRadarShift.scoreGap || 0)).toFixed(2)}`
    );
  }
  if (structuralDecayRadarShift?.criticalAxisGap >= 1) {
    lines.push(`系统级衰败关键轴增加 ${structuralDecayRadarShift.criticalAxisGap}`);
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
  } else if (selectionQualityShift?.penaltyGap >= 0.1) {
    lines.push(`排序惩罚 ${selectionQualityShift.savedPenalty.toFixed(2)} 提升到 ${selectionQualityShift.currentPenalty.toFixed(2)}`);
  }
  if (selectionQualityRunState?.active) {
    lines.push(
      `当前结果已按 ${selectionQualityRunState.label} 强度运行`
      + (
        selectionQualityRunState.baseScore || selectionQualityRunState.effectiveScore
          ? ` (${selectionQualityRunState.baseScore.toFixed(2)}→${selectionQualityRunState.effectiveScore.toFixed(2)})`
          : ''
      )
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
}) => {
  if (resonanceDriven) {
    return 'resonance';
  }
  if (biasCompressionShift?.coreLegAffected) {
    return 'bias_quality_core';
  }
  if (selectionQualityRunState?.active) {
    return 'selection_quality_active';
  }
  if (reviewContextDriven) {
    return 'review_context';
  }
  if (structuralDecayRadarDriven) {
    return 'structural_decay';
  }
  if (structuralDecayDriven) {
    return 'structural_decay';
  }
  if (tradeThesisDriven) {
    return 'trade_thesis';
  }
  if (peopleLayerDriven) {
    return 'people_fragility';
  }
  if (selectionQualityDriven) {
    return 'selection_quality';
  }
  if (biasCompressionDriven) {
    return 'bias_quality';
  }
  if (departmentChaosDriven) {
    return 'policy_execution';
  }
  if (policySourceDriven || inputReliabilityDriven) {
    return 'source_health_degradation';
  }
  if (macroShift?.signalShift || Math.abs(Number(macroShift?.scoreGap || 0)) >= 0.18) {
    return 'macro';
  }
  if ((altShift?.changedCategories || []).length || (altShift?.emergentCategories || []).length) {
    return 'alt_data';
  }
  if ((factorShift || []).length) {
    return 'factor_shift';
  }
  return 'observe';
};

export const getPriorityWeight = (reason = '') => {
  switch (reason) {
    case 'resonance':
      return 5;
    case 'bias_quality_core':
      return 4;
    case 'selection_quality_active':
      return 3.75;
    case 'review_context':
      return 3.6;
    case 'structural_decay':
      return 3.4;
    case 'trade_thesis':
      return 3.3;
    case 'people_fragility':
    case 'people_layer':
      return 3.2;
    case 'selection_quality':
      return 3.5;
    case 'bias_quality':
      return 3;
    case 'policy_execution':
      return 2.4;
    case 'source_health_degradation':
      return 2.1;
    case 'policy_source':
      return 2;
    case 'department_chaos':
      return 2.4;
    case 'input_reliability':
      return 1.8;
    case 'macro':
      return 1;
    case 'alt_data':
      return 1;
    case 'factor_shift':
      return 1;
    default:
      return 0;
  }
};
