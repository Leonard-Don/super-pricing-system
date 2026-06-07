// ---------------------------------------------------------------------------
// dashboardDataHelpers — ported from frontend/src/components/GodEyeDashboard/dashboardDataHelpers.js
// Pure logic. window.setTimeout → setTimeout. API imports from @/services/api/*.
// ---------------------------------------------------------------------------

import {
  getAltDataHistory,
  getAltDataSnapshot,
  getAltDataStatus,
} from '@/services/api/altDataAndMacro';
import { getMacroOverview } from '@/services/api/altDataAndMacro';
import { getCrossMarketTemplates } from '@/services/api/crossMarket';
import { getResearchTasks } from '@/services/api/research';
import { buildRefreshCounts } from './navigationHelpers';
import {
  buildCrossMarketCards,
  buildDecayWatchModel,
  buildHunterModel,
  buildTradeThesisWatchModel,
} from './taskIntelligenceViewModels';
import {
  buildFactorPanelModel,
  buildHeatmapModel,
  buildRadarModel,
  buildTimelineModel,
} from './overviewViewModels';
import { buildResearchTaskRefreshSignals } from './researchTaskSignals';

const DASHBOARD_REQUEST_TIMEOUT_MS = 20000;

interface SoftResult<T> {
  data: T;
  degraded: { source: string; reason: string } | null;
}

