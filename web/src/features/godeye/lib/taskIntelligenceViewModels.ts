// ---------------------------------------------------------------------------
// taskIntelligenceViewModels — ported from frontend/src/components/GodEyeDashboard/taskIntelligenceViewModels.js
// Pure logic, no React / antd. Names/signatures/behavior identical to old JS.
// ---------------------------------------------------------------------------

import { buildCrossMarketCards as buildScoredCrossMarketCards } from './crossMarketRecommendations';
import { buildResearchTaskRefreshSignals } from './researchTaskSignals';
import { buildMacroMispricingRefreshPriorityEvent } from './workbenchPriorityEvents';
import {
  ACTION_MAP,
  COMPANY_SYMBOL_MAP,
  FACTOR_SYMBOL_MAP,
  FACTOR_TEMPLATE_MAP,
  buildCrossMarketAction,
  buildDisplayTier,
  buildDisplayTone,
  buildPricingAction,
  buildWorkbenchAction,
  extractAllocationOverlay,
  extractDominantDriver,
  extractRecentComparisonLead,
  extractTemplateIdentity,
  extractTemplateMeta,
  formatDriverLabel,
  formatFactorName,
  formatTemplateName,
  getInputReliabilityActionLabel,
  getReviewContextActionLabel,
} from './viewModelShared';
import { getGodEyeDepartmentLabel, localizeGodEyeText } from './displayLabels';

type TaskLike = Record<string, unknown>;

// ---- Internal helpers ----

const buildNarrativeShiftAlerts = (tasks: TaskLike[] = []): HunterAlert[] => {
  const grouped = tasks.reduce<Array<{
    templateId: string;
    taskId: string;
    title: string;
    currentDriver: Record<string, unknown> | null;
    previousDriver: Record<string, unknown> | null;
    currentCore: string;
    previousCore: string;
  }>>((accumulator, task) => {
    if (task?.type !== 'cross_market' || task?.status === 'archived') return accumulator;
    const meta = extractTemplateMeta(task);
    const templateId = extractTemplateIdentity(task, meta);
    if (!templateId) return accumulator;
    const history = (task?.snapshot_history as Array<Record<string, unknown>>) ?? [];
    if (history.length < 2) return accumulator;
    const currentMeta = (history[0]?.payload as Record<string, unknown>)?.template_meta as Record<string, unknown> ?? meta;
    const previousMeta = (history[1]?.payload as Record<string, unknown>)?.template_meta as Record<string, unknown> ?? {};
    const currentDriver = extractDominantDriver(currentMeta);
    const previousDriver = extractDominantDriver(previousMeta);
    const currentCore = (currentMeta?.theme_core as string) || '';
    const previousCore = (previousMeta?.theme_core as string) || '';
    if (!currentDriver && !previousDriver && !currentCore && !previousCore) return accumulator;
    accumulator.push({
      templateId,
      taskId: task.id as string,
      title: (task.title as string) || formatTemplateName(templateId),
      currentDriver,
      previousDriver,
      currentCore,
      previousCore,
    });
    return accumulator;
  }, []);

  return grouped
    .filter((item) => {
      const driverChanged =
        item.currentDriver?.key && item.previousDriver?.key && item.currentDriver.key !== item.previousDriver.key;
      const coreChanged = item.currentCore && item.previousCore && item.currentCore !== item.previousCore;
      return driverChanged || coreChanged;
    })
    .map((item) => {
      const currentDriverLabel = formatDriverLabel(item.currentDriver ?? {});
      const previousDriverLabel = formatDriverLabel(item.previousDriver ?? {});
      const details: string[] = [];
      if (previousDriverLabel && currentDriverLabel && previousDriverLabel !== currentDriverLabel) {
        details.push(`主导驱动从 ${previousDriverLabel} 切换到 ${currentDriverLabel}`);
      }
      if (item.previousCore && item.currentCore && item.previousCore !== item.currentCore) {
        details.push(`主题核心腿从 ${item.previousCore} 变为 ${item.currentCore}`);
      }
      return {
        key: `narrative-shift-${item.templateId}`,
        title: `${item.title} 主导叙事切换`,
        severity: 'high',
        description: details.join(' · '),
        action: buildCrossMarketAction(
          item.templateId,
          'alert_hunter',
          `${item.title} 最近两版的主导叙事发生切换，建议查看跨市场方案，重新确认当前判断。`
        ),
      };
    });
};

const buildNarrativeTrendLookup = (tasks: TaskLike[] = []): Record<string, Record<string, unknown>> => {
  return tasks.reduce<Record<string, Record<string, unknown>>>((accumulator, task) => {
    if (task?.type !== 'cross_market' || task?.status === 'archived') return accumulator;
    const meta = extractTemplateMeta(task);
    const templateId = extractTemplateIdentity(task, meta);
    if (!templateId) return accumulator;

    const currentDriver = extractDominantDriver(meta);
    const history = (task?.snapshot_history as Array<Record<string, unknown>>) ?? [];
    const previousMeta = (history[1]?.payload as Record<string, unknown>)?.template_meta as Record<string, unknown> ?? {};
    const previousDriver = extractDominantDriver(previousMeta);
    const latestOverlay = extractAllocationOverlay(task);
    const latestThemeCore = (meta?.theme_core as string) || '';
    const latestThemeSupport = (meta?.theme_support as string) || '';
    const latestTopCompressedAsset =
      ((latestOverlay?.compressed_assets as string[]) ?? [])[0] ?? '';

    let trendLabel = '保持观察';
    let trendSummary = '最近没有检测到显著的叙事切换。';
    if (previousDriver?.key && currentDriver?.key && previousDriver.key !== currentDriver.key) {
      trendLabel = '主导切换';
      trendSummary = `主导驱动从 ${formatDriverLabel(previousDriver as Record<string, unknown>)} 切换到 ${formatDriverLabel(currentDriver as Record<string, unknown>)}`;
    } else if (
      currentDriver?.value &&
      previousDriver?.value &&
      Number(currentDriver.value) > Number(previousDriver.value)
    ) {
      trendLabel = '驱动增强';
      trendSummary = `${formatDriverLabel(currentDriver as Record<string, unknown>)} 持续增强`;
    } else if (
      currentDriver?.value &&
      previousDriver?.value &&
      Number(currentDriver.value) < Number(previousDriver.value)
    ) {
      trendLabel = '驱动走弱';
      trendSummary = `${formatDriverLabel(currentDriver as Record<string, unknown>)} 较前期走弱`;
    }

    accumulator[templateId] = {
      trendLabel,
      trendSummary,
      latestThemeCore,
      latestThemeSupport,
      latestTopCompressedAsset,
    };
    return accumulator;
  }, {});
};

