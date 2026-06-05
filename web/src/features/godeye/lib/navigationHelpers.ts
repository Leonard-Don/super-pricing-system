// ---------------------------------------------------------------------------
// navigationHelpers — ported from frontend/src/components/GodEyeDashboard/navigationHelpers.js
// Pure logic, no React / antd. Names/signatures/behavior identical to old JS.
// ---------------------------------------------------------------------------

import {
  buildCrossMarketLink,
  buildPricingLink,
  buildWorkbenchLink,
  navigateToAppUrl,
} from './researchContext';

// ---- Internal constant ----

const REFRESH_PRIORITY: Array<{ flag: string; reason: string; highOnly: boolean }> = [
  { flag: 'taskRefreshResonanceDriven', reason: 'resonance', highOnly: true },
  { flag: 'taskRefreshBiasCompressionCore', reason: 'bias_quality_core', highOnly: true },
  { flag: 'taskRefreshSelectionQualityActive', reason: 'selection_quality_active', highOnly: true },
  { flag: 'taskRefreshReviewContextDriven', reason: 'review_context', highOnly: true },
  { flag: 'taskRefreshStructuralDecayDriven', reason: 'structural_decay', highOnly: true },
  { flag: 'taskRefreshTradeThesisDriven', reason: 'trade_thesis', highOnly: true },
  { flag: 'taskRefreshPeopleLayerDriven', reason: 'people_layer', highOnly: true },
  { flag: 'taskRefreshDepartmentChaosDriven', reason: 'department_chaos', highOnly: true },
  { flag: 'taskRefreshInputReliabilityDriven', reason: 'input_reliability', highOnly: true },
  { flag: 'taskRefreshSelectionQualityDriven', reason: 'selection_quality', highOnly: true },
  { flag: 'taskRefreshBiasCompressionDriven', reason: 'bias_quality', highOnly: true },
  { flag: 'taskRefreshPolicySourceDriven', reason: 'policy_source', highOnly: true },
  { flag: 'taskRefreshResonanceDriven', reason: 'resonance', highOnly: false },
  { flag: 'taskRefreshBiasCompressionCore', reason: 'bias_quality_core', highOnly: false },
  { flag: 'taskRefreshSelectionQualityActive', reason: 'selection_quality_active', highOnly: false },
  { flag: 'taskRefreshReviewContextDriven', reason: 'review_context', highOnly: false },
  { flag: 'taskRefreshStructuralDecayDriven', reason: 'structural_decay', highOnly: false },
  { flag: 'taskRefreshTradeThesisDriven', reason: 'trade_thesis', highOnly: false },
  { flag: 'taskRefreshPeopleLayerDriven', reason: 'people_layer', highOnly: false },
  { flag: 'taskRefreshDepartmentChaosDriven', reason: 'department_chaos', highOnly: false },
  { flag: 'taskRefreshInputReliabilityDriven', reason: 'input_reliability', highOnly: false },
  { flag: 'taskRefreshSelectionQualityDriven', reason: 'selection_quality', highOnly: false },
  { flag: 'taskRefreshBiasCompressionDriven', reason: 'bias_quality', highOnly: false },
  { flag: 'taskRefreshPolicySourceDriven', reason: 'policy_source', highOnly: false },
];

interface WorkbenchTarget {
  reason: string;
  taskId: string;
  type: string;
}

const findPreferredWorkbenchTarget = (
  crossMarketCards: Array<Record<string, unknown>> = [],
  refreshSignals: Array<Record<string, unknown>> = [],
): WorkbenchTarget => {
  const prioritizedSignal =
    refreshSignals.find((item) => item?.severity === 'high') ??
    refreshSignals.find((item) => item?.severity === 'medium');
  if (prioritizedSignal) {
    return {
      reason: (prioritizedSignal.priorityReason as string) || '',
      taskId: (prioritizedSignal.taskId as string) || '',
      type: (prioritizedSignal.taskType as string) || '',
    };
  }

  for (const item of REFRESH_PRIORITY) {
    const match = crossMarketCards.find(
      (card) =>
        Boolean(card?.[item.flag]) && (!item.highOnly || card?.taskRefreshSeverity === 'high')
    );
    if (match) {
      return {
        reason: item.reason,
        taskId: (match.taskRefreshTaskId as string) || '',
        type: 'cross_market',
      };
    }
  }

  const fallback =
    crossMarketCards.find((card) => card.taskRefreshSeverity === 'high') ??
    crossMarketCards.find((card) => card.taskRefreshLabel === '建议复核');

  return {
    reason: '',
    taskId: (fallback?.taskRefreshTaskId as string) || '',
    type: 'cross_market',
  };
};

