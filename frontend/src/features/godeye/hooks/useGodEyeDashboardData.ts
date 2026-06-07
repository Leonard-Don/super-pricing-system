// ---------------------------------------------------------------------------
// useGodEyeDashboardData — ported from frontend/src/components/GodEyeDashboard/useGodEyeDashboardData.js
//
// Trims applied per P2 plan:
//   - antd `message` removed (no UI toasts from the hook)
//   - publishQuantAlertEvent NOT called — see TODO below
//   - createResearchTask / handleSaveDecayWatchTask deferred — see TODO below
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';

import { refreshAltData } from '@/services/api/altDataAndMacro';
import {
  buildGodEyeDerivedState,
  fetchGodEyeDashboardPayload,
  type DashboardStatus,
  type GodEyeDerivedState,
} from '@/features/godeye/lib/dashboardDataHelpers';
import type { buildFactorPanelModel, buildHeatmapModel, buildRadarModel, buildTimelineModel } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Precise state types (no `any`)
// ---------------------------------------------------------------------------

type Overview = Record<string, unknown>;
type Snapshot = Record<string, unknown>;
type Status = Record<string, unknown>;
type HistoryPayload = Record<string, unknown>;
type PolicyHistory = Record<string, unknown>;
type CrossMarketTemplates = Record<string, unknown>;
type ResearchTask = Record<string, unknown>;

interface HookState {
  loading: boolean;
  refreshing: boolean;
  overview: Overview;
  snapshot: Snapshot;
  status: Status;
  historyPayload: HistoryPayload;
  policyHistory: PolicyHistory;
  crossMarketTemplates: CrossMarketTemplates;
  researchTasks: ResearchTask[];
}

export interface UseGodEyeDashboardDataResult {
  loading: boolean;
  refreshing: boolean;
  overview: Overview;
  snapshot: Snapshot;
  // Derived view-model state from buildGodEyeDerivedState
  crossMarketCards: GodEyeDerivedState['crossMarketCards'];
  decayWatchModel: GodEyeDerivedState['decayWatchModel'];
  dashboardStatus: DashboardStatus;
  factorPanelModel: ReturnType<typeof buildFactorPanelModel>;
  heatmapModel: ReturnType<typeof buildHeatmapModel>;
  hunterAlerts: GodEyeDerivedState['hunterAlerts'];
  radarData: ReturnType<typeof buildRadarModel>;
  refreshCounts: GodEyeDerivedState['refreshCounts'];
  refreshSignals: GodEyeDerivedState['refreshSignals'];
  tradeThesisWatchModel: GodEyeDerivedState['tradeThesisWatchModel'];
  timelineItems: ReturnType<typeof buildTimelineModel>;
  // Actions
  handleManualRefresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useGodEyeDashboardData(): UseGodEyeDashboardDataResult {
  const [state, setState] = useState<HookState>({
    loading: true,
    refreshing: false,
    overview: {},
    snapshot: {},
    status: {},
    historyPayload: {},
    policyHistory: {},
    crossMarketTemplates: {},
    researchTasks: [],
  });

  const loadDashboard = useCallback(async (refresh = false) => {
    setState((prev) => ({
      ...prev,
      ...(refresh ? { refreshing: true } : { loading: true }),
    }));
    try {
      const payload = await fetchGodEyeDashboardPayload(refresh);
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        overview: payload.overview,
        snapshot: payload.snapshot,
        status: payload.status,
        historyPayload: payload.historyPayload,
        policyHistory: payload.policyHistory,
        crossMarketTemplates: payload.crossMarketTemplates,
        researchTasks: payload.researchTasks,
      }));
    } catch {
      // antd message removed; callers may read dashboardStatus.degradedProviders for error display
      setState((prev) => ({ ...prev, loading: false, refreshing: false }));
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadDashboard(false);
    });
  }, [loadDashboard]);

  const handleManualRefresh = useCallback(async () => {
    setState((prev) => ({ ...prev, refreshing: true }));
    try {
      await refreshAltData('all');
      // TODO (P2.5): publish quant alert events via publishQuantAlertEvent after refresh
      await loadDashboard(false);
    } catch {
      // antd message removed; refreshing flag cleared via loadDashboard's finally path
      setState((prev) => ({ ...prev, refreshing: false }));
    }
  }, [loadDashboard]);

  // TODO (P3): handleSaveDecayWatchTask — save decay watch item to research workbench via createResearchTask
  // The action is deferred; components may render the CTA as disabled/placeholder.

  const {
    crossMarketCards,
    decayWatchModel,
    dashboardStatus,
    factorPanelModel,
    heatmapModel,
    hunterAlerts,
    radarData,
    refreshCounts,
    refreshSignals,
    tradeThesisWatchModel,
    timelineItems,
  } = useMemo(
    () =>
      buildGodEyeDerivedState({
        crossMarketTemplates: state.crossMarketTemplates,
        historyPayload: state.historyPayload,
        overview: state.overview,
        policyHistory: state.policyHistory,
        researchTasks: state.researchTasks,
        snapshot: state.snapshot,
        status: state.status,
      }),
    [
      state.crossMarketTemplates,
      state.historyPayload,
      state.overview,
      state.policyHistory,
      state.researchTasks,
      state.snapshot,
      state.status,
    ]
  );

  return {
    crossMarketCards,
    decayWatchModel,
    dashboardStatus,
    factorPanelModel,
    handleManualRefresh,
    heatmapModel,
    hunterAlerts,
    loading: state.loading,
    overview: state.overview,
    radarData,
    refreshCounts,
    refreshSignals,
    refreshing: state.refreshing,
    snapshot: state.snapshot,
    tradeThesisWatchModel,
    timelineItems,
  };
}
