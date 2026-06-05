import { startTransition, useCallback, useMemo, useState } from 'react';

import {
  runPricingScreener,
} from '@/services/api/pricing';
import { DEFAULT_SCREENING_UNIVERSE } from '@/features/pricing/lib/constants';
import {
  parsePricingUniverseInput,
  sortScreeningRows,
  type ScreeningRow,
} from '@/features/pricing/lib/pricingResearch';

// Re-export so callers that previously imported ScreeningRow from this module
// continue to work without modification.
export type { ScreeningRow };

export type ScreeningFilterValue =
  | 'all'
  | 'undervalued'
  | 'high-confidence'
  | 'aligned'
  | 'governance-risk'
  | 'governance-support';

export interface ScreeningMeta {
  analyzedCount: number;
  totalInput: number;
  failureCount: number;
  failures: string[];
}

export interface ScreeningProgress {
  completed: number;
  total: number;
  running: boolean;
}

export interface UsePricingScreeningParams {
  handleAnalyze: (symbol?: string | null, period?: string | null) => void;
  initialScreeningFilter?: ScreeningFilterValue;
  initialScreeningMinScore?: number;
  initialScreeningSector?: string;
  period: string;
  setSymbol: (symbol: string) => void;
}

export interface UsePricingScreeningResult {
  filteredScreeningResults: (ScreeningRow & { rank: number })[];
  handleApplyPreset: (symbols: string[]) => void;
  handleExportScreening: () => void;
  handleInspectScreeningResult: (record: ScreeningRow) => void;
  handleRunScreener: () => Promise<void>;
  screeningError: string | null;
  screeningFilter: ScreeningFilterValue;
  screeningLoading: boolean;
  screeningMeta: ScreeningMeta | null;
  screeningMinScore: number;
  screeningProgress: ScreeningProgress;
  screeningResults: (ScreeningRow & { rank: number })[];
  screeningSector: string;
  screeningSectors: string[];
  screeningUniverse: string;
  setScreeningFilter: (filter: ScreeningFilterValue) => void;
  setScreeningMinScore: (score: number) => void;
  setScreeningSector: (sector: string) => void;
  setScreeningUniverse: (universe: string) => void;
}

