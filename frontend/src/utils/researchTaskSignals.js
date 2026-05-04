import {
  extractTaskPayload,
  extractTaskResearchInput,
  extractTaskTemplateMeta,
  extractLinkedPricingTask,
} from './researchTaskSignals/taskExtractors';
import { summarizePeopleLayerShift } from './researchTaskSignals/peopleLayer';
import {
  summarizeStructuralDecayShift,
  summarizeStructuralDecayRadarShift,
} from './researchTaskSignals/structuralDecay';
import {
  summarizeMacroShift,
  summarizeResonanceShift,
  summarizePolicySourceShift,
  summarizeDepartmentChaosShift,
  summarizeInputReliabilityShift,
} from './researchTaskSignals/macroShifts';
import {
  summarizeBiasCompressionShift,
  summarizeSelectionQualityShift,
  summarizeSelectionQualityRunState,
} from './researchTaskSignals/biasQuality';
import { summarizeTradeThesisShift } from './researchTaskSignals/tradeThesis';
import {
  summarizeReviewContextShift,
  summarizeAltShifts,
  summarizeFactorShifts,
} from './researchTaskSignals/snapshotShifts';
import {
  buildSummaryLines,
  determinePriorityReason,
  getPriorityWeight,
} from './researchTaskSignals/priorityReasoning';


