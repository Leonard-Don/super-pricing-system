/**
 * useWatchlistReport — orchestrates:
 *   fetchWatchlistSymbols → runPricingScreener → buildWatchlistReportRows
 *   exposes generateAndPrint() (HTML + print window, CSV fallback on popup-block)
 *          downloadCsv()
 *          loading / error / isEmpty state
 */

import { useCallback, useState } from 'react';

import { fetchWatchlistSymbols } from '@/services/api/realtime';
import { runPricingScreener } from '@/services/api/pricing';
import { openPricingResearchPrintWindow } from '@/features/pricing/lib/report';
import type { ScreeningRow } from '@/features/pricing/lib/pricingResearch';
import {
  buildWatchlistReportRows,
  buildWatchlistReportHtml,
  buildWatchlistReportCsv,
} from '../lib/watchlistReport';

export interface UseWatchlistReportResult {
  generateAndPrint: () => Promise<void>;
  downloadCsv: () => Promise<void>;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
}

export default function useWatchlistReport(): UseWatchlistReportResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  /**
   * Fetch symbols + run screener, return shaped rows (or null on empty/error).
   */
  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsEmpty(false);
    try {
      const symbols = await fetchWatchlistSymbols();
      if (!symbols.length) {
        setIsEmpty(true);
        return null;
      }

      const payload = await runPricingScreener(
        symbols,
        '1y',
        symbols.length,
        Math.min(6, symbols.length),
      );
      const rawResults = (
        (payload as Record<string, unknown>)?.results as ScreeningRow[] | undefined
      ) ?? [];

      return buildWatchlistReportRows(rawResults);
    } catch (err) {
      const e = err as { userMessage?: string; message?: string };
      setError(e.userMessage ?? e.message ?? '报告生成失败，请稍后重试');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateAndPrint = useCallback(async () => {
    const rows = await fetchRows();
    if (!rows) return;

    const html = buildWatchlistReportHtml(rows, {
      generatedAt: new Date().toLocaleString('zh-CN'),
    });

    const opened = openPricingResearchPrintWindow(html);
    if (!opened) {
      // Popup blocked — fall back to CSV download
      buildWatchlistReportCsv(rows);
    }
  }, [fetchRows]);

  const downloadCsv = useCallback(async () => {
    const rows = await fetchRows();
    if (!rows) return;
    buildWatchlistReportCsv(rows);
  }, [fetchRows]);

  return { generateAndPrint, downloadCsv, loading, error, isEmpty };
}