export default function usePricingScreening({
  handleAnalyze,
  initialScreeningFilter = 'all',
  initialScreeningMinScore = 0,
  initialScreeningSector = 'all',
  period,
  setSymbol,
}: UsePricingScreeningParams): UsePricingScreeningResult {
  const [screeningUniverse, setScreeningUniverse] = useState<string>(DEFAULT_SCREENING_UNIVERSE);
  const [screeningLoading, setScreeningLoading] = useState<boolean>(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const [screeningResults, setScreeningResults] = useState<(ScreeningRow & { rank: number })[]>([]);
  const [screeningMeta, setScreeningMeta] = useState<ScreeningMeta | null>(null);
  const [screeningProgress, setScreeningProgress] = useState<ScreeningProgress>({
    completed: 0,
    total: 0,
    running: false,
  });
  const [screeningFilter, setScreeningFilter] = useState<ScreeningFilterValue>(
    initialScreeningFilter || 'all',
  );
  const [screeningSector, setScreeningSector] = useState<string>(
    initialScreeningSector || 'all',
  );
  const [screeningMinScore, setScreeningMinScore] = useState<number>(
    Number(initialScreeningMinScore || 0),
  );

  const filteredScreeningResults = useMemo(
    () =>
      screeningResults.filter((item) => {
        if (screeningFilter === 'undervalued' && item.primary_view !== '低估') return false;
        if (
          screeningFilter === 'high-confidence' &&
          Number(item.confidence_score ?? 0) < 0.72
        )
          return false;
        if (
          screeningFilter === 'aligned' &&
          item.factor_alignment_status !== 'aligned'
        )
          return false;
        if (
          screeningFilter === 'governance-risk' &&
          Number(item.people_governance_discount_pct ?? 0) < 5
        )
          return false;
        if (
          screeningFilter === 'governance-support' &&
          Number(item.people_governance_discount_pct ?? 0) > -3
        )
          return false;
        if (
          screeningSector !== 'all' &&
          (item.sector || '未知板块') !== screeningSector
        )
          return false;
        if (
          Number(item.screening_score ?? 0) < Number(screeningMinScore || 0)
        )
          return false;
        return true;
      }),
    [screeningFilter, screeningMinScore, screeningResults, screeningSector],
  );

  const screeningSectors = useMemo(() => {
    const sectors = Array.from(
      new Set(
        screeningResults
          .map((item) => item.sector || '未知板块')
          .filter(Boolean),
      ),
    );
    return sectors.sort();
  }, [screeningResults]);

  const handleRunScreener = useCallback(async () => {
    const symbols = parsePricingUniverseInput(screeningUniverse);
    if (!symbols.length) {
      // In the web version we don't use antd message — just bail silently.
      // The UI layer should handle empty-universe UX.
      return;
    }

    setScreeningLoading(true);
    setScreeningError(null);
    setScreeningResults([]);
    setScreeningProgress({ completed: 0, total: symbols.length, running: true });
    try {
      const payload = await runPricingScreener(
        symbols,
        period,
        Math.min(10, symbols.length),
        Math.min(3, symbols.length),
      );
      const rawResults = (
        (payload as Record<string, unknown>)?.results as ScreeningRow[] | undefined
      ) ?? [];
      const sorted = sortScreeningRows(
        rawResults.map((row) => ({
          ...row,
          sector: row?.sector || '',
        })),
      ) as (ScreeningRow & { rank: number })[];
      setScreeningResults(sorted);
      const payloadAny = payload as Record<string, unknown>;
      setScreeningMeta({
        analyzedCount: Number(payloadAny?.analyzed_count ?? sorted.length),
        totalInput: Number(payloadAny?.total_input ?? symbols.length),
        failureCount: Number(
          ((payloadAny?.failures as unknown[]) || []).length,
        ),
        failures: (payloadAny?.failures as string[]) || [],
      });
      setScreeningProgress({
        completed: symbols.length,
        total: symbols.length,
        running: false,
      });
    } catch (err) {
      const e = err as { userMessage?: string; message?: string };
      setScreeningError(e.userMessage ?? e.message ?? '候选池筛选失败');
      setScreeningResults([]);
      setScreeningMeta(null);
    } finally {
      setScreeningLoading(false);
      setScreeningProgress((prev) => ({ ...prev, running: false }));
    }
  }, [period, screeningUniverse]);

  const handleInspectScreeningResult = useCallback(
    (record: ScreeningRow) => {
      if (!record?.symbol) return;
      startTransition(() => {
        setSymbol(record.symbol);
      });
      handleAnalyze(record.symbol, period);
    },
    [handleAnalyze, period, setSymbol],
  );

  const handleApplyPreset = useCallback((symbols: string[]) => {
    setScreeningUniverse(symbols.join('\n'));
  }, []);

  const handleExportScreening = useCallback(() => {
    if (!screeningResults.length) return;
    const header = [
      'Rank',
      'Symbol',
      'Company',
      'Score',
      'View',
      'GapPct',
      'GovernanceDiscountPct',
      'GovernanceLabel',
      'Confidence',
      'Alignment',
      'Driver',
    ];
    const rows = screeningResults.map((item) => [
      item.rank,
      item.symbol,
      item.company_name || '',
      item.screening_score,
      item.primary_view || '',
      item.gap_pct ?? '',
      item.people_governance_discount_pct ?? '',
      item.people_governance_label || '',
      item.confidence_score ?? '',
      item.factor_alignment_label || '',
      item.primary_driver || '',
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pricing-screener-${period}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }, [period, screeningResults]);

  return {
    filteredScreeningResults,
    handleApplyPreset,
    handleExportScreening,
    handleInspectScreeningResult,
    handleRunScreener,
    screeningError,
    screeningFilter,
    screeningLoading,
    screeningMeta,
    screeningMinScore,
    screeningProgress,
    screeningResults,
    screeningSector,
    screeningSectors,
    screeningUniverse,
    setScreeningFilter,
    setScreeningMinScore,
    setScreeningSector,
    setScreeningUniverse,
  };
}
