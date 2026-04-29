import { api, parseFilenameFromDisposition, withTimeoutProfile } from './core';

/**
 * 回测领域 API：单标的 / 组合 / 批量 / Walk-Forward / Monte Carlo / 多周期 / 显著性 / 影响分析
 * 路由前缀：`/strategies`、`/market-data`、`/backtest`
 */

export const getStrategies = async () => {
  const response = await api.get('/strategies');
  return response.data;
};

export const getMarketData = async (params) => {
  const response = await api.post('/market-data', params);
  return response.data;
};

export const runBacktest = async (params) => {
  const response = await api.post('/backtest', params);
  return response.data;
};

export const getBacktestHistory = async (limit = 20, filters = {}, offset = 0, options = {}) => {
  const params = new URLSearchParams({ limit: String(limit) });
  params.set('offset', String(offset));
  if (options.summaryOnly !== false) {
    params.set('summary_only', 'true');
  }
  if (filters.symbol) {
    params.set('symbol', filters.symbol);
  }
  if (filters.strategy) {
    params.set('strategy', filters.strategy);
  }
  if (filters.recordType) {
    params.set('record_type', filters.recordType);
  }
  const response = await api.get(`/backtest/history?${params.toString()}`);
  return response.data;
};

export const getBacktestHistoryStats = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.symbol) {
    params.set('symbol', filters.symbol);
  }
  if (filters.strategy) {
    params.set('strategy', filters.strategy);
  }
  if (filters.recordType) {
    params.set('record_type', filters.recordType);
  }
  const query = params.toString();
  const response = await api.get(`/backtest/history/stats${query ? `?${query}` : ''}`);
  return response.data;
};

export const getBacktestRecord = async (recordId) => {
  const response = await api.get(`/backtest/history/${recordId}`);
  return response.data;
};

export const deleteBacktestRecord = async (recordId) => {
  const response = await api.delete(`/backtest/history/${recordId}`);
  return response.data;
};

export const saveAdvancedHistoryRecord = async (payload) => {
  const response = await api.post('/backtest/history/advanced', payload);
  return response.data;
};

export const downloadBacktestReport = async (data) => {
  const response = await api.post('/backtest/report', data, {
    responseType: 'blob',
  });

  return {
    blob: response.data,
    filename: parseFilenameFromDisposition(response.headers['content-disposition']),
    contentType: response.headers['content-type'] || 'application/pdf',
  };
};

export const compareStrategies = async (
  symbolOrPayload,
  strategies,
  startDate,
  endDate,
  initialCapital = 10000,
  commission = 0.001,
  slippage = 0.001,
) => {
  const payload = typeof symbolOrPayload === 'object' && symbolOrPayload !== null
    ? symbolOrPayload
    : {
        symbol: symbolOrPayload,
        strategies,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
        initial_capital: initialCapital,
        commission,
        slippage,
      };

  const response = await api.post('/backtest/compare', payload);
  return response.data;
};

export const runBatchBacktest = async (payload) => {
  const response = await api.post('/backtest/batch', payload);
  return response.data;
};

export const runWalkForwardBacktest = async (payload) => {
  const response = await api.post('/backtest/walk-forward', payload);
  return response.data;
};

export const runMarketRegimeBacktest = async (payload) => {
  const response = await api.post('/backtest/market-regimes', payload);
  return response.data;
};

export const runBacktestMonteCarlo = async (payload) => {
  const response = await api.post('/backtest/monte-carlo', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueBacktestMonteCarlo = async (payload) => {
  const response = await api.post('/backtest/monte-carlo/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const runMarketImpactAnalysis = async (payload) => {
  const response = await api.post('/backtest/impact-analysis', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueMarketImpactAnalysis = async (payload) => {
  const response = await api.post('/backtest/impact-analysis/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const compareStrategySignificance = async (payload) => {
  const response = await api.post('/backtest/compare/significance', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueStrategySignificance = async (payload) => {
  const response = await api.post('/backtest/compare/significance/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const runMultiPeriodBacktest = async (payload) => {
  const response = await api.post('/backtest/multi-period', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueMultiPeriodBacktest = async (payload) => {
  const response = await api.post('/backtest/multi-period/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const runPortfolioStrategyBacktest = async (payload) => {
  const response = await api.post('/backtest/portfolio-strategy', payload);
  return response.data;
};
