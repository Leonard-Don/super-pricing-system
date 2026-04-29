import { api, withTimeoutProfile } from './core';

/**
 * 跨市场领域 API：模板、组合回测。
 * 路由前缀：`/cross-market/*`
 */

export const getCrossMarketTemplates = async () => {
  const response = await api.get('/cross-market/templates', withTimeoutProfile('dashboard'));
  return response.data;
};

export const runCrossMarketBacktest = async (payload) => {
  const response = await api.post('/cross-market/backtest', payload, withTimeoutProfile('analysis'));
  return response.data;
};
