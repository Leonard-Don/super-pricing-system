import type { paths } from '@/generated/api-types';
import api, { withTimeoutProfile } from './core';

/**
 * 另类数据 + 宏观因子领域 API (GodEye subset)。
 * 路由前缀：`/alt-data/*`、`/macro/*`
 */

// ---- Response types (all return unknown per schema) ----
type MacroOverviewResponse =
  paths['/macro/overview']['get']['responses'][200]['content']['application/json'];

type AltDataSnapshotResponse =
  paths['/alt-data/snapshot']['get']['responses'][200]['content']['application/json'];

type AltDataStatusResponse =
  paths['/alt-data/status']['get']['responses'][200]['content']['application/json'];

type AltDataRefreshResponse =
  paths['/alt-data/refresh']['post']['responses'][200]['content']['application/json'];

type AltDataHistoryResponse =
  paths['/alt-data/history']['get']['responses'][200]['content']['application/json'];

// ---- Param shapes ----
export interface AltDataHistoryParams {
  category?: string;
  timeframe?: string;
  limit?: number;
}

// ============ 宏观因子 ============

/**
 * 宏观错误定价总览。
 */
export const getMacroOverview = async (
  refresh = false,
): Promise<MacroOverviewResponse> => {
  const response = await api.get<MacroOverviewResponse>(
    `/macro/overview?refresh=${refresh}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

// ============ 另类数据 ============

/**
 * 另类数据作战快照。
 */
export const getAltDataSnapshot = async (
  refresh = false,
): Promise<AltDataSnapshotResponse> => {
  const response = await api.get<AltDataSnapshotResponse>(
    `/alt-data/snapshot?refresh=${refresh}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * 另类数据治理状态。
 */
export const getAltDataStatus = async (): Promise<AltDataStatusResponse> => {
  const response = await api.get<AltDataStatusResponse>(
    '/alt-data/status',
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * 手动刷新另类数据。
 */
export const refreshAltData = async (
  provider = 'all',
): Promise<AltDataRefreshResponse> => {
  const response = await api.post<AltDataRefreshResponse>(
    `/alt-data/refresh?provider=${encodeURIComponent(provider)}`,
    undefined,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

/**
 * 另类数据历史记录。
 */
export const getAltDataHistory = async (
  params: AltDataHistoryParams = {},
): Promise<AltDataHistoryResponse> => {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get<AltDataHistoryResponse>(
    `/alt-data/history${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

// ============ 另类数据深度诊断方法 (Task 1 — 13 个) ============

type AltDataHealthResponse =
  paths['/alt-data/health']['get']['responses'][200]['content']['application/json'];

type AltDataNarrativeResponse =
  paths['/alt-data/narrative']['get']['responses'][200]['content']['application/json'];

type AltDataNarrativeHistoryResponse =
  paths['/alt-data/narrative/history']['get']['responses'][200]['content']['application/json'];

type AltSignalDiagnosticsResponse =
  paths['/alt-data/diagnostics/signals']['get']['responses'][200]['content']['application/json'];

type AltDataCrossArchiveThemesResponse =
  paths['/alt-data/cross-archive-themes']['get']['responses'][200]['content']['application/json'];

type CompositeSignalsResponse =
  paths['/alt-data/composite-signals']['get']['responses'][200]['content']['application/json'];

type CompositeSignalsClusterAwareResponse =
  paths['/alt-data/composite-signals-cluster-aware']['get']['responses'][200]['content']['application/json'];

type CompositeSignalHistoryResponse =
  paths['/alt-data/composite-signals/history']['get']['responses'][200]['content']['application/json'];

type CompositeSignalComparisonResponse =
  paths['/alt-data/composite-signal-comparison']['get']['responses'][200]['content']['application/json'];

type AltDataThemesWithDiversityResponse =
  paths['/alt-data/themes-with-diversity']['get']['responses'][200]['content']['application/json'];

type AltDataProviderCorrelationResponse =
  paths['/alt-data/provider-correlation']['get']['responses'][200]['content']['application/json'];

type AltDataMacroBriefingResponse =
  paths['/alt-data/macro-briefing']['get']['responses'][200]['content']['application/json'];

type AltDataMacroBriefingDeltaResponse =
  paths['/alt-data/macro-briefing-delta']['get']['responses'][200]['content']['application/json'];

type AltDataMacroBriefingHistoryResponse =
  paths['/alt-data/macro-briefing/history']['get']['responses'][200]['content']['application/json'];

// ---- Param shapes for diagnostic methods ----
export interface AltDataNarrativeParams {
  industry?: string;
}

export interface AltDataNarrativeHistoryParams {
  days?: number;
  industry?: string;
}

export interface AltSignalDiagnosticsParams {
  category?: string;
  timeframe?: string;
  limit?: number;
  half_life_days?: number;
}

export interface AltDataCrossArchiveThemesParams {
  days_window?: number;
  min_conviction?: string;
}

export interface CompositeSignalsParams {
  min_conviction?: string;
  direction?: string;
  limit?: number;
}

export interface CompositeSignalsClusterAwareParams {
  days_window?: number;
  min_conviction?: string;
  direction?: string;
  cluster_threshold?: number;
  limit?: number;
}

export interface CompositeSignalHistoryParams {
  days?: number;
  industry?: string;
  min_conviction?: string;
}

export interface CompositeSignalComparisonParams {
  days_window?: number;
  cluster_threshold?: number;
}

export interface AltDataThemesWithDiversityParams {
  days_window?: number;
  min_conviction?: string;
  min_providers?: number;
  cluster_threshold?: number;
}

export interface AltDataProviderCorrelationParams {
  days_window?: number;
}

export interface AltDataMacroBriefingParams {
  time_window_days?: number;
}

export interface AltDataMacroBriefingDeltaParams {
  date?: string;
}

export interface AltDataMacroBriefingHistoryParams {
  days?: number;
  time_window_days?: number;
}

/**
 * Phase E1: 另类数据组件健康清单。
 */
export const getAltDataHealth = async (): Promise<AltDataHealthResponse> => {
  const response = await api.get<AltDataHealthResponse>(
    '/alt-data/health',
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase E2: 另类数据 2-3 句要点摘要（可选 industry 过滤）。
 */
export const getAltDataNarrative = async (
  params: AltDataNarrativeParams = {},
): Promise<AltDataNarrativeResponse> => {
  const search = new URLSearchParams();
  const industry = typeof params.industry === 'string' ? params.industry.trim() : '';
  if (industry) search.set('industry', industry);
  const query = search.toString();
  const response = await api.get<AltDataNarrativeResponse>(
    `/alt-data/narrative${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase E4: 另类数据要点摘要时间序列归档。
 */
export const getAltDataNarrativeHistory = async (
  params: AltDataNarrativeHistoryParams = {},
): Promise<AltDataNarrativeHistoryResponse> => {
  const search = new URLSearchParams();
  if (params.days) search.set('days', String(params.days));
  const industry = typeof params.industry === 'string' ? params.industry.trim() : '';
  if (industry) search.set('industry', industry);
  const query = search.toString();
  const response = await api.get<AltDataNarrativeHistoryResponse>(
    `/alt-data/narrative/history${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * 另类数据信号命中率与衰减诊断。
 */
export const getAltSignalDiagnostics = async (
  params: AltSignalDiagnosticsParams = {},
): Promise<AltSignalDiagnosticsResponse> => {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.half_life_days) search.set('half_life_days', String(params.half_life_days));
  const query = search.toString();
  const response = await api.get<AltSignalDiagnosticsResponse>(
    `/alt-data/diagnostics/signals${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F6: 跨归档高置信长期叙事主题。
 */
export const getAltDataCrossArchiveThemes = async (
  params: AltDataCrossArchiveThemesParams = {},
): Promise<AltDataCrossArchiveThemesResponse> => {
  const search = new URLSearchParams();
  if (params.days_window) search.set('days_window', String(params.days_window));
  const minConviction = typeof params.min_conviction === 'string' ? params.min_conviction.trim() : '';
  if (minConviction) search.set('min_conviction', minConviction);
  const query = search.toString();
  const response = await api.get<AltDataCrossArchiveThemesResponse>(
    `/alt-data/cross-archive-themes${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F4: 跨组件高置信复合信号。
 */
export const getCompositeSignals = async (
  params: CompositeSignalsParams = {},
): Promise<CompositeSignalsResponse> => {
  const search = new URLSearchParams();
  const minConviction = typeof params.min_conviction === 'string' ? params.min_conviction.trim() : '';
  if (minConviction) search.set('min_conviction', minConviction);
  const direction = typeof params.direction === 'string' ? params.direction.trim() : '';
  if (direction) search.set('direction', direction);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get<CompositeSignalsResponse>(
    `/alt-data/composite-signals${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F8: cluster-aware 跨组件复合信号。
 */
export const getCompositeSignalsClusterAware = async (
  params: CompositeSignalsClusterAwareParams = {},
): Promise<CompositeSignalsClusterAwareResponse> => {
  const search = new URLSearchParams();
  if (params.days_window) search.set('days_window', String(params.days_window));
  const minConviction = typeof params.min_conviction === 'string' ? params.min_conviction.trim() : '';
  if (minConviction) search.set('min_conviction', minConviction);
  const direction = typeof params.direction === 'string' ? params.direction.trim() : '';
  if (direction) search.set('direction', direction);
  if (params.cluster_threshold) search.set('cluster_threshold', String(params.cluster_threshold));
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get<CompositeSignalsClusterAwareResponse>(
    `/alt-data/composite-signals-cluster-aware${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F4.1: 跨组件复合信号时间序列归档。
 */
export const getCompositeSignalHistory = async (
  params: CompositeSignalHistoryParams = {},
): Promise<CompositeSignalHistoryResponse> => {
  const search = new URLSearchParams();
  if (params.days) search.set('days', String(params.days));
  const industry = typeof params.industry === 'string' ? params.industry.trim() : '';
  if (industry) search.set('industry', industry);
  const minConviction = typeof params.min_conviction === 'string' ? params.min_conviction.trim() : '';
  if (minConviction) search.set('min_conviction', minConviction);
  const query = search.toString();
  const response = await api.get<CompositeSignalHistoryResponse>(
    `/alt-data/composite-signals/history${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F8: legacy vs cluster-aware 复合信号对比。
 */
export const getCompositeSignalComparison = async (
  params: CompositeSignalComparisonParams = {},
): Promise<CompositeSignalComparisonResponse> => {
  const search = new URLSearchParams();
  if (params.days_window) search.set('days_window', String(params.days_window));
  if (params.cluster_threshold) search.set('cluster_threshold', String(params.cluster_threshold));
  const query = search.toString();
  const response = await api.get<CompositeSignalComparisonResponse>(
    `/alt-data/composite-signal-comparison${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F9: cross-archive themes × cluster diversity。
 */
export const getAltDataThemesWithDiversity = async (
  params: AltDataThemesWithDiversityParams = {},
): Promise<AltDataThemesWithDiversityResponse> => {
  const search = new URLSearchParams();
  if (params.days_window) search.set('days_window', String(params.days_window));
  const minConviction = typeof params.min_conviction === 'string' ? params.min_conviction.trim() : '';
  if (minConviction) search.set('min_conviction', minConviction);
  if (params.min_providers !== undefined) search.set('min_providers', String(params.min_providers));
  if (params.cluster_threshold) search.set('cluster_threshold', String(params.cluster_threshold));
  const query = search.toString();
  const response = await api.get<AltDataThemesWithDiversityResponse>(
    `/alt-data/themes-with-diversity${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F7: 跨 provider 信号相关性分析。
 */
export const getAltDataProviderCorrelation = async (
  params: AltDataProviderCorrelationParams = {},
): Promise<AltDataProviderCorrelationResponse> => {
  const search = new URLSearchParams();
  if (params.days_window) search.set('days_window', String(params.days_window));
  const query = search.toString();
  const response = await api.get<AltDataProviderCorrelationResponse>(
    `/alt-data/provider-correlation${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F5: alt-data 宏观日报合成（5 段式 1 页摘要）。
 */
export const getAltDataMacroBriefing = async (
  params: AltDataMacroBriefingParams = {},
): Promise<AltDataMacroBriefingResponse> => {
  const search = new URLSearchParams();
  if (params.time_window_days) search.set('time_window_days', String(params.time_window_days));
  const query = search.toString();
  const response = await api.get<AltDataMacroBriefingResponse>(
    `/alt-data/macro-briefing${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F5.1: alt-data 宏观日报今日 vs 昨日变化。
 */
export const getAltDataMacroBriefingDelta = async (
  params: AltDataMacroBriefingDeltaParams = {},
): Promise<AltDataMacroBriefingDeltaResponse> => {
  const search = new URLSearchParams();
  const date = typeof params.date === 'string' ? params.date.trim() : '';
  if (date) search.set('date', date);
  const query = search.toString();
  const response = await api.get<AltDataMacroBriefingDeltaResponse>(
    `/alt-data/macro-briefing-delta${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Phase F5.2: alt-data 宏观日报时间序列归档。
 */
export const getAltDataMacroBriefingHistory = async (
  params: AltDataMacroBriefingHistoryParams = {},
): Promise<AltDataMacroBriefingHistoryResponse> => {
  const search = new URLSearchParams();
  if (params.days) search.set('days', String(params.days));
  if (params.time_window_days) search.set('time_window_days', String(params.time_window_days));
  const query = search.toString();
  const response = await api.get<AltDataMacroBriefingHistoryResponse>(
    `/alt-data/macro-briefing/history${query ? `?${query}` : ''}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};