// ---- Exported builders ----

export interface HunterAlert {
  key: string;
  title: string;
  severity: string;
  description: string;
  action: unknown;
}

export const buildHunterModel = ({
  snapshot = {},
  overview = {},
  status = {},
  researchTasks = [],
}: {
  snapshot?: Record<string, unknown>;
  overview?: Record<string, unknown>;
  status?: Record<string, unknown>;
  researchTasks?: TaskLike[];
}): HunterAlert[] => {
  const alerts: HunterAlert[] = [];
  const refreshStatus =
    ((snapshot?.refresh_status as Record<string, Record<string, unknown>>) ??
      (status?.refresh_status as Record<string, Record<string, unknown>>)) ?? {};
  Object.entries(refreshStatus).forEach(([name, info]) => {
    if (['degraded', 'error'].includes(info.status as string)) {
      alerts.push({
        key: `provider-${name}`,
        title: `${name} 数据状态 ${info.status}`,
        severity: info.status === 'error' ? 'high' : 'medium',
        description: (info.error as string) || '继续使用最近成功快照',
        action: ACTION_MAP.observe,
      });
    }
  });

  const supplyAlerts =
    (((snapshot?.signals as Record<string, unknown>)?.supply_chain as Record<string, unknown>)?.alerts as Array<Record<string, unknown>>) ?? [];
  supplyAlerts.forEach((item, index) => {
    const symbol = COMPANY_SYMBOL_MAP[item.company as string] ?? null;
    alerts.push({
      key: `supply-${index}`,
      title: `${(item.company as string) || '未知公司'} 人才结构预警`,
      severity: 'high',
      description: (item.message as string) || `dilution ratio ${(item.dilution_ratio as number) ?? 0}`,
      action: symbol
        ? buildPricingAction(symbol, 'alert_hunter', (item.message as string) || '人才结构预警')
        : buildCrossMarketAction('defensive_beta_hedge', 'alert_hunter', (item.message as string) || '人才结构预警'),
    });
  });

  const peopleSummary = (overview?.people_layer_summary as Record<string, unknown>) ?? {};
  ((peopleSummary.fragile_companies as Array<Record<string, unknown>>) ?? []).slice(0, 2).forEach((item) => {
    const symbol = (item.symbol as string) || COMPANY_SYMBOL_MAP[item.company_name as string] || null;
    alerts.push({
      key: `people-${(item.symbol as string) || (item.company_name as string)}`,
      title: `${(item.company_name as string) || (item.symbol as string) || '重点公司'} 组织脆弱度偏高`,
      severity: Number(item.people_fragility_score ?? 0) >= 0.7 ? 'high' : 'medium',
      description: (item.summary as string) || `people fragility ${Number(item.people_fragility_score ?? 0).toFixed(2)}`,
      action: symbol
        ? buildPricingAction(
            symbol,
            'alert_hunter',
            `${(item.company_name as string) || (item.symbol as string)} 的管理层/组织结构风险偏高，建议先回到定价研究确认是否属于结构性错价。`
          )
        : ACTION_MAP.observe,
    });
  });

  const departmentChaosSummary = (overview?.department_chaos_summary as Record<string, unknown>) ?? {};
  ((departmentChaosSummary.top_departments as Array<Record<string, unknown>>) ?? [])
    .filter((item) => item.label === 'chaotic' || Number(item.chaos_score ?? 0) >= 0.58)
    .slice(0, 2)
    .forEach((item) => {
      const departmentLabel = getGodEyeDepartmentLabel(item);
      alerts.push({
        key: `department-chaos-${(item.department as string) || departmentLabel}`,
        title: `${departmentLabel} 政策混乱度偏高`,
        severity: Number(item.chaos_score ?? 0) >= 0.7 ? 'high' : 'medium',
        description: (item.reason as string) || `department chaos ${Number(item.chaos_score ?? 0).toFixed(2)}`,
        action: buildCrossMarketAction(
          'utilities_vs_growth',
          'alert_hunter',
          `${departmentLabel} 出现部门级政策反复或长官意志波动，建议先用跨市场方案确认政策错价传导。`
        ),
      });
    });

  const structuralDecayRadar = (overview?.structural_decay_radar as Record<string, unknown>) ?? {};
  const structuralDecayScore = Number(structuralDecayRadar.score ?? 0);
  if (structuralDecayRadar.label === 'decay_alert' || structuralDecayScore >= 0.68) {
    alerts.push({
      key: 'structural-decay-radar',
      title: '系统级结构衰败雷达进入警报区',
      severity: 'high',
      description: `${(structuralDecayRadar.display_label as string) || '结构衰败警报'} · ${localizeGodEyeText((structuralDecayRadar.action_hint as string) || '')}`,
      action: buildCrossMarketAction(
        'defensive_beta_hedge',
        'decay_radar',
        localizeGodEyeText((structuralDecayRadar.action_hint as string) || '结构衰败雷达进入警报区，建议先用防御方案复核宏观错价传导。')
      ),
    });
  } else if (structuralDecayRadar.label === 'decay_watch' || structuralDecayScore >= 0.44) {
    alerts.push({
      key: 'structural-decay-radar-watch',
      title: '系统级结构衰败信号升温',
      severity: 'medium',
      description: `${(structuralDecayRadar.display_label as string) || '衰败风险升温'} · ${localizeGodEyeText((structuralDecayRadar.action_hint as string) || '')}`,
      action: buildCrossMarketAction(
        'defensive_beta_hedge',
        'decay_radar',
        (structuralDecayRadar.action_hint as string) || '结构衰败雷达进入观察区，建议复核人的维度和政策治理。'
      ),
    });
  }

  const sourceModeSummary =
    ((overview?.source_mode_summary as Record<string, unknown>) ??
      (snapshot?.source_mode_summary as Record<string, unknown>)) ?? {};
  if (sourceModeSummary.label === 'fallback-heavy') {
    alerts.push({
      key: 'source-mode-fallback-heavy',
      title: '研究输入来源治理进入回退主导',
      severity: 'medium',
      description: (sourceModeSummary.reason as string) || '当前研究输入由 proxy/curated 回退源主导，建议压缩偏置强度并优先复核来源质量。',
      action: ACTION_MAP.observe,
    });
  } else if (sourceModeSummary.label === 'mixed' && sourceModeSummary.reason) {
    alerts.push({
      key: 'source-mode-mixed-watch',
      title: '研究输入来源治理处于混合观察态',
      severity: 'medium',
      description: sourceModeSummary.reason as string,
      action: ACTION_MAP.observe,
    });
  }

  ((overview?.factors as Array<Record<string, unknown>>) ?? [])
    .filter((item) => item.signal !== 0)
    .forEach((factor) => {
      alerts.push({
        key: `factor-${factor.name as string}`,
        title: `${formatFactorName(factor.name as string)} 出现偏移`,
        severity: Math.abs(Number(factor.z_score ?? 0)) > 1 ? 'high' : 'medium',
        description: `value=${Number(factor.value ?? 0).toFixed(3)} z=${Number(factor.z_score ?? 0).toFixed(3)}`,
        action:
          factor.signal === 1
            ? buildCrossMarketAction(
                FACTOR_TEMPLATE_MAP[factor.name as string],
                'alert_hunter',
                `${formatFactorName(factor.name as string)} 提示适合先看跨市场方案`
              )
            : buildPricingAction(
                FACTOR_SYMBOL_MAP[factor.name as string],
                'alert_hunter',
                `${formatFactorName(factor.name as string)} 提示适合先看单标的定价研究`
              ),
      });
    });

  const resonance = (overview?.resonance_summary as Record<string, unknown>) ?? {};
  const resonanceFactors = [
    ...((resonance.positive_cluster as string[]) ?? []),
    ...((resonance.negative_cluster as string[]) ?? []),
    ...((resonance.reversed_factors as string[]) ?? []),
    ...((resonance.precursor as string[]) ?? []),
    ...((resonance.weakening as string[]) ?? []),
  ];
  if (resonance.label && resonance.label !== 'mixed' && resonanceFactors.length) {
    const primaryFactor = resonanceFactors[0];
    const clusterFactors = Array.from(new Set(resonanceFactors))
      .slice(0, 3)
      .map((name) => formatFactorName(name))
      .join('、');
    const severity =
      resonance.label === 'reversal_cluster'
        ? 'high'
        : resonance.label === 'precursor_cluster' || resonance.label === 'fading_cluster'
          ? 'medium'
          : 'high';
    alerts.push({
      key: `resonance-${resonance.label as string}`,
      title: `宏观因子共振 ${resonance.label as string}`,
      severity,
      description: `${resonance.reason as string} · ${clusterFactors}`,
      action: buildCrossMarketAction(
        FACTOR_TEMPLATE_MAP[primaryFactor],
        'alert_hunter',
        `${clusterFactors} 正在形成宏观共振，建议查看跨市场方案，复核当前判断。`
      ),
    });
  }

  alerts.push(...buildNarrativeShiftAlerts(researchTasks));

  const refreshSignals = buildResearchTaskRefreshSignals({ researchTasks, overview, snapshot });
  const taskById = Object.fromEntries((researchTasks ?? []).map((task) => [task.id as string, task]));

  const buildRefreshAction = (item: Record<string, unknown>): unknown => {
    const task = taskById[item.taskId as string] ?? {};
    const title = (item.title as string) || formatTemplateName(item.templateId as string);
    const workbenchType = (task?.type as string) || 'cross_market';
    const peopleNote =
      (item.peopleLayerDriven as boolean)
        ? ((item.peopleLayerShift as Record<string, unknown>)?.actionHint as string) ||
          ((item.peopleLayerShift as Record<string, unknown>)?.currentSummary as string) ||
          '人的维度较保存时明显走弱，建议优先确认组织结构变化。'
        : '';
    const thesisNote =
      (item.tradeThesisDriven as boolean)
        ? ((item.tradeThesisShift as Record<string, unknown>)?.actionHint as string) ||
          ((item.tradeThesisShift as Record<string, unknown>)?.currentSummary as string) ||
          '交易 Thesis 相对保存时已漂移，建议优先确认主逻辑和组合腿是否仍然成立。'
        : '';
    const departmentChaosNote =
      (item.departmentChaosDriven as boolean)
        ? ((item.departmentChaosShift as Record<string, unknown>)?.actionHint as string) ||
          ((item.departmentChaosShift as Record<string, unknown>)?.currentSummary as string) ||
          ((item.departmentChaosShift as Record<string, unknown>)?.lead as string) ||
          '部门级政策混乱较保存时明显恶化，建议确认政策执行主体是否已经改变组合风险。'
        : '';
    const structuralRadarNote =
      (item.structuralDecayRadarDriven as boolean)
        ? ((item.structuralDecayRadarShift as Record<string, unknown>)?.actionHint as string) ||
          ((item.structuralDecayRadarShift as Record<string, unknown>)?.currentSummary as string) ||
          ((item.structuralDecayRadarShift as Record<string, unknown>)?.lead as string) ||
          '系统级结构衰败雷达较保存时继续升温，建议优先确认组合是否需要切到更强的防御构造。'
        : '';

    if (item.severity === 'high') {
      return buildWorkbenchAction(
        item.taskId as string,
        'alert_hunter',
        (item.selectionQualityRunState as Record<string, unknown>)?.active
          ? `${title} 当前结果已在降级强度下运行，更适合直接打开对应任务优先重看。`
          : item.structuralDecayRadarDriven && structuralRadarNote
            ? `${title} ${structuralRadarNote}`
            : item.structuralDecayDriven && (item.structuralDecayShift as Record<string, unknown>)?.actionHint
              ? `${title} ${(item.structuralDecayShift as Record<string, unknown>).actionHint}`
              : item.tradeThesisDriven && thesisNote
                ? `${title} ${thesisNote}`
                : item.departmentChaosDriven && departmentChaosNote
                  ? `${title} ${departmentChaosNote}`
                  : item.reviewContextDriven && (item.reviewContextShift as Record<string, unknown>)?.actionHint
                    ? `${title} ${(item.reviewContextShift as Record<string, unknown>).actionHint}`
                    : item.inputReliabilityDriven && (item.inputReliabilityShift as Record<string, unknown>)?.actionHint
                      ? `${title} ${(item.inputReliabilityShift as Record<string, unknown>).actionHint}`
                      : item.peopleLayerDriven && peopleNote
                        ? `${title} ${peopleNote}`
                        : item.inputReliabilityDriven && (item.inputReliabilityShift as Record<string, unknown>)?.currentLead
                          ? `${title} ${(item.inputReliabilityShift as Record<string, unknown>).currentLead}`
                          : `${title} 当前研究输入已经变化，建议直接打开对应任务更新判断。`,
        (item.priorityReason as string) || '',
        (item.selectionQualityRunState as Record<string, unknown>)?.active
          ? '优先重看任务'
          : item.structuralDecayRadarDriven
            ? '优先复核系统衰败雷达'
            : item.structuralDecayDriven
              ? '优先复核衰败判断'
              : item.tradeThesisDriven
                ? '优先复核交易 Thesis'
                : item.departmentChaosDriven
                  ? '优先复核部门混乱'
                  : item.reviewContextDriven
                    ? getReviewContextActionLabel(item.reviewContextShift as Record<string, unknown>)
                    : item.inputReliabilityDriven
                      ? getInputReliabilityActionLabel(item.inputReliabilityShift as Record<string, unknown>)
                      : item.peopleLayerDriven
                        ? '优先复核人的维度'
                        : '打开任务',
        workbenchType
      );
    }

    if (task?.type === 'trade_thesis') {
      return buildWorkbenchAction(
        item.taskId as string,
        'alert_hunter',
        item.tradeThesisDriven && thesisNote
          ? `${title} ${thesisNote}`
          : item.structuralDecayRadarDriven && structuralRadarNote
            ? `${title} ${structuralRadarNote}`
            : item.structuralDecayDriven && (item.structuralDecayShift as Record<string, unknown>)?.actionHint
              ? `${title} ${(item.structuralDecayShift as Record<string, unknown>).actionHint}`
              : departmentChaosNote
                ? `${title} ${departmentChaosNote}`
                : peopleNote
                  ? `${title} ${peopleNote}`
                  : `${title} 当前交易 Thesis 已与最新定价证据出现漂移，建议直接打开任务复核。`,
        (item.priorityReason as string) || '',
        item.tradeThesisDriven
          ? '优先复核交易 Thesis'
          : item.structuralDecayRadarDriven
            ? '优先复核系统衰败雷达'
            : item.structuralDecayDriven
              ? '优先复核衰败判断'
              : item.departmentChaosDriven
                ? '优先复核部门混乱'
                : item.peopleLayerDriven
                  ? '优先复核人的维度'
                  : '打开交易 Thesis',
        'trade_thesis'
      );
    }

    if (task?.type === 'pricing') {
      return buildPricingAction(
        (task?.symbol as string) || '',
        'alert_hunter',
        peopleNote
          ? `${title} ${peopleNote}`
          : `${title} 当前人的维度或研究输入已变化，建议重新打开定价研究确认结论。`
      );
    }

    if (task?.type === 'macro_mispricing') {
      return buildWorkbenchAction(
        item.taskId as string,
        'alert_hunter',
        item.structuralDecayRadarDriven && structuralRadarNote
          ? `${title} ${structuralRadarNote}`
          : item.structuralDecayDriven && (item.structuralDecayShift as Record<string, unknown>)?.actionHint
            ? `${title} ${(item.structuralDecayShift as Record<string, unknown>).actionHint}`
            : peopleNote
              ? `${title} ${peopleNote}`
              : `${title} 当前结构性衰败判断已经变化，建议直接打开衰败任务延续跟踪。`,
        (item.priorityReason as string) || '',
        item.structuralDecayRadarDriven
          ? '优先复核系统衰败雷达'
          : item.structuralDecayDriven
            ? '优先复核衰败判断'
            : item.peopleLayerDriven
              ? '优先复核人的维度'
              : '打开衰败任务',
        'macro_mispricing'
      );
    }

    return buildCrossMarketAction(
      item.templateId as string,
      'alert_hunter',
      (item.selectionQualityRunState as Record<string, unknown>)?.active
        ? `${title} 当前结果已在降级强度下运行，建议重新查看跨市场方案优先重看。`
        : item.structuralDecayRadarDriven && structuralRadarNote
          ? `${title} ${structuralRadarNote}`
          : item.departmentChaosDriven && departmentChaosNote
            ? `${title} ${departmentChaosNote}`
            : item.reviewContextDriven && (item.reviewContextShift as Record<string, unknown>)?.actionHint
              ? `${title} ${(item.reviewContextShift as Record<string, unknown>).actionHint}`
              : item.inputReliabilityDriven && (item.inputReliabilityShift as Record<string, unknown>)?.actionHint
                ? `${title} ${(item.inputReliabilityShift as Record<string, unknown>).actionHint}`
                : item.peopleLayerDriven && peopleNote
                  ? `${title} ${peopleNote}`
                  : item.inputReliabilityDriven && (item.inputReliabilityShift as Record<string, unknown>)?.currentLead
                    ? `${title} ${(item.inputReliabilityShift as Record<string, unknown>).currentLead}`
                    : `${title} 当前研究输入已经变化，建议重新查看跨市场方案更新判断。`
    );
  };

  refreshSignals.prioritized
    .filter((item) => item.severity !== 'low')
    .slice(0, 3)
    .forEach((item) => {
      const recentComparisonLead = extractRecentComparisonLead(taskById[item.taskId]);
      const runStateSummary =
        item.selectionQualityRunState?.active && item.selectionQualityRunState?.label
          ? `降级运行 ${item.selectionQualityRunState.label}${item.selectionQualityRunState.reason ? `，${item.selectionQualityRunState.reason}` : ''}`
          : '';
      alerts.push({
        key: `refresh-${item.taskId}`,
        title: `${item.title || formatTemplateName(item.templateId)} ${item.refreshLabel}`,
        severity: item.severity,
        description: [
          item.summary,
          recentComparisonLead ? `最近两版：${recentComparisonLead}` : '',
          item.reviewContextDriven && item.reviewContextShift?.lead ? item.reviewContextShift.lead : '',
          item.inputReliabilityDriven && item.inputReliabilityShift?.currentLead
            ? `输入可靠度 ${item.inputReliabilityShift.savedLabel}→${item.inputReliabilityShift.currentLabel}，${item.inputReliabilityShift.currentLead}`
            : '',
          item.peopleLayerDriven && item.peopleLayerShift?.lead ? item.peopleLayerShift.lead : '',
          item.peopleLayerDriven && item.peopleLayerShift?.evidenceSummary ? `人事证据 ${item.peopleLayerShift.evidenceSummary}` : '',
          item.peopleLayerDriven && item.peopleLayerShift?.currentSummary ? item.peopleLayerShift.currentSummary : '',
          item.structuralDecayDriven && item.structuralDecayShift?.lead ? item.structuralDecayShift.lead : '',
          item.structuralDecayDriven && item.structuralDecayShift?.evidenceSummary ? `衰败证据 ${item.structuralDecayShift.evidenceSummary}` : '',
          item.structuralDecayDriven && item.structuralDecayShift?.currentSummary ? item.structuralDecayShift.currentSummary : '',
          item.structuralDecayRadarDriven && item.structuralDecayRadarShift?.lead ? item.structuralDecayRadarShift.lead : '',
          item.structuralDecayRadarDriven && item.structuralDecayRadarShift?.topSignalSummary ? `雷达焦点 ${item.structuralDecayRadarShift.topSignalSummary}` : '',
          item.structuralDecayRadarDriven && item.structuralDecayRadarShift?.currentSummary ? item.structuralDecayRadarShift.currentSummary : '',
          item.tradeThesisDriven && item.tradeThesisShift?.lead ? item.tradeThesisShift.lead : '',
          item.tradeThesisDriven && item.tradeThesisShift?.evidenceSummary ? `Thesis 证据 ${item.tradeThesisShift.evidenceSummary}` : '',
          item.departmentChaosDriven && item.departmentChaosShift?.lead ? item.departmentChaosShift.lead : '',
          item.departmentChaosDriven && item.departmentChaosShift?.currentSummary ? item.departmentChaosShift.currentSummary : '',
          item.departmentChaosDriven && item.departmentChaosShift?.topDepartmentLabel
            ? `部门焦点 ${item.departmentChaosShift.topDepartmentLabel}${item.departmentChaosShift.topDepartmentReason ? `，${item.departmentChaosShift.topDepartmentReason}` : ''}`
            : '',
          runStateSummary ? `${runStateSummary}，当前结果已在降级强度下运行，应优先重看` : '',
          item.selectionQualityDriven && item.selectionQualityShift?.currentLabel ? `自动降级 ${item.selectionQualityShift.currentLabel}` : '',
          item.biasCompressionDriven && item.biasCompressionShift?.topCompressedAsset ? `压缩焦点 ${item.biasCompressionShift.topCompressedAsset}` : '',
        ].filter(Boolean).join(' · '),
        action: buildRefreshAction(item as unknown as Record<string, unknown>),
      });
    });

  alerts.sort((a, b) => {
    const priority: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (priority[a.severity as string] ?? 2) - (priority[b.severity as string] ?? 2);
  });

  return alerts.slice(0, 8);
};

