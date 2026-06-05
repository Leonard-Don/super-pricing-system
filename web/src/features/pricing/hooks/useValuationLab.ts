/**
 * useValuationLab
 *
 * Small local hook managing form state, submission, loading, and result
 * for the QuantLab valuation panel (ValuationLabPage).
 *
 * Async queue (queueQuantValuationLab) is NOT wired here — a TODO marker is
 * left below; sync-only path is sufficient for P1.
 */

import { useState, useCallback } from 'react';
import { runQuantValuationLab } from '@/services/api/quantLab';

// ---------------------------------------------------------------------------
// Narrow types for the response fields we read
// (API schema returns `unknown`, so we declare what we consume)
// ---------------------------------------------------------------------------

export interface ValuationModel {
  model: string;
  value: number;
  weight: number;
}

export interface EnsembleValuation {
  fair_value: number;
  gap_pct: number;
  models: ValuationModel[];
}

export interface ValuationHistoryRow {
  timestamp: string;
  fair_value: number;
  market_price: number;
  gap_pct: number;
}

export interface PeerRow {
  symbol: string;
  is_target?: boolean;
  peer_source?: string;
  current_price?: number | null;
  fair_value?: number | null;
  premium_discount?: number | null;
  pe_ratio?: number | null;
  price_to_sales?: number | null;
  revenue_growth?: number | null;
  earnings_growth?: number | null;
  return_on_equity?: number | null;
  profit_margin?: number | null;
  value_score?: number | null;
  growth_score?: number | null;
  quality_score?: number | null;
}

export interface PeerMatrixSummary {
  peer_count?: number;
  custom_peer_count?: number;
  median_peer_premium_discount?: number | null;
}

export interface PeerMatrix {
  sector?: string;
  industry?: string;
  summary?: PeerMatrixSummary;
  rows?: PeerRow[];
}

export interface ValuationLabResult {
  ensemble_valuation?: EnsembleValuation;
  analysis?: {
    valuation?: {
      current_price?: number;
    };
  };
  valuation_history?: ValuationHistoryRow[];
  peer_matrix?: PeerMatrix;
}

// ---------------------------------------------------------------------------
// Narrow helper: cast unknown API response to ValuationLabResult
// ---------------------------------------------------------------------------
function narrowResult(raw: unknown): ValuationLabResult {
  if (raw !== null && typeof raw === 'object') {
    return raw as ValuationLabResult;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export interface ValuationLabForm {
  symbol: string;
  period: string;
  peer_limit: number;
  peer_symbols: string;
}

const INITIAL_FORM: ValuationLabForm = {
  symbol: 'AAPL',
  period: '1y',
  peer_limit: 6,
  peer_symbols: 'MSFT, NVDA, GOOGL, AMZN',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseValuationLabResult {
  form: ValuationLabForm;
  setForm: React.Dispatch<React.SetStateAction<ValuationLabForm>>;
  loading: boolean;
  error: string | null;
  result: ValuationLabResult | null;
  handleSubmit: () => Promise<void>;
}

export default function useValuationLab(): UseValuationLabResult {
  const [form, setForm] = useState<ValuationLabForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValuationLabResult | null>(null);

  // TODO (optional / P2): wire async queue via queueQuantValuationLab for
  // long-running valuations. Currently sync-only; add a "异步排队" button
  // and job-polling logic when implementing.

  const handleSubmit = useCallback(async () => {
    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) return;

    setLoading(true);
    setError(null);
    try {
      const peerSymbolsArr = form.peer_symbols
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      const raw = await runQuantValuationLab({
        symbol,
        period: form.period,
        peer_limit: form.peer_limit,
        peer_symbols: peerSymbolsArr,
      });

      setResult(narrowResult(raw));
    } catch (err) {
      const e = err as { userMessage?: string; message?: string };
      setError(e.userMessage ?? e.message ?? '估值失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [form]);

  return { form, setForm, loading, error, result, handleSubmit };
}
