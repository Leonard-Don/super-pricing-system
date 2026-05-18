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

// Phase E1：另类数据运行时健康清单 — 见 docs/alt_data_audit.md § 10
export const getAltDataHealth = async () => {
  const response = await api.get('/alt-data/health', withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase E2：另类数据 2-3 句要点摘要 — 见 docs/alt_data_audit.md § 11
// Phase E2.1 (Pricing Gap 集成)：可选 `industry` 入参，仅返回该行业相关的政策 + 商品库存信号
export const getAltDataNarrative = async (params = {}) => {
  const industry = params && typeof params.industry === 'string' ? params.industry.trim() : '';
  const search = new URLSearchParams();
  if (industry) {
    search.set('industry', industry);
  }
  const query = search.toString();
  const url = `/alt-data/narrative${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F4：跨组件高置信复合信号 — 见 docs/alt_data_audit.md § 17
export const getCompositeSignals = async (params = {}) => {
  const search = new URLSearchParams();
  const minConviction =
    params && typeof params.min_conviction === 'string'
      ? params.min_conviction.trim()
      : '';
  if (minConviction) {
    search.set('min_conviction', minConviction);
  }
  const direction =
    params && typeof params.direction === 'string' ? params.direction.trim() : '';
  if (direction) {
    search.set('direction', direction);
  }
  if (params && params.limit) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  const url = `/alt-data/composite-signals${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase E4：另类数据要点摘要时间序列归档 — 见 docs/alt_data_audit.md § 13
export const getAltDataNarrativeHistory = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && params.days) {
    search.set('days', String(params.days));
  }
  const industry =
    params && typeof params.industry === 'string' ? params.industry.trim() : '';
  if (industry) {
    search.set('industry', industry);
  }
  const query = search.toString();
  const url = `/alt-data/narrative/history${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F5：alt-data 宏观日报合成（5 段式 1 页摘要）— 见 docs/alt_data_audit.md § 19
export const getAltDataMacroBriefing = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && params.time_window_days) {
    search.set('time_window_days', String(params.time_window_days));
  }
  const query = search.toString();
  const url = `/alt-data/macro-briefing${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F5.1：alt-data 宏观日报今日 vs 昨日变化 — 见 docs/alt_data_audit.md § 20
export const getAltDataMacroBriefingDelta = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && typeof params.date === 'string' && params.date.trim()) {
    search.set('date', params.date.trim());
  }
  const query = search.toString();
  const url = `/alt-data/macro-briefing-delta${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F5.2：alt-data 宏观日报时间序列归档 — 见 docs/alt_data_audit.md § 21
export const getAltDataMacroBriefingHistory = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && params.days) {
    search.set('days', String(params.days));
  }
  if (params && params.time_window_days) {
    search.set('time_window_days', String(params.time_window_days));
  }
  const query = search.toString();
  const url = `/alt-data/macro-briefing/history${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F6：跨归档高置信长期叙事主题 — 见 docs/alt_data_audit.md § 22
export const getAltDataCrossArchiveThemes = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && params.days_window) {
    search.set('days_window', String(params.days_window));
  }
  if (params && typeof params.min_conviction === 'string' && params.min_conviction.trim()) {
    search.set('min_conviction', params.min_conviction.trim());
  }
  const query = search.toString();
  const url = `/alt-data/cross-archive-themes${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
  return response.data;
};

// Phase F4.1：跨组件复合信号时间序列归档 — 见 docs/alt_data_audit.md § 18
export const getCompositeSignalHistory = async (params = {}) => {
  const search = new URLSearchParams();
  if (params && params.days) {
    search.set('days', String(params.days));
  }
  const industry =
    params && typeof params.industry === 'string' ? params.industry.trim() : '';
  if (industry) {
    search.set('industry', industry);
  }
  const minConviction =
    params && typeof params.min_conviction === 'string'
      ? params.min_conviction.trim()
      : '';
  if (minConviction) {
    search.set('min_conviction', minConviction);
  }
  const query = search.toString();
  const url = `/alt-data/composite-signals/history${query ? `?${query}` : ''}`;
  const response = await api.get(url, withTimeoutProfile('dashboard'));
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
