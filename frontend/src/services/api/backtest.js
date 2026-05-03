import { api, withTimeoutProfile } from './core';

/**
 * 内部回测支撑 API：供 Quant Lab、历史快照和本地验证脚本复用。
 * 面向使用者的公开回测工作台属于独立的 `quant-trading-system`。
 * 路由前缀：`/strategies`、`/backtest`
 */

export const getStrategies = async () => {
  const response = await api.get('/strategies');
  return response.data;
};

export const runBacktest = async (params) => {
  const response = await api.post('/backtest', params);
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
