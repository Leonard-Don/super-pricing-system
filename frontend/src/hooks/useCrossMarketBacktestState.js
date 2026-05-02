import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_CROSS_MARKET_END_DATE,
  DEFAULT_CROSS_MARKET_START_DATE,
  DEFAULT_PARAMETERS,
  DEFAULT_QUALITY,
  createAsset,
  normalizeAssets,
} from '../components/cross-market/panelConstants';
import {
  buildDisplayTier,
  buildDisplayTone,
  buildTemplateContextPayload,
  extractRecentComparisonLead,
  getSelectionQualityExplanationLines,
} from '../components/cross-market/panelHelpers';
import {
  buildCrossMarketPlaybook,
  buildCrossMarketWorkbenchPayload,
  buildTradeThesisWorkbenchPayload,
} from '../components/research-playbook/playbookViewModels';
import {
  addResearchTaskSnapshot,
  createResearchTask,
  getAltDataSnapshot,
  getCrossMarketTemplates,
  getMacroOverview,
  getResearchTasks,
  runCrossMarketBacktest,
} from '../services/api';
import { useSafeMessageApi } from '../utils/messageApi';
import { buildCrossMarketCards } from '../utils/crossMarketRecommendations';
import { loadMacroMispricingDraft } from '../utils/macroMispricingDraft';
import { buildResearchTaskRefreshSignals } from '../utils/researchTaskSignals';
import { navigateByResearchAction, readResearchContext } from '../utils/researchContext';

