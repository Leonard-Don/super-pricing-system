import type { paths } from '@/generated/api-types';
import api, { API_TIMEOUT_PROFILES, withTimeoutProfile } from './core';

/**
 * 资产定价研究领域 API：CAPM / Fama-French / DCF / Gap Analysis / 同行对比 / 估值历史 / 基准因子。
 * 路由前缀：`/pricing/*`
 */

// ---- Response type aliases (narrowed from generated paths) ----
type GapAnalysisResponse =
  paths['/pricing/gap-analysis']['post']['responses'][200]['content']['application/json'];

type ScreenerResponse =
  paths['/pricing/screener']['post']['responses'][200]['content']['application/json'];

type SymbolSuggestionsResponse =
  paths['/pricing/symbol-suggestions']['get']['responses'][200]['content']['application/json'];

type GapHistoryResponse =
  paths['/pricing/gap-history']['get']['responses'][200]['content']['application/json'];

type PeerComparisonResponse =
  paths['/pricing/peers']['get']['responses'][200]['content']['application/json'];

type ValuationSensitivityResponse =
  paths['/pricing/valuation-sensitivity']['post']['responses'][200]['content']['application/json'];

// ---- Request payload types (from generated schemas via paths) ----
type GapAnalysisBody =
  paths['/pricing/gap-analysis']['post']['requestBody']['content']['application/json'];

type ScreenerBody =
  paths['/pricing/screener']['post']['requestBody']['content']['application/json'];

type ValuationSensitivityBody =
  paths['/pricing/valuation-sensitivity']['post']['requestBody']['content']['application/json'];

/**
 * Run gap analysis for a single symbol.
 */
export const getGapAnalysis = async (
  symbol: string,
  period = '1y',
): Promise<GapAnalysisResponse> => {
  const body: GapAnalysisBody = { symbol, period };
  const response = await api.post<GapAnalysisResponse>(
    '/pricing/gap-analysis',
    body,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

/**
 * Batch screener: score multiple symbols in one request.
 * Uses a longer timeout headroom on top of the standard 'analysis' profile.
 */
export const runPricingScreener = async (
  symbols: string[],
  period = '1y',
  limit = 10,
  maxWorkers = 3,
): Promise<ScreenerResponse> => {
  const body: ScreenerBody = { symbols, period, limit, max_workers: maxWorkers };
  const response = await api.post<ScreenerResponse>(
    '/pricing/screener',
    body,
    withTimeoutProfile('analysis', {
      timeout: Math.max(API_TIMEOUT_PROFILES.analysis, 180000),
    }),
  );
  return response.data;
};

/**
 * Autocomplete symbol suggestions.
 */
export const getPricingSymbolSuggestions = async (
  query = '',
  limit = 8,
): Promise<SymbolSuggestionsResponse> => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('limit', String(limit));
  const response = await api.get<SymbolSuggestionsResponse>(
    `/pricing/symbol-suggestions?${params.toString()}`,
    withTimeoutProfile('standard'),
  );
  return response.data;
};

/**
 * Retrieve historical gap data for a symbol.
 */
export const getPricingGapHistory = async (
  symbol: string,
  period = '1y',
  points = 60,
): Promise<GapHistoryResponse> => {
  const params = new URLSearchParams({ symbol, period, points: String(points) });
  // Uses 'analysis' profile — cold yfinance fetches make 'dashboard' too tight.
  const response = await api.get<GapHistoryResponse>(
    `/pricing/gap-history?${params.toString()}`,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};

/**
 * Retrieve peer comparison data for a symbol.
 */
export const getPricingPeerComparison = async (
  symbol: string,
  limit = 5,
): Promise<PeerComparisonResponse> => {
  const params = new URLSearchParams({ symbol, limit: String(limit) });
  const response = await api.get<PeerComparisonResponse>(
    `/pricing/peers?${params.toString()}`,
    withTimeoutProfile('dashboard'),
  );
  return response.data;
};

/**
 * Run a valuation sensitivity analysis (DCF range / scenario table).
 */
export const getValuationSensitivityAnalysis = async (
  payload: ValuationSensitivityBody,
): Promise<ValuationSensitivityResponse> => {
  const response = await api.post<ValuationSensitivityResponse>(
    '/pricing/valuation-sensitivity',
    payload,
    withTimeoutProfile('analysis'),
  );
  return response.data;
};
