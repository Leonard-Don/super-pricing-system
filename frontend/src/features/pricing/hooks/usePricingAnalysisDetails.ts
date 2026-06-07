import { startTransition, useEffect, useState } from 'react';

import {
  getPricingGapHistory,
  getPricingPeerComparison,
} from '@/services/api/pricing';
import { resolveAnalysisSymbol } from '@/features/pricing/lib/pricingResearch';

export interface UsePricingAnalysisDetailsParams {
  data: Record<string, unknown> | null | undefined;
  period: string;
  symbol: string;
}

export interface UsePricingAnalysisDetailsResult {
  gapHistory: unknown;
  gapHistoryError: string | null;
  gapHistoryLoading: boolean;
  peerComparison: unknown;
  peerComparisonError: string | null;
  peerComparisonLoading: boolean;
}

export default function usePricingAnalysisDetails({
  data,
  period,
  symbol,
}: UsePricingAnalysisDetailsParams): UsePricingAnalysisDetailsResult {
  const [gapHistory, setGapHistory] = useState<unknown>(null);
  const [gapHistoryLoading, setGapHistoryLoading] = useState<boolean>(false);
  const [gapHistoryError, setGapHistoryError] = useState<string | null>(null);
  const [peerComparison, setPeerComparison] = useState<unknown>(null);
  const [peerComparisonLoading, setPeerComparisonLoading] = useState<boolean>(false);
  const [peerComparisonError, setPeerComparisonError] = useState<string | null>(null);

  useEffect(() => {
    const targetSymbol = resolveAnalysisSymbol(
      (data as Record<string, unknown> | null | undefined)?.symbol,
      symbol,
    );
    if (!data || !targetSymbol) {
      startTransition(() => {
        setGapHistory(null);
        setGapHistoryError(null);
        setPeerComparison(null);
        setPeerComparisonError(null);
      });
      return;
    }

    let active = true;
    startTransition(() => {
      setGapHistoryLoading(true);
      setGapHistoryError(null);
      setPeerComparisonLoading(true);
      setPeerComparisonError(null);
    });

    getPricingGapHistory(targetSymbol, period, 72)
      .then((payload) => {
        if (!active) return;
        const p = payload as Record<string, unknown>;
        if (p?.error) {
          setGapHistory(null);
          setGapHistoryError(String(p.error));
          return;
        }
        setGapHistory(payload);
      })
      .catch((err: { userMessage?: string; message?: string }) => {
        if (!active) return;
        setGapHistory(null);
        setGapHistoryError(err.userMessage ?? err.message ?? '历史偏差数据加载失败');
      })
      .finally(() => {
        if (active) setGapHistoryLoading(false);
      });

    getPricingPeerComparison(targetSymbol, 5)
      .then((payload) => {
        if (!active) return;
        const p = payload as Record<string, unknown>;
        if (p?.error) {
          setPeerComparison(null);
          setPeerComparisonError(String(p.error));
          return;
        }
        setPeerComparison(payload);
      })
      .catch((err: { userMessage?: string; message?: string }) => {
        if (!active) return;
        setPeerComparison(null);
        setPeerComparisonError(err.userMessage ?? err.message ?? '同行估值对比加载失败');
      })
      .finally(() => {
        if (active) setPeerComparisonLoading(false);
      });

    return () => {
      active = false;
    };
  }, [data, period, symbol]);

  return {
    gapHistory,
    gapHistoryError,
    gapHistoryLoading,
    peerComparison,
    peerComparisonError,
    peerComparisonLoading,
  };
}
