import { api, withTimeoutProfile } from './core';

/**
 * 内部实时行情支撑 API：供 Quant Lab 诊断、旧快照和共享 hook 复用。
 * 面向使用者的公开实时行情工作台属于独立的 `quant-trading-system`。
 * 路由前缀：`/realtime/*`
 */

export const getRealtimeReplay = async (symbol, params = {}) => {
  const search = new URLSearchParams();
  if (params.period) search.set('period', params.period);
  if (params.interval) search.set('interval', params.interval);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  const response = await api.get(
    `/realtime/replay/${encodeURIComponent(symbol)}${query ? `?${query}` : ''}`,
    withTimeoutProfile('standard'),
  );
  return response.data;
};

export const getRealtimeOrderbook = async (symbol, levels = 10) => {
  const response = await api.get(
    `/realtime/orderbook/${encodeURIComponent(symbol)}?levels=${levels}`,
    withTimeoutProfile('standard'),
  );
  return response.data;
};

export const getRealtimeAnomalyDiagnostics = async (symbol, params = {}) => {
  const search = new URLSearchParams();
  if (params.period) search.set('period', params.period);
  if (params.interval) search.set('interval', params.interval);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.z_window) search.set('z_window', String(params.z_window));
  if (params.return_z_threshold) search.set('return_z_threshold', String(params.return_z_threshold));
  if (params.volume_z_threshold) search.set('volume_z_threshold', String(params.volume_z_threshold));
  if (params.cusum_threshold_sigma) search.set('cusum_threshold_sigma', String(params.cusum_threshold_sigma));
  if (params.pattern_lookback) search.set('pattern_lookback', String(params.pattern_lookback));
  if (params.pattern_matches) search.set('pattern_matches', String(params.pattern_matches));
  const query = search.toString();
  const response = await api.get(
    `/realtime/anomaly-diagnostics/${encodeURIComponent(symbol)}${query ? `?${query}` : ''}`,
    withTimeoutProfile('standard'),
  );
  return response.data;
};
