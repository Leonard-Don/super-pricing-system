/**
 * useFactorLab
 *
 * Small local hook managing form state, submission, loading, and result
 * for the QuantLab factor-expression panel (FactorLabPage).
 *
 * Async queue (queueQuantFactorExpressionTask) is NOT wired here — a TODO
 * marker is left below; sync-only path is sufficient for P1.
 */

import { useState, useCallback } from 'react';
import { runQuantFactorExpression } from '@/services/api/quantLab';

// ---------------------------------------------------------------------------
// Default expression — matches QuantLabFactorPanel.js FACTOR_INITIAL_VALUES
// ---------------------------------------------------------------------------
export const DEFAULT_FACTOR_EXPRESSION =
  'rank(close / sma(close, 20)) + rank(volume / sma(volume, 20))';

// ---------------------------------------------------------------------------
// Narrow types for the response fields we read
// (API schema returns `unknown`, so we declare what we consume)
// ---------------------------------------------------------------------------

export interface FactorPreviewRow {
  date: string;
  factor: number | null;
}

export interface FactorDiagnostics {
  non_null_factor_points: number;
  rows: number;
}

export interface FactorLabResult {
  latest_value: number | null;
  diagnostics?: FactorDiagnostics;
  preview?: FactorPreviewRow[];
}

// ---------------------------------------------------------------------------
// Narrow helper: cast unknown API response to FactorLabResult
// ---------------------------------------------------------------------------
function narrowResult(raw: unknown): FactorLabResult {
  if (raw !== null && typeof raw === 'object') {
    return raw as FactorLabResult;
  }
  return { latest_value: null };
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export interface FactorLabForm {
  symbol: string;
  period: string;
  preview_rows: number;
  expression: string;
}

const INITIAL_FORM: FactorLabForm = {
  symbol: 'AAPL',
  period: '1y',
  preview_rows: 30,
  expression: DEFAULT_FACTOR_EXPRESSION,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseFactorLabResult {
  form: FactorLabForm;
  setForm: React.Dispatch<React.SetStateAction<FactorLabForm>>;
  loading: boolean;
  error: string | null;
  result: FactorLabResult | null;
  handleSubmit: () => Promise<void>;
}

export default function useFactorLab(): UseFactorLabResult {
  const [form, setForm] = useState<FactorLabForm>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FactorLabResult | null>(null);

  // TODO (optional / P2): wire async queue via queueQuantFactorExpressionTask
  // for long-running factor computations. Currently sync-only; add a
  // "异步排队" button and job-polling logic when implementing.

  const handleSubmit = useCallback(async () => {
    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol) return;

    setLoading(true);
    setError(null);
    try {
      const raw = await runQuantFactorExpression({
        symbol,
        period: form.period,
        preview_rows: form.preview_rows,
        expression: form.expression,
      });

      setResult(narrowResult(raw));
    } catch (err) {
      const e = err as { userMessage?: string; message?: string };
      setError(e.userMessage ?? e.message ?? '因子计算失败');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [form]);

  return { form, setForm, loading, error, result, handleSubmit };
}
