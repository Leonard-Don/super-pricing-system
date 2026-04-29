import { api, withTimeoutProfile } from './core';

/**
 * 另类数据 + 宏观因子领域 API。
 * 路由前缀：`/alt-data/*`、`/macro/*`
 */

// ============ 另类数据 ============
export const getAltDataSnapshot = async (refresh = false) => {
  const response = await api.get(`/alt-data/snapshot?refresh=${refresh}`, withTimeoutProfile('dashboard'));
  return response.data;
};

export const getAltDataStatus = async () => {
  const response = await api.get('/alt-data/status', withTimeoutProfile('dashboard'));
  return response.data;
};

export const refreshAltData = async (provider = 'all') => {
  const response = await api.post(
    `/alt-data/refresh?provider=${encodeURIComponent(provider)}`,
    undefined,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

export const getAltDataHistory = async (params = {}) => {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get(`/alt-data/history${query ? `?${query}` : ''}`, withTimeoutProfile('dashboard'));
  return response.data;
};

export const getAltSignalDiagnostics = async (params = {}) => {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.timeframe) search.set('timeframe', params.timeframe);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.half_life_days) search.set('half_life_days', String(params.half_life_days));
  const query = search.toString();
  const response = await api.get(`/alt-data/diagnostics/signals${query ? `?${query}` : ''}`, withTimeoutProfile('dashboard'));
  return response.data;
};

// ============ 宏观因子 ============
export const getMacroOverview = async (refresh = false) => {
  const response = await api.get(`/macro/overview?refresh=${refresh}`, withTimeoutProfile('dashboard'));
  return response.data;
};

export const getMacroFactorBacktest = async (params = {}) => {
  const search = new URLSearchParams();
  if (params.benchmark) search.set('benchmark', params.benchmark);
  if (params.period) search.set('period', params.period);
  if (params.horizons) search.set('horizons', Array.isArray(params.horizons) ? params.horizons.join(',') : params.horizons);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get(`/macro/factor-backtest${query ? `?${query}` : ''}`, withTimeoutProfile('analysis'));
  return response.data;
};
