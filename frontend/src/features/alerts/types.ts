/**
 * Mispricing alert types — mirrors the PR-1 backend contract.
 */

/** Direction filter for mispricing alerts. */
export type AlertDirection = 'under' | 'over' | 'both';

/** Rule configuration stored and returned by GET/PUT /alerts/mispricing/rule. */
export interface MispricingRule {
  enabled: boolean;
  threshold_pct: number;
  direction: AlertDirection;
  min_confidence: number;
  cooldown_hours: number;
  channels: string[];
}

/** One entry from the recent-history list. */
export interface MispricingHistoryEntry {
  symbol: string;
  gap_pct: number;
  confidence: number;
  direction: AlertDirection;
  fired_at: string;
}

/** Response from GET /alerts/mispricing/history */
export interface MispricingHistoryResponse {
  history: MispricingHistoryEntry[];
}

/** One would-fire candidate from the dry-run evaluate endpoint. */
export interface WouldFireEntry {
  symbol: string;
  gap_pct: number;
  confidence: number;
  direction: AlertDirection;
}

/** Response from POST /alerts/mispricing/evaluate (dry-run, never sends). */
export interface MispricingEvaluateResponse {
  status: string;
  rule: MispricingRule;
  evaluated: number;
  would_fire: WouldFireEntry[];
}
