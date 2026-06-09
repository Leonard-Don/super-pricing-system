import api, { withTimeoutProfile } from './core';

/**
 * 实时行情偏好 API。
 * 路由前缀：`/realtime/*`
 */

interface PreferencesResponse {
  success: boolean;
  data: {
    symbols: string[];
    [key: string]: unknown;
  };
}

/**
 * Fetch the user's watchlist symbols from their realtime preferences.
 */
export const fetchWatchlistSymbols = async (): Promise<string[]> => {
  const response = await api.get<PreferencesResponse>(
    '/realtime/preferences',
    withTimeoutProfile('standard'),
  );
  const symbols = response.data?.data?.symbols;
  return Array.isArray(symbols) ? symbols : [];
};
