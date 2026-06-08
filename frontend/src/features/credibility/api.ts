/**
 * Credibility API client — wraps the three credibility endpoints.
 * Uses the shared axios core so auth + error normalisation are handled centrally.
 */
import api from '@/services/api/core';
import type { CredibilityResponse } from './types';

/**
 * Per-stock pricing-signal credibility.
 * @param symbol  Ticker, e.g. "AAPL"
 * @param horizons Comma-separated trading-day horizons, default "5,20,60"
 */
export const fetchPricingCredibility = async (
  symbol: string,
  horizons = '5,20,60',
): Promise<CredibilityResponse> => {
  const response = await api.get<CredibilityResponse>('/credibility/pricing', {
    params: { symbol, horizons },
  });
  return response.data;
};

/**
 * Macro-factor credibility (cross-asset / regime signals).
 */
export const fetchMacroCredibility = async (): Promise<CredibilityResponse> => {
  const response = await api.get<CredibilityResponse>('/credibility/macro');
  return response.data;
};

/**
 * Cross-sectional screener ranking credibility.
 * Returns an accumulating envelope when the ranking store has insufficient history.
 */
export const fetchScreenerCredibility = async (): Promise<CredibilityResponse> => {
  const response = await api.get<CredibilityResponse>('/credibility/screener');
  return response.data;
};
