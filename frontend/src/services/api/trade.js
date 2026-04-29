import { api } from './core';

/**
 * 交易领域 API：组合查询、下单、历史、重置、事件摘要。
 * 路由前缀：`/trade/*`、`/events/*`
 */

export const getPortfolio = async () => {
  const response = await api.get('/trade/portfolio');
  return response.data;
};

export const executeTrade = async (symbol, action, quantity, price = null) => {
  const response = await api.post('/trade/execute', {
    symbol,
    action,
    quantity,
    price,
  });
  return response.data;
};

export const getTradeHistory = async (limit = 50) => {
  const response = await api.get(`/trade/history?limit=${limit}`);
  return response.data;
};

export const resetAccount = async () => {
  const response = await api.post('/trade/reset');
  return response.data;
};

// 事件 API（trade 领域复用）
export const getEventSummary = async (symbol) => {
  const response = await api.post('/events/summary', { symbol });
  return response.data;
};
