import { api, API_TIMEOUT_PROFILES, withTimeoutProfile } from './core';

/**
 * Quant Lab 领域 API：策略优化、风险归因、估值实验、因子表达式、行业轮动、告警编排、交易日志、数据质量。
 * 路由前缀：`/quant-lab/*`、`/optimization/optimize`
 */

export const optimizePortfolio = async (symbols, period = '1y', objective = 'max_sharpe') => {
  const response = await api.post('/optimization/optimize', { symbols, period, objective });
  return response.data;
};

export const runStrategyOptimizer = async (payload) => {
  const response = await api.post('/quant-lab/optimizer', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueStrategyOptimizerTask = async (payload) => {
  const response = await api.post('/quant-lab/optimizer/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getRiskCenterAnalysis = async (payload) => {
  const response = await api.post('/quant-lab/risk-center', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueQuantRiskCenterTask = async (payload) => {
  const response = await api.post('/quant-lab/risk-center/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 交易日志 ============
export const getQuantTradingJournal = async (profileId) => {
  const response = await api.get('/quant-lab/trading-journal', {
    params: profileId ? { profile_id: profileId } : undefined,
  });
  return response.data;
};

export const updateQuantTradingJournal = async (payload, profileId) => {
  const response = await api.put('/quant-lab/trading-journal', payload, {
    params: profileId ? { profile_id: profileId } : undefined,
  });
  return response.data;
};

// ============ 告警编排 ============
export const getQuantAlertOrchestration = async (profileId) => {
  const response = await api.get('/quant-lab/alerts', {
    params: profileId ? { profile_id: profileId } : undefined,
  });
  return response.data;
};

export const updateQuantAlertOrchestration = async (payload, profileId) => {
  const response = await api.put('/quant-lab/alerts', payload, {
    params: profileId ? { profile_id: profileId } : undefined,
  });
  return response.data;
};

export const publishQuantAlertEvent = async (payload, profileId) => {
  const response = await api.post('/quant-lab/alerts/publish', payload, {
    params: profileId ? { profile_id: profileId } : undefined,
  });
  return response.data;
};

// ============ 数据质量 ============
export const getQuantDataQuality = async () => {
  const response = await api.get('/quant-lab/data-quality');
  return response.data;
};

// ============ 估值实验 ============
export const runQuantValuationLab = async (payload) => {
  const response = await api.post('/quant-lab/valuation-lab', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueQuantValuationLab = async (payload) => {
  const response = await api.post('/quant-lab/valuation-lab/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 行业轮动 ============
export const runQuantIndustryRotationLab = async (payload) => {
  const response = await api.post(
    '/quant-lab/industry-rotation',
    payload,
    withTimeoutProfile('analysis', { timeout: Math.max(API_TIMEOUT_PROFILES.analysis, 180000) }),
  );
  return response.data;
};

export const queueQuantIndustryRotationLab = async (payload) => {
  const response = await api.post('/quant-lab/industry-rotation/async', payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 因子表达式 ============
export const runQuantFactorExpression = async (payload) => {
  const response = await api.post('/quant-lab/factor-expression', payload, withTimeoutProfile('analysis'));
  return response.data;
};

export const queueQuantFactorExpressionTask = async (payload) => {
  const response = await api.post('/quant-lab/factor-expression/async', payload, withTimeoutProfile('standard'));
  return response.data;
};
