import { api, withTimeoutProfile } from './core';

/**
 * 内部行业研究支撑 API：供 Quant Lab 行业实验和历史研究快照复用。
 * 面向使用者的公开行业热度工作台属于独立的 `quant-trading-system`。
 * 路由前缀：`/industry/*`
 */

export const getIndustryIntelligence = async (topN = 12, lookbackDays = 5, options = {}) => {
  const response = await api.get(
    `/industry/industries/intelligence?top_n=${topN}&lookback_days=${lookbackDays}&mode=fast`,
    withTimeoutProfile('dashboard', options),
  );
  return response.data;
};

export const getIndustryNetwork = async (topN = 18, lookbackDays = 5, minSimilarity = 0.92, options = {}) => {
  const response = await api.get(
    `/industry/industries/network?top_n=${topN}&lookback_days=${lookbackDays}&min_similarity=${minSimilarity}&mode=fast`,
    withTimeoutProfile('dashboard', options),
  );
  return response.data;
};
