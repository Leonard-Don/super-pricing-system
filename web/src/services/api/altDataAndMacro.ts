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
