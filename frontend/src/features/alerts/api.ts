/**
 * Mispricing alert API client.
 *
 * Paths are backend-root-relative (the axios core maps the /api proxy).
 * Use `/alerts/mispricing/*`, NOT `/api/v1/…`.
 */
import api from '@/services/api/core';
import type {
  MispricingRule,
  MispricingHistoryResponse,
  MispricingEvaluateResponse,
} from './types';

/** Fetch the current alert rule configuration. */
export const fetchMispricingRule = async (): Promise<MispricingRule> => {
  const response = await api.get<MispricingRule>('/alerts/mispricing/rule');
  return response.data;
};

/** Persist an updated alert rule. Returns the normalized rule. */
export const saveMispricingRule = async (rule: MispricingRule): Promise<MispricingRule> => {
  const response = await api.put<MispricingRule>('/alerts/mispricing/rule', rule);
  return response.data;
};

/** Fetch recent alert firing history (latest 50 entries). */
export const fetchMispricingHistory = async (): Promise<MispricingHistoryResponse> => {
  const response = await api.get<MispricingHistoryResponse>('/alerts/mispricing/history', {
    params: { limit: 50 },
  });
  return response.data;
};

/**
 * Dry-run evaluate — checks which positions would fire under the current rule.
 * Never sends actual notifications.
 */
export const evaluateMispricing = async (): Promise<MispricingEvaluateResponse> => {
  const response = await api.post<MispricingEvaluateResponse>('/alerts/mispricing/evaluate');
  return response.data;
};