export interface DecayWatchItem {
  key: string;
  taskId: string;
  macroTaskId: string;
  symbol: string;
  title: string;
  label: string;
  actionLabel: string;
  score: number;
  summary: string;
  evidence: unknown[];
  dominantFailureLabel: string;
  peopleRisk: string;
  primaryView: string;
  peopleLayer: Record<string, unknown>;
  structuralDecay: Record<string, unknown>;
  macroMispricingThesis: Record<string, unknown>;
  implications: Record<string, unknown>;
  gapAnalysis: Record<string, unknown>;
  sourceTaskTitle: string;
  refreshLabel: string;
  action: unknown;
}

export const buildDecayWatchModel = (researchTasks: TaskLike[] = []): DecayWatchItem[] => {
  const existingMacroTasksBySymbol = Object.fromEntries(
    researchTasks
      .filter((task) => task?.type === 'macro_mispricing' && task?.status !== 'archived')
      .map((task) => [String(task?.symbol ?? '').trim().toUpperCase(), task])
      .filter(([symbol]) => Boolean(symbol))
  );

  return researchTasks
    .filter((task) => task?.type === 'pricing' && task?.status !== 'archived')
    .map((task): DecayWatchItem | null => {
      const payload =
        ((task?.snapshot as Record<string, unknown>)?.payload as Record<string, unknown>) ??
        ((task?.snapshot_history as Array<Record<string, unknown>>)?.[0]?.payload as Record<string, unknown>) ??
        {};
      const structuralDecay =
        (payload?.structural_decay as Record<string, unknown>) ??
        ((payload?.implications as Record<string, unknown>)?.structural_decay as Record<string, unknown>) ??
        {};
      const macroMispricingThesis =
        (payload?.macro_mispricing_thesis as Record<string, unknown>) ??
        ((payload?.implications as Record<string, unknown>)?.macro_mispricing_thesis as Record<string, unknown>) ??
        {};
      const peopleLayer = (payload?.people_layer as Record<string, unknown>) ?? {};
      const implications = (payload?.implications as Record<string, unknown>) ?? {};
      const gap = (payload?.gap_analysis as Record<string, unknown>) ?? {};
      const score = Number(structuralDecay?.score ?? 0);
      if (!score) return null;

      const symbol = String(task?.symbol ?? '').trim().toUpperCase();
      const existingMacroTask = existingMacroTasksBySymbol[symbol] ?? null;
      return {
        key: `decay-${task.id as string}`,
        taskId: task.id as string,
        macroTaskId: (existingMacroTask?.id as string) || '',
        symbol,
        title: (task.title as string) || symbol || 'Pricing task',
        label: (structuralDecay.label as string) || '待确认',
        actionLabel: (structuralDecay.action as string) || 'watch',
        score,
        summary:
          (structuralDecay.summary as string) ||
          (peopleLayer.summary as string) ||
          ((task?.snapshot as Record<string, unknown>)?.summary as string) ||
          '',
        evidence: (structuralDecay.evidence as unknown[]) ?? [],
        dominantFailureLabel: (structuralDecay.dominant_failure_label as string) || '',
        peopleRisk: (peopleLayer.risk_level as string) || (implications.people_risk as string) || '',
        primaryView: (implications.primary_view as string) || (gap.direction as string) || '',
        peopleLayer,
        structuralDecay,
        macroMispricingThesis: {
          ...macroMispricingThesis,
          trade_legs: (macroMispricingThesis?.trade_legs as unknown[]) ?? [],
        },
        implications,
        gapAnalysis: gap,
        sourceTaskTitle: (task.title as string) || symbol || 'Pricing task',
        refreshLabel: score >= 0.72 ? '优先重看' : score >= 0.5 ? '重点观察' : '继续观察',
        action: existingMacroTask
          ? buildWorkbenchAction(
              existingMacroTask.id as string,
              'godeye_decay_watch',
              `${(task.title as string) || symbol} 已存在结构性衰败观察任务，建议直接打开工作台延续跟踪。`,
              (peopleLayer.risk_level as string) === 'high' ? 'people_layer' : '',
              '打开衰败任务',
              'macro_mispricing'
            )
          : buildWorkbenchAction(
              task.id as string,
              'godeye_decay_watch',
              `${(task.title as string) || symbol} 当前出现${(structuralDecay.label as string) || '结构性走弱'}迹象，建议打开任务复核长期判断。`,
              (peopleLayer.risk_level as string) === 'high' ? 'people_layer' : '',
              score >= 0.72 ? '优先重看任务' : '打开任务',
              'pricing'
            ),
      };
    })
    .filter((item): item is DecayWatchItem => item !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(right.title || '').localeCompare(String(left.title || ''));
    })
    .slice(0, 5);
};

