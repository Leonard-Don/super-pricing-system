import { api, withTimeoutProfile } from './core';

/**
 * 行业研究领域 API：热门排名、成分股、热力图、偏好、趋势、聚类、龙头股、轮动、智能图谱、网络。
 * 路由前缀：`/industry/*`
 */

export const getHotIndustries = async (
  topN = 10,
  lookbackDays = 5,
  sortBy = 'total_score',
  order = 'desc',
  options = {},
) => {
  const response = await api.get(
    `/industry/industries/hot?top_n=${topN}&lookback_days=${lookbackDays}&sort_by=${sortBy}&order=${order}`,
    options,
  );
  return response.data;
};

export const getIndustryStocks = async (industryName, topN = 20, options = {}) => {
  const response = await api.get(
    `/industry/industries/${encodeURIComponent(industryName)}/stocks?top_n=${topN}`,
    options,
  );
  return response.data;
};

export const getIndustryStockBuildStatus = async (industryName, topN = 20, options = {}) => {
  const response = await api.get(
    `/industry/industries/${encodeURIComponent(industryName)}/stocks/status?top_n=${topN}`,
    options,
  );
  return response.data;
};

// ============ 热力图 ============
export const getIndustryHeatmap = async (days = 5, options = {}) => {
  const response = await api.get(`/industry/industries/heatmap?days=${days}`, options);
  return response.data;
};

export const getIndustryHeatmapHistory = async (params = {}, options = {}) => {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.days) search.set('days', String(params.days));
  const query = search.toString();
  const response = await api.get(`/industry/industries/heatmap/history${query ? `?${query}` : ''}`, options);
  return response.data;
};

// ============ 偏好 ============
export const getIndustryPreferences = async (options = {}) => {
  const response = await api.get('/industry/preferences', options);
  return response.data;
};

export const updateIndustryPreferences = async (payload, options = {}) => {
  const response = await api.put('/industry/preferences', payload, options);
  return response.data;
};

export const exportIndustryPreferences = async (options = {}) => {
  const response = await api.get('/industry/preferences/export', options);
  return response.data;
};

export const importIndustryPreferences = async (payload, options = {}) => {
  const response = await api.post('/industry/preferences/import', payload, options);
  return response.data;
};

// ============ 趋势 / 聚类 ============
export const getIndustryTrend = async (industryName, days = 30, options = {}) => {
  const response = await api.get(
    `/industry/industries/${encodeURIComponent(industryName)}/trend?days=${days}`,
    options,
  );
  return response.data;
};

export const getIndustryClusters = async (nClusters = 4, options = {}) => {
  const response = await api.get(`/industry/industries/clusters?n_clusters=${nClusters}`, options);
  return response.data;
};

// ============ 龙头股 ============
export const getLeaderStocks = async (topN = 20, topIndustries = 5, perIndustry = 5, listType = 'hot', options = {}) => {
  const response = await api.get('/industry/leaders', {
    ...options,
    params: {
      ...options.params,
      top_n: topN,
      top_industries: topIndustries,
      per_industry: perIndustry,
      list_type: listType,
    },
  });
  return response.data;
};

export const getLeaderDetail = async (symbol, scoreType = 'core', options = {}) => {
  const response = await api.get(`/industry/leaders/${symbol}/detail`, {
    ...options,
    params: {
      ...options.params,
      score_type: scoreType,
    },
  });
  return response.data;
};

// ============ 轮动 / 智能 / 网络 ============
export const getIndustryRotation = async (industries, periods = [], options = {}) => {
  const params = new URLSearchParams();
  params.set('industries', industries.join(','));
  if (Array.isArray(periods) && periods.length > 0) {
    params.set('periods', periods.join(','));
  }
  const response = await api.get(`/industry/industries/rotation?${params.toString()}`, options);
  return response.data;
};

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

export const checkIndustryHealth = async () => {
  const response = await api.get('/industry/health');
  return response.data;
};