const withSoftTimeout = async <T>(
  promise: Promise<T>,
  fallback: T,
  source: string,
  timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS,
): Promise<SoftResult<T>> => {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise).then((data) => ({ data, degraded: null as null })),
      new Promise<SoftResult<T>>((resolve) => {
        timerId = setTimeout(() => {
          resolve({ data: fallback, degraded: { source, reason: 'timeout' } });
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    return {
      data: fallback,
      degraded: {
        source,
        reason:
          (error as Record<string, unknown>)?.userMessage as string ||
          (error as Error)?.message ||
          'request_failed',
      },
    };
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  }
};

export interface GodEyeDashboardPayload {
  crossMarketTemplates: Record<string, unknown>;
  degradedSources: Array<{ source: string; reason: string }>;
  historyPayload: Record<string, unknown>;
  overview: Record<string, unknown>;
  policyHistory: Record<string, unknown>;
  researchTasks: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown>;
  status: Record<string, unknown>;
}

export async function fetchGodEyeDashboardPayload(
  refresh = false,
): Promise<GodEyeDashboardPayload> {
  const [
    macroData,
    altData,
    statusData,
    historyData,
    policyData,
    templateData,
    researchTaskData,
  ] = await Promise.all([
    withSoftTimeout(getMacroOverview(refresh), {}, 'macro_overview'),
    withSoftTimeout(getAltDataSnapshot(refresh), {}, 'alt_snapshot'),
    withSoftTimeout(getAltDataStatus(), {}, 'alt_status'),
    withSoftTimeout(getAltDataHistory({ limit: 120 }), {}, 'alt_history'),
    withSoftTimeout(getAltDataHistory({ category: 'policy', limit: 16 }), {}, 'policy_history'),
    withSoftTimeout(getCrossMarketTemplates(), {}, 'cross_market_templates'),
    withSoftTimeout(getResearchTasks({ limit: 60 }), { data: [] }, 'research_tasks'),
  ]);

  const degradedSources = [
    macroData,
    altData,
    statusData,
    historyData,
    policyData,
    templateData,
    researchTaskData,
  ]
    .map((item) => item?.degraded)
    .filter((d): d is { source: string; reason: string } => d !== null);

  return {
    crossMarketTemplates: (templateData?.data as Record<string, unknown>) ?? {},
    degradedSources,
    historyPayload: (historyData?.data as Record<string, unknown>) ?? {},
    overview: (macroData?.data as Record<string, unknown>) ?? {},
    policyHistory: (policyData?.data as Record<string, unknown>) ?? {},
    researchTasks:
      ((researchTaskData?.data as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ??
      (researchTaskData?.data as Array<Record<string, unknown>>) ??
      [],
    snapshot: (altData?.data as Record<string, unknown>) ?? {},
    status: (statusData?.data as Record<string, unknown>) ?? {},
  };
}

export interface DashboardStatus {
  degradedProviders: Array<[string, Record<string, unknown>]>;
  providerCount: number;
  providerHealth: Record<string, unknown>;
  refreshStatus: Record<string, Record<string, unknown>>;
  schedulerStatus: Record<string, unknown>;
  snapshotTimestamp: unknown;
  staleness: Record<string, unknown>;
}

export function buildDashboardStatus(
  snapshot: Record<string, unknown>,
  status: Record<string, unknown>,
): DashboardStatus {
  const providerHealth =
    ((snapshot?.provider_health as Record<string, unknown>) ??
      (status?.provider_health as Record<string, unknown>)) ?? {};
  const staleness =
    ((snapshot?.staleness as Record<string, unknown>) ??
      (status?.staleness as Record<string, unknown>)) ?? {};
  const refreshStatus =
    ((snapshot?.refresh_status as Record<string, Record<string, unknown>>) ??
      (status?.refresh_status as Record<string, Record<string, unknown>>)) ?? {};
  const providerCount = Object.keys((snapshot?.providers as Record<string, unknown>) ?? {}).length;
  const snapshotTimestamp = snapshot?.snapshot_timestamp ?? status?.snapshot_timestamp;
  const schedulerStatus = (status?.scheduler as Record<string, unknown>) ?? {};
  const degradedProviders = Object.entries(refreshStatus).filter(([, item]) =>
    ['degraded', 'error'].includes(item.status as string)
  );

  return {
    degradedProviders,
    providerCount,
    providerHealth,
    refreshStatus,
    schedulerStatus,
    snapshotTimestamp,
    staleness,
  };
}

export interface GodEyeDerivedState {
  crossMarketCards: Array<Record<string, unknown>>;
  decayWatchModel: unknown[];
  dashboardStatus: DashboardStatus;
  factorPanelModel: ReturnType<typeof buildFactorPanelModel>;
  heatmapModel: ReturnType<typeof buildHeatmapModel>;
  hunterAlerts: unknown[];
  radarData: ReturnType<typeof buildRadarModel>;
  refreshCounts: Record<string, number>;
  refreshSignals: Array<Record<string, unknown>>;
  tradeThesisWatchModel: unknown[];
  timelineItems: ReturnType<typeof buildTimelineModel>;
}

export function buildGodEyeDerivedState({
  crossMarketTemplates,
  historyPayload,
  overview,
  policyHistory,
  researchTasks,
  snapshot,
  status,
}: {
  crossMarketTemplates: Record<string, unknown>;
  historyPayload: Record<string, unknown>;
  overview: Record<string, unknown>;
  policyHistory: Record<string, unknown>;
  researchTasks: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown>;
  status: Record<string, unknown>;
}): GodEyeDerivedState {
  const heatmapModel = buildHeatmapModel(snapshot, historyPayload);
  const radarData = buildRadarModel(overview);
  const factorPanelModel = buildFactorPanelModel(overview, snapshot);
  const timelineItems = buildTimelineModel(policyHistory);
  const refreshSignals = buildResearchTaskRefreshSignals({ researchTasks, overview, snapshot });
  const hunterAlerts = buildHunterModel({ snapshot, overview, status, researchTasks });
  const decayWatchModel = buildDecayWatchModel(researchTasks);
  const prioritized = (refreshSignals.prioritized ?? []) as unknown as Array<Record<string, unknown>>;
  const tradeThesisWatchModel = buildTradeThesisWatchModel(
    researchTasks,
    prioritized
  );
  const crossMarketCards = buildCrossMarketCards(
    crossMarketTemplates,
    overview,
    snapshot,
    researchTasks
  );

  return {
    crossMarketCards,
    decayWatchModel,
    dashboardStatus: buildDashboardStatus(snapshot, status),
    factorPanelModel,
    heatmapModel,
    hunterAlerts,
    radarData,
    refreshCounts: buildRefreshCounts(prioritized),
    refreshSignals: prioritized,
    tradeThesisWatchModel,
    timelineItems,
  };
}