export interface TradeThesisWatchItem {
  key: string;
  taskId: string;
  symbol: string;
  title: string;
  stance: string;
  horizon: string;
  leadLeg: string;
  tradeLegs: unknown[];
  summary: string;
  resultsSummary: Record<string, unknown>;
  structuralDecay: Record<string, unknown>;
  peopleLayer: Record<string, unknown>;
  refreshLabel: string;
  refreshSeverity: string;
  driftLead: string;
  driftEvidence: string;
  action: unknown;
  score: number;
  severityRank: number;
}

export const buildTradeThesisWatchModel = (
  researchTasks: TaskLike[] = [],
  refreshSignals: Array<Record<string, unknown>> = [],
): TradeThesisWatchItem[] => {
  const refreshByTaskId = Object.fromEntries(
    (refreshSignals ?? []).map((item) => [item.taskId as string, item])
  );

  return researchTasks
    .filter((task) => task?.type === 'trade_thesis' && task?.status !== 'archived')
    .map((task): TradeThesisWatchItem => {
      const payload =
        ((task?.snapshot as Record<string, unknown>)?.payload as Record<string, unknown>) ??
        ((task?.snapshot_history as Array<Record<string, unknown>>)?.[0]?.payload as Record<string, unknown>) ??
        {};
      const thesisPayload = (payload?.trade_thesis as Record<string, unknown>) ?? {};
      const thesis = (thesisPayload?.thesis as Record<string, unknown>) ?? {};
      const structuralDecay =
        (thesisPayload?.structural_decay as Record<string, unknown>) ??
        (payload?.structural_decay as Record<string, unknown>) ??
        {};
      const peopleLayer =
        (thesisPayload?.people_layer as Record<string, unknown>) ??
        (payload?.people_layer as Record<string, unknown>) ??
        {};
      const resultsSummary = (thesisPayload?.results_summary as Record<string, unknown>) ?? {};
      const refresh = refreshByTaskId[task.id as string] ?? null;
      const leadLeg =
        (thesis?.primary_leg as Record<string, unknown>)?.symbol as string ||
        ((thesis?.trade_legs as Array<Record<string, unknown>>)?.[0]?.symbol as string) ||
        ((thesisPayload?.assets as Array<Record<string, unknown>>)?.[0]?.symbol as string) ||
        String(task?.symbol ?? '').trim().toUpperCase();
      const symbol = String(leadLeg || task?.symbol || '').trim().toUpperCase();
      const score = Number((structuralDecay?.score as number) ?? (peopleLayer?.people_fragility_score as number) ?? 0);
      const severityRank = refresh?.severity === 'high' ? 3 : refresh?.severity === 'medium' ? 2 : 1;

      return {
        key: `thesis-watch-${task.id as string}`,
        taskId: task.id as string,
        symbol,
        title: (task.title as string) || symbol || 'Trade Thesis',
        stance: (thesis?.stance as string) || (thesisPayload?.stance as string) || '',
        horizon:
          (thesis?.expected_horizon as string) ||
          (thesis?.horizon as string) ||
          (resultsSummary?.horizon as string) ||
          '',
        leadLeg,
        tradeLegs: (thesis?.trade_legs as unknown[]) ?? [],
        summary:
          (thesis?.summary as string) ||
          (resultsSummary?.summary as string) ||
          ((task?.snapshot as Record<string, unknown>)?.summary as string) ||
          '',
        resultsSummary,
        structuralDecay,
        peopleLayer,
        refreshLabel: (refresh?.refreshLabel as string) || '保持观察',
        refreshSeverity: (refresh?.severity as string) || 'low',
        driftLead:
          (refresh?.tradeThesisShift as Record<string, unknown>)?.lead as string ||
          (refresh?.summary as string) ||
          '',
        driftEvidence:
          (refresh?.tradeThesisShift as Record<string, unknown>)?.evidenceSummary as string || '',
        action: buildWorkbenchAction(
          task.id as string,
          'godeye_thesis_watch',
          (refresh?.tradeThesisDriven as boolean) && (refresh?.tradeThesisShift as Record<string, unknown>)?.actionHint
            ? `${(task.title as string) || symbol} ${(refresh.tradeThesisShift as Record<string, unknown>).actionHint}`
            : `${(task.title as string) || symbol} 当前交易 Thesis 进入重点观察区，建议打开任务确认组合腿和执行条件。`,
          (refresh?.priorityReason as string) || '',
          (refresh?.tradeThesisDriven as boolean) ? '优先复核交易 Thesis' : '打开交易 Thesis',
          'trade_thesis'
        ),
        score,
        severityRank,
      };
    })
    .filter((item) => item.symbol || item.title)
    .sort((left, right) => {
      if (right.severityRank !== left.severityRank) return right.severityRank - left.severityRank;
      if (right.score !== left.score) return right.score - left.score;
      return String(left.title || '').localeCompare(String(right.title || ''));
    })
    .slice(0, 5);
};