// ---- Exports ----

export const buildRefreshCounts = (refreshSignals: Array<Record<string, unknown>> = []): Record<string, number> => ({
  high: refreshSignals.filter((item) => item.severity === 'high').length,
  medium: refreshSignals.filter((item) => item.severity === 'medium').length,
  resonance: refreshSignals.filter((item) => item.resonanceDriven).length,
  biasQualityCore: refreshSignals.filter((item) => (item.biasCompressionShift as Record<string, unknown>)?.coreLegAffected).length,
  selectionQuality: refreshSignals.filter((item) => item.selectionQualityDriven).length,
  selectionQualityActive: refreshSignals.filter((item) => (item.selectionQualityRunState as Record<string, unknown>)?.active).length,
  reviewContext: refreshSignals.filter((item) => item.reviewContextDriven).length,
  structuralDecay: refreshSignals.filter((item) => item.structuralDecayDriven).length,
  tradeThesis: refreshSignals.filter((item) => item.tradeThesisDriven).length,
  peopleLayer: refreshSignals.filter((item) => item.peopleLayerDriven).length,
  departmentChaos: refreshSignals.filter((item) => item.departmentChaosDriven).length,
  inputReliability: refreshSignals.filter((item) => item.inputReliabilityDriven).length,
  policySource: refreshSignals.filter((item) => item.policySourceDriven).length,
  biasQuality: refreshSignals.filter((item) => item.biasCompressionDriven).length,
});

type ActionOrTarget =
  | string
  | {
      target?: string;
      symbol?: string;
      source?: string;
      note?: string;
      template?: string;
      draft?: string;
      focus?: string;
      refresh?: string;
      type?: string;
      sourceFilter?: string;
      reason?: string;
      taskId?: string;
    };

export const navigateDashboardAction = (
  actionOrTarget: ActionOrTarget,
  {
    crossMarketCards = [],
    refreshSignals = [],
    search = '',
  }: {
    crossMarketCards?: Array<Record<string, unknown>>;
    refreshSignals?: Array<Record<string, unknown>>;
    search?: string;
  } = {},
): void => {
  if (!actionOrTarget) return;

  if (typeof actionOrTarget === 'string') {
    if (actionOrTarget === 'pricing') {
      navigateToAppUrl(buildPricingLink('', 'godeye', '来自 GodEye 的研究入口', search));
      return;
    }
    if (actionOrTarget === 'cross-market') {
      navigateToAppUrl(buildCrossMarketLink('', 'godeye', '来自 GodEye 的跨市场入口', search));
      return;
    }
    if (actionOrTarget === 'workbench-refresh') {
      const preferredTarget = findPreferredWorkbenchTarget(
        crossMarketCards as Array<Record<string, unknown>>,
        refreshSignals as Array<Record<string, unknown>>
      );
      navigateToAppUrl(
        buildWorkbenchLink(
          {
            refresh: 'high',
            type: preferredTarget.type || '',
            sourceFilter: '',
            reason: preferredTarget.reason,
            taskId: preferredTarget.taskId,
          },
          search
        )
      );
    }
    return;
  }

  if (actionOrTarget.target === 'pricing') {
    navigateToAppUrl(
      buildPricingLink(
        actionOrTarget.symbol ?? '',
        actionOrTarget.source || 'godeye',
        actionOrTarget.note || '',
        search
      )
    );
    return;
  }

  if (actionOrTarget.target === 'cross-market') {
    navigateToAppUrl(
      buildCrossMarketLink(
        actionOrTarget.template ?? '',
        actionOrTarget.source || 'godeye',
        actionOrTarget.note || '',
        search,
        actionOrTarget.draft,
        actionOrTarget.focus || 'template-detail'
      )
    );
    return;
  }

  if (actionOrTarget.target === 'workbench') {
    navigateToAppUrl(
      buildWorkbenchLink(
        {
          refresh: actionOrTarget.refresh || '',
          type: actionOrTarget.type || '',
          sourceFilter: actionOrTarget.sourceFilter || '',
          reason: actionOrTarget.reason || '',
          taskId: actionOrTarget.taskId || '',
        },
        search
      )
    );
  }
};
