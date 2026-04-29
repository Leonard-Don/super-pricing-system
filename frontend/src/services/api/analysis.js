import { api } from './core';

/**
 * 分析与机器学习预测领域 API。
 * 路由前缀：`/analysis/*`、`/analysis/prediction/*`、`/analysis/train/*`
 */

export const analyzeTrend = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/analyze', { symbol, interval });
  return response.data;
};

export const analyzeVolumePrice = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/volume-price', { symbol, interval });
  return response.data;
};

export const analyzeSentiment = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/sentiment', { symbol, interval });
  return response.data;
};

export const recognizePatterns = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/patterns', { symbol, interval });
  return response.data;
};

export const getAnalysisOverview = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/overview', { symbol, interval });
  return response.data;
};

export const getFundamentalAnalysis = async (symbol) => {
  const response = await api.post('/analysis/fundamental', { symbol });
  return response.data;
};

export const getKlines = async (symbol, interval = '1d', limit = 150) => {
  const response = await api.post(`/analysis/klines?limit=${limit}`, { symbol, interval });
  return response.data;
};

export const predictPrice = async (symbol) => {
  const response = await api.post('/analysis/prediction', { symbol });
  return response.data;
};

// 多股票相关性分析
export const getCorrelationAnalysis = async (symbols, periodDays = 90) => {
  const response = await api.post('/analysis/correlation', {
    symbols,
    period_days: periodDays,
  });
  return response.data;
};

// ============ ML 模型预测 ============
export const compareModelPredictions = async (symbol) => {
  const response = await api.post('/analysis/prediction/compare', { symbol });
  return response.data;
};

export const predictWithLSTM = async (symbol) => {
  const response = await api.post('/analysis/prediction/lstm', { symbol });
  return response.data;
};

export const trainAllModels = async (symbol) => {
  const response = await api.post('/analysis/train/all', { symbol });
  return response.data;
};

// ============ 市场分析增强 API ============
export const getTechnicalIndicators = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/technical-indicators', { symbol, interval });
  return response.data;
};

export const getSentimentHistory = async (symbol, days = 30) => {
  const response = await api.post(`/analysis/sentiment-history?days=${days}`, { symbol });
  return response.data;
};

export const getIndustryComparison = async (symbol) => {
  const response = await api.post('/analysis/industry-comparison', { symbol });
  return response.data;
};

export const getRiskMetrics = async (symbol, interval = '1d') => {
  const response = await api.post('/analysis/risk-metrics', { symbol, interval });
  return response.data;
};