export interface MacroMispricingPayload {
  type: string;
  title: string;
  source: string;
  symbol: string;
  note: string;
  context: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  refresh_priority_event?: unknown;
}

export const buildMacroMispricingWorkbenchPayload = (
  item: Record<string, unknown> = {},
): MacroMispricingPayload => {
  const symbol = String(item?.symbol ?? '').trim().toUpperCase();
  const structuralDecay = (item?.structuralDecay as Record<string, unknown>) ?? {};
  const macroMispricingThesis = (item?.macroMispricingThesis as Record<string, unknown>) ?? {};
  const peopleLayer = (item?.peopleLayer as Record<string, unknown>) ?? {};
  const implications = (item?.implications as Record<string, unknown>) ?? {};
  const gapAnalysis = (item?.gapAnalysis as Record<string, unknown>) ?? {};
  const title = `[MacroMispricing] ${symbol || (item?.title as string) || 'Decay Watch'} 结构性衰败观察`;
  const highlights = [
    (structuralDecay?.summary as string) || '',
    (peopleLayer?.summary as string) || '',
    (structuralDecay?.dominant_failure_label as string) ? `主导失效模式 ${structuralDecay.dominant_failure_label}` : '',
    (gapAnalysis?.direction as string) ? `定价方向 ${gapAnalysis.direction}` : '',
  ].filter(Boolean);

  const payload: MacroMispricingPayload = {
    type: 'macro_mispricing',
    title,
    source: 'godeye_decay_watch',
    symbol,
    note: `${symbol || (item?.title as string) || '该标的'} 已进入结构性衰败观察名单，建议按长期错价任务持续跟踪。`,
    context: {
      view: 'godsEye',
      source: 'godeye_decay_watch',
      symbol,
      stage: '结构性衰败观察',
      pricing_task_id: (item?.taskId as string) || '',
    },
    snapshot: {
      headline: `${symbol || (item?.title as string) || '目标'} 结构性衰败观察`,
      summary:
        (structuralDecay?.summary as string) ||
        (peopleLayer?.summary as string) ||
        `${symbol || (item?.title as string) || '该标的'} 出现人的维度与长期定价证据同时走弱的迹象。`,
      highlights: highlights.slice(0, 4),
      payload: {
        structural_decay: structuralDecay,
        macro_mispricing_thesis: macroMispricingThesis,
        people_layer: peopleLayer,
        implications,
        gap_analysis: gapAnalysis,
        source_task_id: (item?.taskId as string) || '',
        source_task_title: (item?.sourceTaskTitle as string) || (item?.title as string) || '',
        source_task_type: 'pricing',
      },
    },
  };
  const refreshPriorityEvent = buildMacroMispricingRefreshPriorityEvent(item);
  return refreshPriorityEvent
    ? { ...payload, refresh_priority_event: refreshPriorityEvent }
    : payload;
};