export default function useCrossMarketBacktestState() {
  const message = useSafeMessageApi();
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [running, setRunning] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [assets, setAssets] = useState([
    createAsset('long', 0),
    createAsset('short', 0),
  ]);
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [constraints, setConstraints] = useState(DEFAULT_CONSTRAINTS);
  const [meta, setMeta] = useState({
    initial_capital: 100000,
    commission: 0.1,
    slippage: 0.1,
    start_date: DEFAULT_CROSS_MARKET_START_DATE,
    end_date: DEFAULT_CROSS_MARKET_END_DATE,
  });
  const [results, setResults] = useState(null);
  const [researchContext, setResearchContext] = useState(readResearchContext());
  const [queueResumeHint, setQueueResumeHint] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [savedTaskId, setSavedTaskId] = useState('');
  const [savedTaskType, setSavedTaskType] = useState('');
  const [appliedBiasMeta, setAppliedBiasMeta] = useState(null);
  const [macroOverview, setMacroOverview] = useState(null);
  const [altSnapshot, setAltSnapshot] = useState(null);
  const [researchTasks, setResearchTasks] = useState([]);
  const [draftTemplateContext, setDraftTemplateContext] = useState(null);
  const [macroMispricingDraft, setMacroMispricingDraft] = useState(null);
  const appliedTemplateRef = useRef('');
  const autoRecommendedRef = useRef('');
  const appliedDraftRef = useRef('');

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const [templateResponse, macroResponse, snapshotResponse, researchTaskResponse] = await Promise.all([
          getCrossMarketTemplates(),
          getMacroOverview(),
          getAltDataSnapshot(),
          getResearchTasks({ limit: 40, type: 'cross_market' }),
        ]);
        setTemplates(templateResponse.templates || []);
        setMacroOverview(macroResponse);
        setAltSnapshot(snapshotResponse);
        setResearchTasks(researchTaskResponse?.data || []);
      } catch (error) {
        message.error(error.userMessage || error.message || '加载模板失败');
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, [message]);

  useEffect(() => {
    const syncContext = () => setResearchContext(readResearchContext());
    syncContext();
    window.addEventListener('popstate', syncContext);
    return () => window.removeEventListener('popstate', syncContext);
  }, []);

  useEffect(() => {
    if (
      researchContext?.source === 'research_workbench'
      && researchContext?.task
      && savedTaskId !== researchContext.task
    ) {
      setSavedTaskId(researchContext.task);
      setSavedTaskType((current) => current || 'cross_market');
    }
  }, [researchContext?.source, researchContext?.task, savedTaskId]);

  useEffect(() => {
    setQueueResumeHint('');
  }, [researchContext?.task, researchContext?.template]);

  const longAssets = useMemo(() => normalizeAssets(assets, 'long'), [assets]);
  const shortAssets = useMemo(() => normalizeAssets(assets, 'short'), [assets]);
  const recommendedTemplates = useMemo(
    () =>
      buildCrossMarketCards(
        { templates },
        macroOverview || {},
        altSnapshot || {},
        (templateId, note) => ({
          label: '载入推荐模板',
          target: 'cross-market',
          template: templateId,
          source: 'cross_market_panel',
          note,
        })
      ),
    [altSnapshot, macroOverview, templates]
  );
  const refreshByTemplate = useMemo(
    () => (buildResearchTaskRefreshSignals({ researchTasks, overview: macroOverview, snapshot: altSnapshot }) || {}).byTemplateId || {},
    [altSnapshot, macroOverview, researchTasks]
  );
  const taskByTemplate = useMemo(
    () =>
      Object.fromEntries(
        (researchTasks || [])
          .filter((task) => task?.type === 'cross_market' && task?.status !== 'archived')
          .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')))
          .map((task) => {
            const templateId =
              task?.template
              || task?.snapshot?.payload?.template_meta?.template_id
              || task?.snapshot_history?.[0]?.payload?.template_meta?.template_id
              || '';
            return [templateId, task];
          })
          .filter(([templateId]) => Boolean(templateId))
      ),
    [researchTasks]
  );
  const displayRecommendedTemplates = useMemo(
    () =>
      recommendedTemplates
        .map((template) => {
          const refreshMeta = refreshByTemplate[template.id] || null;
          const recentComparisonLead = extractRecentComparisonLead(taskByTemplate[template.id]);
          const rankingPenalty = refreshMeta?.biasCompressionShift?.coreLegAffected
            ? 0.45
            : refreshMeta?.selectionQualityRunState?.active
              ? 0.3
            : refreshMeta?.reviewContextDriven
              ? 0.24
            : refreshMeta?.inputReliabilityDriven
              ? 0.16
            : refreshMeta?.selectionQualityDriven
              ? 0.2
              : 0;
          const recommendationScore = Number(Math.max(0, Number(template.recommendationScore || 0) - rankingPenalty).toFixed(2));
          return {
            ...template,
            baseRecommendationScore: template.baseRecommendationScore ?? template.recommendationScore,
            baseRecommendationTier: template.baseRecommendationTier || template.recommendationTier,
            rankingPenalty,
            rankingPenaltyReason: rankingPenalty
              ? refreshMeta?.biasCompressionShift?.coreLegAffected
                ? `核心腿 ${refreshMeta?.biasCompressionShift?.topCompressedAsset || ''} 已进入压缩焦点，默认模板选择自动降级`
                : refreshMeta?.selectionQualityRunState?.active
                  ? `当前结果已按 ${refreshMeta?.selectionQualityRunState?.label || 'degraded'} 强度运行，默认模板选择进一步下调`
                : refreshMeta?.reviewContextDriven
                  ? `复核语境切换：${refreshMeta?.reviewContextShift?.lead || '最近两版已发生复核语境切换，默认模板选择谨慎下调'}`
                : refreshMeta?.inputReliabilityDriven
                  ? `输入可靠度变化：${refreshMeta?.inputReliabilityShift?.currentLead || '整体输入可靠度下降，默认模板选择适度下调'}`
                : '当前主题已进入自动降级处理，默认模板选择谨慎下调'
              : '',
            recommendationScore,
            recommendationTier: buildDisplayTier(recommendationScore),
            recommendationTone: buildDisplayTone(recommendationScore),
            refreshMeta,
            recentComparisonLead,
          };
        })
        .sort((left, right) => Number(right.recommendationScore || 0) - Number(left.recommendationScore || 0)),
    [recommendedTemplates, refreshByTemplate, taskByTemplate]
  );
  const selectedTemplate = useMemo(
    () =>
      displayRecommendedTemplates.find((item) => item.id === selectedTemplateId)
      || displayRecommendedTemplates.find((item) => item.id === researchContext.template)
      || templates.find((item) => item.id === selectedTemplateId)
      || templates.find((item) => item.id === researchContext.template)
      || null,
    [displayRecommendedTemplates, templates, selectedTemplateId, researchContext.template]
  );
  const effectiveTemplate = useMemo(() => {
    if (!selectedTemplate) {
      return null;
    }
    if (!appliedBiasMeta) {
      return {
        ...selectedTemplate,
        biasSummary: '',
        rawBiasStrength: 0,
        biasStrength: 0,
        biasScale: 1,
        biasQualityLabel: 'full',
        biasQualityReason: '',
        rawBiasHighlights: [],
        biasHighlights: [],
      };
    }
    return {
      ...selectedTemplate,
      biasSummary: appliedBiasMeta.summary || selectedTemplate.biasSummary || '',
      rawBiasStrength: appliedBiasMeta.rawStrength || selectedTemplate.rawBiasStrength || 0,
      biasStrength: appliedBiasMeta.strength || selectedTemplate.biasStrength || 0,
      biasScale: appliedBiasMeta.scale || selectedTemplate.biasScale || 1,
      biasQualityLabel: appliedBiasMeta.qualityLabel || selectedTemplate.biasQualityLabel || 'full',
      biasQualityReason: appliedBiasMeta.qualityReason || selectedTemplate.biasQualityReason || '',
      rawBiasHighlights: appliedBiasMeta.rawHighlights || selectedTemplate.rawBiasHighlights || [],
      biasHighlights: appliedBiasMeta.highlights || selectedTemplate.biasHighlights || [],
    };
  }, [appliedBiasMeta, selectedTemplate]);
  const selectedTemplateSelectionQualityLines = useMemo(
    () => getSelectionQualityExplanationLines(selectedTemplate?.refreshMeta),
    [selectedTemplate]
  );
  const playbook = useMemo(
    () =>
      buildCrossMarketPlaybook(
        {
          ...researchContext,
          template: researchContext.template || selectedTemplateId,
        },
        effectiveTemplate,
        results
      ),
    [effectiveTemplate, researchContext, results, selectedTemplateId]
  );
  const templateForPayload = useMemo(
    () => effectiveTemplate || (
      draftTemplateContext
        ? {
            id: draftTemplateContext.template_id || 'macro_mispricing_relative_value',
            name: draftTemplateContext.template_name || 'Macro Mispricing Relative Value',
            theme: draftTemplateContext.theme || '',
            construction_mode: draftTemplateContext.construction_mode || quality.construction_mode,
            driverHeadline: draftTemplateContext.recommendation_reason || '',
            coreLegs: draftTemplateContext.core_legs || [],
            supportLegs: draftTemplateContext.support_legs || [],
            themeCore: draftTemplateContext.theme_core || '',
            themeSupport: draftTemplateContext.theme_support || '',
            signalAttribution: draftTemplateContext.signal_attribution || [],
          }
        : null
    ),
    [draftTemplateContext, effectiveTemplate, quality.construction_mode]
  );
  const topRecommendationSelectionQualityLines = useMemo(
    () => getSelectionQualityExplanationLines(displayRecommendedTemplates[0]?.refreshMeta),
    [displayRecommendedTemplates]
  );
  const topRecommendation = displayRecommendedTemplates[0] || null;
  const topRecommendationNeedsPriorityReview = Boolean(
    topRecommendation?.refreshMeta?.selectionQualityRunState?.active
    || topRecommendation?.refreshMeta?.reviewContextDriven
    || topRecommendation?.refreshMeta?.inputReliabilityDriven
  );
  const selectedTemplateNeedsPriorityReview = Boolean(
    selectedTemplate?.refreshMeta?.selectionQualityRunState?.active
    || selectedTemplate?.refreshMeta?.reviewContextDriven
    || selectedTemplate?.refreshMeta?.inputReliabilityDriven
  );

  const updateAsset = (key, field, value) => {
    setAssets((prev) =>
      prev.map((asset) => (asset.key === key ? { ...asset, [field]: value } : asset))
    );
  };

  const removeAsset = (key) => {
    setAssets((prev) => prev.filter((asset) => asset.key !== key));
  };

  const addAsset = (side) => {
    setAssets((prev) => [...prev, createAsset(side, prev.length)]);
  };

  const applyTemplate = useCallback((templateOrId, options = {}) => {
    const { useBias = false, silent = false } = options;
    const template = typeof templateOrId === 'string'
      ? (displayRecommendedTemplates.find((item) => item.id === templateOrId) || templates.find((item) => item.id === templateOrId))
      : templateOrId;
    if (!template) {
      return;
    }
    setSelectedTemplateId(template.id);
    setAssets(
      (useBias && template.adjustedAssets ? template.adjustedAssets : template.assets).map((asset, index) => ({
        key: `${asset.side}-${index}-${template.id}`,
        ...asset,
      }))
    );
    setAppliedBiasMeta(
      useBias
        ? {
            mode: 'macro_bias',
            summary: template.biasSummary || '',
            rawStrength: template.rawBiasStrength || 0,
            strength: template.biasStrength || 0,
            scale: template.biasScale || 1,
            qualityLabel: template.biasQualityLabel || 'full',
            qualityReason: template.biasQualityReason || '',
            rawHighlights: template.rawBiasHighlights || [],
            highlights: template.biasHighlights || [],
            departmentChaosLabel: template.departmentChaosLabel || 'unknown',
            departmentChaosScore: template.departmentChaosScore || 0,
            departmentChaosTopDepartment: template.departmentChaosTopDepartment || '',
            departmentChaosReason: template.departmentChaosReason || '',
            departmentChaosRiskBudgetScale: template.departmentChaosRiskBudgetScale ?? 1,
            policyExecutionLabel: template.policyExecutionLabel || 'unknown',
            policyExecutionScore: template.policyExecutionScore || 0,
            policyExecutionTopDepartment: template.policyExecutionTopDepartment || '',
            policyExecutionReason: template.policyExecutionReason || '',
            policyExecutionRiskBudgetScale: template.policyExecutionRiskBudgetScale ?? 1,
            peopleFragilityLabel: template.peopleFragilityLabel || 'stable',
            peopleFragilityScore: template.peopleFragilityScore || 0,
            peopleFragilityFocus: template.peopleFragilityFocus || '',
            peopleFragilityReason: template.peopleFragilityReason || '',
            peopleFragilityRiskBudgetScale: template.peopleFragilityRiskBudgetScale ?? 1,
            sourceModeLabel: template.sourceModeLabel || 'mixed',
            sourceModeDominant: template.sourceModeDominant || '',
            sourceModeReason: template.sourceModeReason || '',
            sourceModeRiskBudgetScale: template.sourceModeRiskBudgetScale ?? 1,
            structuralDecayRadarLabel: template.structuralDecayRadarLabel || 'stable',
            structuralDecayRadarDisplayLabel: template.structuralDecayRadarDisplayLabel || '',
            structuralDecayRadarScore: template.structuralDecayRadarScore || 0,
            structuralDecayRadarActionHint: template.structuralDecayRadarActionHint || '',
            structuralDecayRadarRiskBudgetScale: template.structuralDecayRadarRiskBudgetScale ?? 1,
          }
        : null
    );
    setMacroMispricingDraft(null);
    setDraftTemplateContext(null);
    setParameters({
      lookback: template.parameters?.lookback ?? DEFAULT_PARAMETERS.lookback,
      entry_threshold: template.parameters?.entry_threshold ?? DEFAULT_PARAMETERS.entry_threshold,
      exit_threshold: template.parameters?.exit_threshold ?? DEFAULT_PARAMETERS.exit_threshold,
    });
    setQuality((prev) => ({
      ...prev,
      construction_mode: template.construction_mode || DEFAULT_QUALITY.construction_mode,
    }));
    if (!silent) {
      message.success(`已载入模板: ${template.name}${useBias ? '（含宏观权重偏置）' : ''}`);
    }
  }, [displayRecommendedTemplates, message, templates]);

  useEffect(() => {
    if (!templates.length || !researchContext?.template) {
      return;
    }
    if (appliedTemplateRef.current === researchContext.template) {
      return;
    }
    const template = templates.find((item) => item.id === researchContext.template);
    if (!template) {
      return;
    }
    appliedTemplateRef.current = researchContext.template;
    applyTemplate(researchContext.template, { useBias: false });
  }, [applyTemplate, researchContext, templates]);

  useEffect(() => {
    const draftId = researchContext?.draft || '';
    if (!draftId) {
      setMacroMispricingDraft(null);
      return;
    }
    if (appliedDraftRef.current === draftId) {
      return;
    }

    const draft = loadMacroMispricingDraft(draftId);
    if (!draft?.assets?.length) {
      return;
    }

    appliedDraftRef.current = draftId;
    setSelectedTemplateId(draft.templateId || '');
    setAppliedBiasMeta(null);
    setMacroMispricingDraft(draft);
    setDraftTemplateContext(draft.templateContext || null);
    setAssets(
      draft.assets.map((asset, index) => ({
        key: `${asset.side}-${index}-${draft.id}`,
        side: asset.side,
        symbol: asset.symbol,
        asset_class: asset.asset_class || 'ETF',
        weight: asset.weight ?? null,
      }))
    );
    setParameters((prev) => ({
      ...prev,
      ...(draft.parameters || {}),
    }));
    setQuality((prev) => ({
      ...prev,
      ...(draft.quality || {}),
    }));
    setConstraints((prev) => ({
      ...prev,
      ...(draft.constraints || {}),
    }));
    setMeta((prev) => ({
      ...prev,
      ...(draft.meta || {}),
    }));
    message.info(`已载入宏观错误定价草案: ${draft.title || draft.symbol || '组合草案'}`);
  }, [message, researchContext]);

  useEffect(() => {
    if (researchContext?.template || selectedTemplateId || !displayRecommendedTemplates.length) {
      return;
    }
    const topRecommendation = displayRecommendedTemplates[0];
    if (!topRecommendation || autoRecommendedRef.current === topRecommendation.id) {
      return;
    }
    autoRecommendedRef.current = topRecommendation.id;
    applyTemplate(topRecommendation, { useBias: true, silent: true });
    message.info(`已自动载入当前最优宏观模板: ${topRecommendation.name}`);
  }, [applyTemplate, displayRecommendedTemplates, message, researchContext, selectedTemplateId]);

  const canReturnToWorkbenchQueue = Boolean(
    researchContext?.source === 'research_workbench'
    && researchContext?.task
    && researchContext?.workbenchQueueMode === 'cross_market'
  );

  const handleRun = async () => {
    const payloadAssets = assets
      .map((asset) => ({
        symbol: (asset.symbol || '').trim().toUpperCase(),
        asset_class: asset.asset_class,
        side: asset.side,
        weight: asset.weight || undefined,
      }))
      .filter((asset) => asset.symbol);

    if (payloadAssets.length < 2) {
      message.error('请至少填写两个资产');
      return;
    }

    setRunning(true);
    setResults(null);
    try {
      const response = await runCrossMarketBacktest({
        assets: payloadAssets,
        template_context: selectedTemplate
          ? buildTemplateContextPayload(selectedTemplate, appliedBiasMeta)
          : (draftTemplateContext || undefined),
        allocation_constraints: {
          ...(constraints.max_single_weight ? { max_single_weight: constraints.max_single_weight / 100 } : {}),
          ...(constraints.min_single_weight ? { min_single_weight: constraints.min_single_weight / 100 } : {}),
        },
        strategy: 'spread_zscore',
        construction_mode: quality.construction_mode,
        parameters,
        min_history_days: quality.min_history_days,
        min_overlap_ratio: quality.min_overlap_ratio,
        initial_capital: meta.initial_capital,
        commission: meta.commission / 100,
        slippage: meta.slippage / 100,
        start_date: meta.start_date || undefined,
        end_date: meta.end_date || undefined,
      });
      if (response.success) {
        setResults(response.data);
        message.success('跨市场回测完成');
      } else {
        message.error(response.error || '跨市场回测失败');
      }
    } catch (error) {
      message.error(error.userMessage || error.message || '跨市场回测失败');
    } finally {
      setRunning(false);
    }
  };

  const handleSaveTask = async () => {
    const payload = buildCrossMarketWorkbenchPayload(
      researchContext,
      templateForPayload,
      results,
      assets,
      { macroOverview, altSnapshot }
    );
    if (!payload) {
      message.error('请先载入模板或配置篮子后再保存到研究工作台');
      return;
    }

    setSavingTask(true);
    try {
      const response = await createResearchTask(payload);
      setSavedTaskId(response.data?.id || '');
      setSavedTaskType('cross_market');
      if (canReturnToWorkbenchQueue) {
        setQueueResumeHint('saved');
      }
      message.success(`已保存到研究工作台: ${response.data?.title || payload.title}`);
    } catch (error) {
      message.error(error.userMessage || error.message || '保存研究任务失败');
    } finally {
      setSavingTask(false);
    }
  };

  const handleSaveTradeThesis = async () => {
    const payload = buildTradeThesisWorkbenchPayload(
      researchContext,
      macroMispricingDraft,
      templateForPayload,
      results,
      assets,
      { macroOverview, altSnapshot }
    );
    if (!payload) {
      message.error('请先载入宏观错误定价草案后再保存为交易 Thesis');
      return;
    }

    setSavingTask(true);
    try {
      const response = await createResearchTask(payload);
      setSavedTaskId(response.data?.id || '');
      setSavedTaskType('trade_thesis');
      if (canReturnToWorkbenchQueue) {
        setQueueResumeHint('saved');
      }
      message.success(`已保存为交易 Thesis: ${response.data?.title || payload.title}`);
    } catch (error) {
      message.error(error.userMessage || error.message || '保存交易 Thesis 失败');
    } finally {
      setSavingTask(false);
    }
  };

  const handleUpdateSnapshot = async () => {
    if (!savedTaskId) {
      message.info('请先保存任务，再更新当前任务快照');
      return;
    }

    const payload = savedTaskType === 'trade_thesis'
      ? buildTradeThesisWorkbenchPayload(
          researchContext,
          macroMispricingDraft,
          templateForPayload,
          results,
          assets,
          { macroOverview, altSnapshot }
        )
      : buildCrossMarketWorkbenchPayload(
          researchContext,
          templateForPayload,
          results,
          assets,
          { macroOverview, altSnapshot }
        );
    if (!payload?.snapshot) {
      message.error('当前还没有可更新的研究快照');
      return;
    }

    setSavingTask(true);
    try {
      await addResearchTaskSnapshot(savedTaskId, {
        snapshot: payload.snapshot,
        ...(payload.refresh_priority_event
          ? { refresh_priority_event: payload.refresh_priority_event }
          : {}),
      });
      if (canReturnToWorkbenchQueue) {
        setQueueResumeHint('snapshot');
      }
      message.success('当前任务快照已更新');
    } catch (error) {
      message.error(error.userMessage || error.message || '更新任务快照失败');
    } finally {
      setSavingTask(false);
    }
  };

  const handleReturnToWorkbenchNextTask = useCallback(() => {
    if (!canReturnToWorkbenchQueue) return;
    navigateByResearchAction({
      target: 'workbench',
      refresh: researchContext.workbenchRefresh || '',
      type: researchContext.workbenchType || '',
      sourceFilter: researchContext.workbenchSource || '',
      reason: researchContext.workbenchReason || '',
      snapshotView: researchContext.workbenchSnapshotView || '',
      snapshotFingerprint: researchContext.workbenchSnapshotFingerprint || '',
      snapshotSummary: researchContext.workbenchSnapshotSummary || '',
      keyword: researchContext.workbenchKeyword || '',
      queueMode: researchContext.workbenchQueueMode || 'cross_market',
      queueAction: 'next_same_type',
      taskId: researchContext.task || '',
    }, window.location.search);
  }, [canReturnToWorkbenchQueue, researchContext]);

  return {
    // raw state
    templates,
    loadingTemplates,
    running,
    savingTask,
    assets,
    parameters,
    quality,
    constraints,
    meta,
    results,
    researchContext,
    queueResumeHint,
    selectedTemplateId,
    savedTaskId,
    appliedBiasMeta,
    macroOverview,
    altSnapshot,
    draftTemplateContext,
    macroMispricingDraft,

    // setters needed by parent JSX
    setResults,
    setParameters,
    setQuality,
    setConstraints,
    setMeta,

    // derived state
    longAssets,
    shortAssets,
    displayRecommendedTemplates,
    selectedTemplate,
    effectiveTemplate,
    selectedTemplateSelectionQualityLines,
    playbook,
    templateForPayload,
    topRecommendationSelectionQualityLines,
    topRecommendation,
    topRecommendationNeedsPriorityReview,
    selectedTemplateNeedsPriorityReview,
    canReturnToWorkbenchQueue,

    // mutators / handlers
    updateAsset,
    removeAsset,
    addAsset,
    applyTemplate,
    handleRun,
    handleSaveTask,
    handleSaveTradeThesis,
    handleUpdateSnapshot,
    handleReturnToWorkbenchNextTask,
  };
}
