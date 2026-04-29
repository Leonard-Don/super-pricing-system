import { api, API_TIMEOUT_PROFILES, withTimeoutProfile } from './core';

/**
 * 资产定价研究领域 API：CAPM / Fama-French / DCF / Gap Analysis / 同行对比 / 估值历史 / 基准因子。
 * 路由前缀：`/pricing/*`
 */

export const getFactorModelAnalysis = async (symbol, period = '1y') => {
  const response = await api.post('/pricing/factor-model', { symbol, period }, withTimeoutProfile('analysis'));
  return response.data;
};

export const getValuationAnalysis = async (symbol) => {
  const response = await api.post('/pricing/valuation', { symbol }, withTimeoutProfile('analysis'));
  return response.data;
};

export const getValuationSensitivityAnalysis = async (payload) => {
  const response = await api.post('/pricing/valuation-sensitivity', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const getGapAnalysis = async (symbol, period = '1y') => {
  const response = await api.post('/pricing/gap-analysis', { symbol, period }, withTimeoutProfile('analysis'));
  return response.data;
};

export const runPricingScreener = async (symbols, period = '1y', limit = 10, maxWorkers = 3) => {
  const response = await api.post(
    '/pricing/screener',
    { symbols, period, limit, max_workers: maxWorkers },
    withTimeoutProfile('analysis', { timeout: Math.max(API_TIMEOUT_PROFILES.analysis, 180000) }),
  );
  return response.data;
};

export const getPricingSymbolSuggestions = async (query = '', limit = 8) => {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  params.set('limit', String(limit));
  const response = await api.get(`/pricing/symbol-suggestions?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

export const getPricingGapHistory = async (symbol, period = '1y', points = 60) => {
  const params = new URLSearchParams({
    symbol,
    period,
    points: String(points),
  });
  const response = await api.get(`/pricing/gap-history?${params.toString()}`, withTimeoutProfile('dashboard'));
  return response.data;
};

export const getPricingPeerComparison = async (symbol, limit = 5) => {
  const params = new URLSearchParams({
    symbol,
    limit: String(limit),
  });
  const response = await api.get(`/pricing/peers?${params.toString()}`, withTimeoutProfile('dashboard'));
  return response.data;
};

export const getBenchmarkFactors = async () => {
  const response = await api.get('/pricing/benchmark-factors', withTimeoutProfile('standard'));
  return response.data;
};