export const buildResearchTaskRefreshSignals = ({
  researchTasks = [],
  overview = {},
  snapshot = {},
} = {}) => {
  const activeTasks = (researchTasks || []).filter(
    (task) => ['cross_market', 'pricing', 'macro_mispricing', 'trade_thesis'].includes(task?.type) && task?.status !== 'archived'
  );

  const suggestions = activeTasks.map((task) => {
    if (task?.type === 'macro_mispricing') {
      const peopleLayerShift = summarizePeopleLayerShift(task, overview);
      const structuralDecayShift = summarizeStructuralDecayShift(task, researchTasks);
      const peopleLayerDriven =
        peopleLayerShift.enteredFragile
        || peopleLayerShift.riskWorsening
        || peopleLayerShift.stanceWorsening
        || Math.abs(Number(peopleLayerShift.fragilityGap || 0)) >= 0.12;
      const structuralDecayDriven =
        structuralDecayShift.enteredCritical
        || structuralDecayShift.actionWorsening
        || structuralDecayShift.failureChanged
        || Math.abs(Number(structuralDecayShift.scoreGap || 0)) >= 0.12;

      const urgencyScore = structuralDecayShift.enteredCritical
        ? 4.5
        : structuralDecayDriven
          ? 3
          : peopleLayerDriven
            ? 2
            : Math.abs(Number(structuralDecayShift.scoreGap || 0)) >= 0.08
              ? 1
              : 0;
      const severity = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high'
        ? '建议更新'
        : severity === 'medium'
          ? '建议复核'
          : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift,
        structuralDecayShift,
        structuralDecayRadarShift: null,
        tradeThesisShift: null,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift: null,
        inputReliabilityShift: null,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const summary = summaryLines.length
        ? summaryLines.join('；')
        : '结构性衰败与人的维度较保存时暂无明显变化，可继续观察。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false,
        structuralDecayDriven,
        structuralDecayRadarDriven: false,
        tradeThesisDriven: false,
        selectionQualityDriven: false,
        selectionQualityRunState: null,
        reviewContextDriven: false,
        peopleLayerDriven,
        biasCompressionDriven: false,
        biasCompressionShift: null,
        policySourceDriven: false,
        departmentChaosDriven: false,
        inputReliabilityDriven: false,
        macroShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const priorityWeight = getPriorityWeight(priorityReason);

      return {
        taskId: task.id,
        taskType: task.type,
        templateId: '',
        title: task.title || task.symbol || '',
        refreshLabel,
        refreshTone,
        severity,
        urgencyScore,
        summary,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift: null,
        inputReliabilityShift: null,
        peopleLayerShift,
        structuralDecayShift,
        structuralDecayRadarShift: null,
        tradeThesisShift: null,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        resonanceDriven: false,
        policySourceDriven: false,
        departmentChaosDriven: false,
        inputReliabilityDriven: false,
        peopleLayerDriven,
        structuralDecayDriven,
        structuralDecayRadarDriven: false,
        biasCompressionDriven: false,
        selectionQualityDriven: false,
        reviewContextDriven: false,
        priorityReason,
        priorityWeight,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
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
      const departmentChaosShift = summarizeDepartmentChaosShift(researchInput?.macro || {}, overview);
      const peopleLayerDriven =
        peopleLayerShift.enteredFragile
        || peopleLayerShift.riskWorsening
        || peopleLayerShift.stanceWorsening
        || Math.abs(Number(peopleLayerShift.fragilityGap || 0)) >= 0.12;
      const structuralDecayDriven =
        structuralDecayShift.enteredCritical
        || structuralDecayShift.actionWorsening
        || structuralDecayShift.failureChanged
        || Math.abs(Number(structuralDecayShift.scoreGap || 0)) >= 0.12;
      const tradeThesisDriven =
        tradeThesisShift.stanceChanged
        || tradeThesisShift.leadLegChanged
        || tradeThesisShift.summaryChanged
        || tradeThesisShift.horizonChanged;
      const departmentChaosDriven =
        departmentChaosShift.worsening
        || departmentChaosShift.labelChanged
        || departmentChaosShift.newChaoticDepartments.length > 0
        || Math.abs(Number(departmentChaosShift.scoreGap || 0)) >= 0.14;

      const urgencyScore = structuralDecayShift.enteredCritical
        ? 4.5
        : structuralDecayDriven && tradeThesisDriven
          ? 4
          : structuralDecayDriven
            ? 3
            : tradeThesisDriven
              ? 2.5
              : departmentChaosDriven
                ? 2.2
              : peopleLayerDriven
                ? 2
                : Math.abs(Number(structuralDecayShift.scoreGap || 0)) >= 0.08
                  ? 1
                  : 0;
      const severity = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high'
        ? '建议更新'
        : severity === 'medium'
          ? '建议复核'
          : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift,
        structuralDecayShift,
        structuralDecayRadarShift: null,
        tradeThesisShift,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift,
        inputReliabilityShift: null,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const summary = summaryLines.length
        ? summaryLines.join('；')
        : '交易 Thesis 相对保存时没有明显漂移，可继续观察组合执行条件。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false,
        structuralDecayDriven,
        structuralDecayRadarDriven: false,
        tradeThesisDriven,
        selectionQualityDriven: false,
        selectionQualityRunState: null,
        reviewContextDriven: false,
        peopleLayerDriven,
        biasCompressionDriven: false,
        biasCompressionShift: null,
        policySourceDriven: false,
        departmentChaosDriven,
        inputReliabilityDriven: false,
        macroShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const priorityWeight = getPriorityWeight(priorityReason);

      return {
        taskId: task.id,
        taskType: task.type,
        templateId: task.template || '',
        title: task.title || task.symbol || '',
        refreshLabel,
        refreshTone,
        severity,
        urgencyScore,
        summary,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift,
        inputReliabilityShift: null,
        peopleLayerShift,
        structuralDecayShift,
        structuralDecayRadarShift: null,
        tradeThesisShift,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        resonanceDriven: false,
        policySourceDriven: false,
        departmentChaosDriven,
        inputReliabilityDriven: false,
        peopleLayerDriven,
        structuralDecayDriven,
        structuralDecayRadarDriven: false,
        tradeThesisDriven,
        biasCompressionDriven: false,
        selectionQualityDriven: false,
        reviewContextDriven: false,
        priorityReason,
        priorityWeight,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
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
        peopleLayerShift.enteredFragile
        || peopleLayerShift.riskWorsening
        || peopleLayerShift.stanceWorsening
        || Math.abs(Number(peopleLayerShift.fragilityGap || 0)) >= 0.12;
      const urgencyScore = peopleLayerShift.enteredFragile
        ? 4
        : peopleLayerDriven
          ? 2.5
          : Math.abs(Number(peopleLayerShift.fragilityGap || 0)) >= 0.08
            ? 1
            : 0;
      const severity = urgencyScore >= 4 ? 'high' : urgencyScore >= 2 ? 'medium' : 'low';
      const refreshLabel = severity === 'high'
        ? '建议更新'
        : severity === 'medium'
          ? '建议复核'
          : '继续观察';
      const refreshTone = severity === 'high' ? 'red' : severity === 'medium' ? 'orange' : 'blue';
      const summaryLines = buildSummaryLines({
        peopleLayerShift,
        structuralDecayShift: null,
        structuralDecayRadarShift: null,
        tradeThesisShift: null,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift: null,
        inputReliabilityShift: null,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const summary = summaryLines.length
        ? summaryLines.join('；')
        : '人的维度较保存时没有明显变化，当前可继续观察。';
      const priorityReason = determinePriorityReason({
        resonanceDriven: false,
        structuralDecayDriven: false,
        structuralDecayRadarDriven: false,
        tradeThesisDriven: false,
        selectionQualityDriven: false,
        selectionQualityRunState: null,
        reviewContextDriven: false,
        peopleLayerDriven,
        biasCompressionDriven: false,
        biasCompressionShift: null,
        policySourceDriven: false,
        departmentChaosDriven: false,
        inputReliabilityDriven: false,
        macroShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
      });
      const priorityWeight = getPriorityWeight(priorityReason);

      return {
        taskId: task.id,
        taskType: task.type,
        templateId: '',
        title: task.title || task.symbol || '',
        refreshLabel,
        refreshTone,
        severity,
        urgencyScore,
        summary,
        macroShift: null,
        resonanceShift: null,
        policySourceShift: null,
        departmentChaosShift: null,
        inputReliabilityShift: null,
        peopleLayerShift,
        structuralDecayShift: null,
        structuralDecayRadarShift: null,
        tradeThesisShift: null,
        biasCompressionShift: null,
        selectionQualityShift: null,
        selectionQualityRunState: null,
        reviewContextShift: null,
        resonanceDriven: false,
        policySourceDriven: false,
        departmentChaosDriven: false,
        inputReliabilityDriven: false,
        peopleLayerDriven,
        structuralDecayRadarDriven: false,
        biasCompressionDriven: false,
        selectionQualityDriven: false,
        reviewContextDriven: false,
        priorityReason,
        priorityWeight,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
        recommendation:
          severity === 'high'
            ? peopleLayerShift.actionHint || '建议优先重开定价研究，确认人的维度恶化是否已经改变长期判断。'
            : severity === 'medium'
              ? peopleLayerShift.actionHint || '建议复核组织结构与内部人信号，再决定是否沿用当前定价结论。'
              : '当前人的维度变化有限，可继续观察并等待更多证据。',
      };
    }

    const researchInput = extractTaskResearchInput(task);
    const templateMeta = extractTaskTemplateMeta(task);
    const hasSavedInput =
      Object.keys(researchInput?.macro || {}).length > 0
      || (researchInput?.alt_data?.top_categories || []).length > 0;

    if (!hasSavedInput) {
      return {
        taskId: task.id,
        templateId: task.template || templateMeta.template_id || '',
        title: task.title || templateMeta.template_name || '',
        refreshLabel: '继续观察',
        refreshTone: 'blue',
        severity: 'low',
        urgencyScore: 0,
        summary: '当前任务还没有保存足够的输入快照，建议先运行一次研究并记录结果。',
        macroShift: null,
        policySourceShift: null,
        departmentChaosShift: null,
        altShift: { changedCategories: [], emergentCategories: [] },
        factorShift: [],
        policySourceDriven: false,
        departmentChaosDriven: false,
        resonanceDriven: false,
        structuralDecayRadarShift: null,
        structuralDecayRadarDriven: false,
        recommendation: '先生成首个研究快照，再判断是否需要更新任务',
      };
    }

    const macroShift = summarizeMacroShift(researchInput?.macro || {}, overview);
    const resonanceShift = summarizeResonanceShift(researchInput?.macro || {}, overview);
    const policySourceShift = summarizePolicySourceShift(researchInput?.macro || {}, overview);
    const departmentChaosShift = summarizeDepartmentChaosShift(researchInput?.macro || {}, overview);
    const inputReliabilityShift = summarizeInputReliabilityShift(researchInput?.macro || {}, overview);
    const structuralDecayRadarShift = summarizeStructuralDecayRadarShift(researchInput?.macro || {}, overview);
    const allocationOverlay = extractTaskPayload(task)?.allocation_overlay || {};
    const biasCompressionShift = summarizeBiasCompressionShift(templateMeta, overview, allocationOverlay);
    const selectionQualityShift = summarizeSelectionQualityShift(templateMeta, biasCompressionShift);
    const selectionQualityRunState = summarizeSelectionQualityRunState(templateMeta, allocationOverlay);
    const reviewContextShift = summarizeReviewContextShift(task);
    const altShift = summarizeAltShifts(researchInput?.alt_data || {}, snapshot);
    const factorShift = summarizeFactorShifts(overview, templateMeta);

    let urgencyScore = 0;
    if (macroShift.signalShift) urgencyScore += 2;
    if (Math.abs(macroShift.scoreGap) >= 0.18) urgencyScore += 2;
    else if (Math.abs(macroShift.scoreGap) >= 0.1) urgencyScore += 1;
    if (resonanceShift.labelChanged) urgencyScore += 2;
    else if (resonanceShift.addedFactors.length || resonanceShift.removedFactors.length) urgencyScore += 1;
    if (policySourceShift.worsening) urgencyScore += 2;
    else if (policySourceShift.labelChanged || policySourceShift.addedFragileSources.length) urgencyScore += 1;
    if (
      departmentChaosShift.currentLabel === 'chaotic'
      || departmentChaosShift.newChaoticDepartments.length
    ) urgencyScore += 4;
    else if (departmentChaosShift.worsening) urgencyScore += 2;
    else if (
      departmentChaosShift.labelChanged
      || Math.abs(departmentChaosShift.scoreGap) >= 0.14
    ) urgencyScore += 1;
    if (inputReliabilityShift.worsening) urgencyScore += 2;
    else if (inputReliabilityShift.labelChanged || Math.abs(inputReliabilityShift.scoreGap) >= 0.12) urgencyScore += 1;
    if (structuralDecayRadarShift.enteredAlert) urgencyScore += 3;
    else if (structuralDecayRadarShift.worsening) urgencyScore += 2;
    else if (
      structuralDecayRadarShift.labelChanged
      || Math.abs(Number(structuralDecayRadarShift.scoreGap || 0)) >= 0.12
      || structuralDecayRadarShift.criticalAxisGap >= 1
    ) urgencyScore += 1;
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
    let severity = 'low';
    if (urgencyScore >= 4) {
      refreshLabel = '建议更新';
      refreshTone = 'red';
      severity = 'high';
    } else if (urgencyScore >= 2) {
      refreshLabel = '建议复核';
      refreshTone = 'orange';
      severity = 'medium';
    }

    const summaryLines = buildSummaryLines({
      macroShift,
      resonanceShift,
      policySourceShift,
      departmentChaosShift,
      inputReliabilityShift,
      peopleLayerShift: null,
      structuralDecayShift: null,
      structuralDecayRadarShift,
      tradeThesisShift: null,
      biasCompressionShift,
      selectionQualityShift,
      selectionQualityRunState,
      reviewContextShift,
      altShift,
      factorShift,
    });
    const summary = summaryLines.length
      ? summaryLines.join('；')
      : '保存时的宏观与另类数据输入仍然基本稳定，可继续沿当前研究方向推进。';
    const resonanceDriven =
      resonanceShift.labelChanged
      || resonanceShift.addedFactors.length > 0
      || resonanceShift.removedFactors.length > 0;
    const policySourceDriven =
      policySourceShift.worsening
      || policySourceShift.labelChanged
      || policySourceShift.addedFragileSources.length > 0;
    const departmentChaosDriven =
      departmentChaosShift.worsening
      || departmentChaosShift.labelChanged
      || departmentChaosShift.newChaoticDepartments.length > 0
      || Math.abs(Number(departmentChaosShift.scoreGap || 0)) >= 0.14;
    const inputReliabilityDriven =
      inputReliabilityShift.worsening
      || inputReliabilityShift.labelChanged
      || Math.abs(inputReliabilityShift.scoreGap) >= 0.12;
    const structuralDecayRadarDriven =
      structuralDecayRadarShift.enteredAlert
      || structuralDecayRadarShift.worsening
      || structuralDecayRadarShift.labelChanged
      || Math.abs(Number(structuralDecayRadarShift.scoreGap || 0)) >= 0.12
      || structuralDecayRadarShift.criticalAxisGap >= 1;
    const biasCompressionDriven =
      biasCompressionShift.compressed
      || biasCompressionShift.labelChanged;
    const selectionQualityDriven =
      selectionQualityShift.worsening
      || selectionQualityShift.labelChanged
      || selectionQualityShift.penaltyGap >= 0.1;
    const reviewContextDriven = reviewContextShift.changed;
    const priorityReason = determinePriorityReason({
      resonanceDriven,
      structuralDecayDriven: false,
      structuralDecayRadarDriven,
      tradeThesisDriven: false,
      selectionQualityDriven,
      selectionQualityRunState,
      reviewContextDriven,
      peopleLayerDriven: false,
      biasCompressionDriven,
      biasCompressionShift,
      policySourceDriven,
      departmentChaosDriven,
      inputReliabilityDriven,
      macroShift,
      altShift,
      factorShift,
    });
    const priorityWeight = getPriorityWeight(priorityReason);

    return {
      taskId: task.id,
      taskType: task.type,
      templateId: task.template || templateMeta.template_id || '',
      title: task.title || templateMeta.template_name || '',
      refreshLabel,
      refreshTone,
      severity,
      urgencyScore,
      summary,
      macroShift,
      resonanceShift,
      policySourceShift,
      departmentChaosShift,
      inputReliabilityShift,
      peopleLayerShift: null,
      structuralDecayShift: null,
      structuralDecayRadarShift,
      tradeThesisShift: null,
      biasCompressionShift,
      selectionQualityShift,
      selectionQualityRunState,
      reviewContextShift,
      resonanceDriven,
      policySourceDriven,
      departmentChaosDriven,
      inputReliabilityDriven,
      structuralDecayRadarDriven,
      biasCompressionDriven,
      selectionQualityDriven,
      reviewContextDriven,
      priorityReason,
      priorityWeight,
      altShift,
      factorShift,
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
      suggestions
        .filter((item) => item.templateId)
        .map((item) => [item.templateId, item])
    ),
    prioritized: [...suggestions].sort((left, right) => {
      if (right.urgencyScore !== left.urgencyScore) {
        return right.urgencyScore - left.urgencyScore;
      }
      return (right.priorityWeight || 0) - (left.priorityWeight || 0);
    }),
  };
};