export const buildCrossMarketCards = (
  payload: Record<string, unknown> = {},
  overview: Record<string, unknown> = {},
  snapshot: Record<string, unknown> = {},
  researchTasks: TaskLike[] = [],
): Array<Record<string, unknown>> => {
  const trendLookup = buildNarrativeTrendLookup(researchTasks);
  const refreshLookup = buildResearchTaskRefreshSignals({ researchTasks, overview, snapshot }).byTemplateId;
  const taskLookup = Object.fromEntries(
    researchTasks
      .filter((task) => task?.type === 'cross_market' && task?.status !== 'archived')
      .sort((left, right) =>
        String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''))
      )
      .map((task) => [
        extractTemplateIdentity(task, extractTemplateMeta(task)),
        task,
      ])
      .filter(([templateId]) => Boolean(templateId))
  );

  return buildScoredCrossMarketCards(
    payload,
    overview,
    snapshot,
    (templateId, note) => buildCrossMarketAction(templateId, 'cross_market_overview', note)
  ).map((card) => {
    const trendMeta = trendLookup[card.id as string] ?? {};
    const refreshMeta = refreshLookup[card.id as string] ?? null;
    const recentComparisonLead = extractRecentComparisonLead(taskLookup[card.id as string]);
    const rankingPenalty = refreshMeta?.biasCompressionShift?.coreLegAffected
      ? 0.45
      : refreshMeta?.selectionQualityRunState?.active
        ? 0.3
        : refreshMeta?.reviewContextDriven
          ? 0.24
          : refreshMeta?.departmentChaosDriven
            ? 0.18
            : refreshMeta?.inputReliabilityDriven
              ? 0.16
              : refreshMeta?.selectionQualityDriven
                ? 0.2
                : 0;
    const adjustedScore = Number(
      Math.max(0, Number(card.recommendationScore ?? 0) - rankingPenalty).toFixed(2)
    );

    return {
      ...card,
      baseRecommendationScore: card.recommendationScore,
      baseRecommendationTier: card.recommendationTier,
      rankingPenalty,
      rankingPenaltyReason: rankingPenalty
        ? refreshMeta?.biasCompressionShift?.coreLegAffected
          ? `核心腿 ${refreshMeta?.biasCompressionShift?.topCompressedAsset || ''} 已进入偏置收缩焦点，方案排序自动降级`
          : refreshMeta?.selectionQualityRunState?.active
            ? `当前结果已按 ${refreshMeta?.selectionQualityRunState?.label || 'degraded'} 强度运行，方案排序进一步下调`
            : refreshMeta?.reviewContextDriven
              ? `复核语境切换：${refreshMeta?.reviewContextShift?.lead || '最近两版已发生复核语境切换，方案排序谨慎下调'}`
              : refreshMeta?.departmentChaosDriven
                ? `部门混乱变化：${refreshMeta?.departmentChaosShift?.lead || refreshMeta?.departmentChaosShift?.currentSummary || '部门级政策混乱恶化，方案排序谨慎下调'}`
                : refreshMeta?.inputReliabilityDriven
                  ? `输入可靠度变化：${refreshMeta?.inputReliabilityShift?.currentLead || '整体输入可靠度下降，方案排序适度下调'}`
                  : `当前主题已进入自动降级处理，方案排序谨慎下调`
        : '',
      recommendationScore: adjustedScore,
      recommendationTier: buildDisplayTier(adjustedScore),
      recommendationTone: buildDisplayTone(adjustedScore),
      ...trendMeta,
      ...(refreshMeta
        ? {
            taskRefreshTaskId: refreshMeta.taskId,
            taskRefreshSeverity: refreshMeta.severity,
            taskRefreshLabel: refreshMeta.refreshLabel,
            taskRefreshTone: refreshMeta.refreshTone,
            taskRefreshSummary: refreshMeta.summary,
            taskRefreshResonanceDriven: refreshMeta.resonanceDriven,
            taskRefreshPolicySourceDriven: refreshMeta.policySourceDriven,
            taskRefreshDepartmentChaosDriven: refreshMeta.departmentChaosDriven,
            taskRefreshInputReliabilityDriven: refreshMeta.inputReliabilityDriven,
            taskRefreshBiasCompressionDriven: refreshMeta.biasCompressionDriven,
            taskRefreshSelectionQualityDriven: refreshMeta.selectionQualityDriven,
            taskRefreshSelectionQualityShift: refreshMeta.selectionQualityShift,
            taskRefreshSelectionQualityRunState: refreshMeta.selectionQualityRunState,
            taskRefreshSelectionQualityActive: refreshMeta.selectionQualityRunState?.active || false,
            taskRefreshReviewContextDriven: refreshMeta.reviewContextDriven,
            taskRefreshReviewContextShift: refreshMeta.reviewContextShift,
            taskRefreshTradeThesisDriven: refreshMeta.tradeThesisDriven,
            taskRefreshTradeThesisShift: refreshMeta.tradeThesisShift,
            taskRefreshBiasCompressionShift: refreshMeta.biasCompressionShift,
            taskRefreshBiasCompressionCore: refreshMeta.biasCompressionShift?.coreLegAffected || false,
            taskRefreshTopCompressedAsset: refreshMeta.biasCompressionShift?.topCompressedAsset || '',
            taskRefreshPolicySourceShift: refreshMeta.policySourceShift,
            taskRefreshDepartmentChaosShift: refreshMeta.departmentChaosShift,
            taskRefreshInputReliabilityShift: refreshMeta.inputReliabilityShift,
            taskRecentComparisonLead: recentComparisonLead,
            taskAction:
              refreshMeta.severity === 'high'
                ? buildWorkbenchAction(
                    refreshMeta.taskId,
                    'cross_market_overview',
                    refreshMeta.selectionQualityRunState?.active
                      ? `${card.name} 当前结果已在降级强度下运行，更适合直接打开对应任务优先重看。`
                      : refreshMeta.reviewContextDriven
                        ? `${card.name} 最近两版已发生复核语境切换，更适合直接打开对应任务优先重看。`
                        : refreshMeta.departmentChaosDriven && refreshMeta.departmentChaosShift?.actionHint
                          ? `${card.name} ${refreshMeta.departmentChaosShift.actionHint}`
                          : refreshMeta.departmentChaosDriven
                            ? `${card.name} 部门级政策混乱已经恶化，更适合直接打开对应任务优先复核。`
                            : refreshMeta.inputReliabilityDriven && refreshMeta.inputReliabilityShift?.actionHint
                              ? `${card.name} ${refreshMeta.inputReliabilityShift.actionHint}`
                              : refreshMeta.inputReliabilityDriven
                                ? `${card.name} 当前整体输入可靠度已经变化，更适合直接打开对应任务优先复核。`
                                : `${card.name} 当前更适合直接打开对应任务处理。`,
                    refreshMeta.priorityReason || '',
                    refreshMeta.selectionQualityRunState?.active
                      ? '优先重看任务'
                      : refreshMeta.reviewContextDriven
                        ? getReviewContextActionLabel(refreshMeta.reviewContextShift ?? null)
                        : refreshMeta.departmentChaosDriven
                          ? '优先复核部门混乱'
                          : refreshMeta.inputReliabilityDriven
                            ? getInputReliabilityActionLabel(refreshMeta.inputReliabilityShift ?? null)
                            : '打开任务'
                  )
                : null,
          }
        : {}),
    };
  });
};
