// ---------------------------------------------------------------------------
// usePricingResearchData — P1 trimmed version
//
// Trimmed (intentionally, per plan):
//   - workbench context auto-trigger: removed (P3)
//   - queueResumeHint / canReturnToWorkbenchQueue: removed (P3)
//   - playbook (buildPricingPlaybook): removed (P3)
//   - usePricingWorkbenchActions (handleSaveTask / handleUpdateSnapshot /
//     handleExportAudit / handleExportReport / savedTaskId / savingTask /
//     updatingSnapshot): removed (P3)
//   - handleOpenMacroMispricingDraft: removed (P3 — macro draft service not ported)
//   - handleReturnToWorkbenchNextTask: removed (P3)
//   - URL sync: simplified — only symbol + period in hash search params via
//     history.replaceState; popstate still fires syncFromUrl
//
// What remains: symbol/period/data/loading/error + URL sync + compose of
//   the 4 sub-hooks (search, screening, analysisDetails, sensitivity).
// ---------------------------------------------------------------------------

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

import { getGapAnalysis } from '@/services/api/pricing';
import { HOT_PRICING_SYMBOLS } from '@/features/pricing/lib/pricingResearch';
import { ALIGNMENT_TAG_COLORS } from '@/features/pricing/lib/constants';

import usePricingSearch, {
  type UsePricingSearchResult,
} from './usePricingSearch';
import usePricingScreening, {
  type UsePricingScreeningResult,
} from './usePricingScreening';
import usePricingAnalysisDetails, {
  type UsePricingAnalysisDetailsResult,
} from './usePricingAnalysisDetails';
import usePricingSensitivity, {
  type UsePricingSensitivityResult,
} from './usePricingSensitivity';

// ---------------------------------------------------------------------------
// URL sync helpers (stripped-down — no workbench params)
// ---------------------------------------------------------------------------

const URL_PARAM_SYMBOL = 'symbol';
const URL_PARAM_PERIOD = 'period';
const URL_PARAM_VIEW = 'view';

function readPricingUrlState(): { symbol: string; period: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(URL_PARAM_VIEW) !== 'pricing') {
      return { symbol: '', period: '1y' };
    }
    return {
      symbol: String(params.get(URL_PARAM_SYMBOL) || '').trim().toUpperCase(),
      period: String(params.get(URL_PARAM_PERIOD) || '1y'),
    };
  } catch {
    return { symbol: '', period: '1y' };
  }
}

function buildPricingUrl(symbol: string, period: string): string {
  try {
    const params = new URLSearchParams(window.location.search);
    params.set(URL_PARAM_VIEW, 'pricing');
    if (symbol) {
      params.set(URL_PARAM_SYMBOL, symbol);
    } else {
      params.delete(URL_PARAM_SYMBOL);
    }
    params.set(URL_PARAM_PERIOD, period);
    return `${window.location.pathname}?${params.toString()}`;
  } catch {
    return window.location.href;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePricingResearchDataParams {
  navigateByResearchAction?: (
    action: Record<string, unknown>,
    search?: string,
  ) => void;
}

export type UsePricingResearchDataResult = {
  // Core state
  data: Record<string, unknown> | null;
  error: string | null;
  loading: boolean;
  period: string;
  setPeriod: (period: string) => void;
  setSymbol: (symbol: string) => void;
  symbol: string;
  // Action
  handleAnalyze: (overrideSymbol?: string | null, overridePeriod?: string | null) => Promise<void>;
  handleKeyPress: (event: React.KeyboardEvent) => void;
  // Constant helpers
  HOT_PRICING_SYMBOLS: typeof HOT_PRICING_SYMBOLS;
  suggestionTagColors: typeof ALIGNMENT_TAG_COLORS;
} & UsePricingSearchResult &
  UsePricingScreeningResult &
  UsePricingAnalysisDetailsResult &
  UsePricingSensitivityResult;

// Need React for KeyboardEvent type
import type React from 'react';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function usePricingResearchData({
  navigateByResearchAction,
}: UsePricingResearchDataParams = {}): UsePricingResearchDataResult {
  const initialUrlState = readPricingUrlState();

  const [symbol, setSymbol] = useState<string>(initialUrlState.symbol || '');
  const [period, setPeriod] = useState<string>(initialUrlState.period || '1y');
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deferredSymbolQuery = useDeferredValue(symbol);
  const handleAnalyzeRef = useRef<((s?: string | null, p?: string | null) => Promise<void>) | null>(null);

  // --- Sub-hooks ---

  const searchResult = usePricingSearch({
    deferredSymbolQuery,
    navigateByResearchAction,
    setPeriod,
    setSymbol,
  });

  const handleAnalyze = useCallback(
    async (overrideSymbol: string | null = null, overridePeriod: string | null = null) => {
      const raw = typeof overrideSymbol === 'string' && overrideSymbol
        ? overrideSymbol
        : symbol;
      const targetSymbol = String(raw || '').trim().toUpperCase();
      const targetPeriod =
        typeof overridePeriod === 'string' && overridePeriod ? overridePeriod : period;
      if (!targetSymbol) return;

      setLoading(true);
      setError(null);
      try {
        const result = await getGapAnalysis(targetSymbol, targetPeriod);
        setData(result as Record<string, unknown>);
        searchResult.recordSearchHistory(targetSymbol);
        // Push URL state after a successful analysis
        window.history.replaceState(null, '', buildPricingUrl(targetSymbol, targetPeriod));
      } catch (err) {
        const e = err as { userMessage?: string; message?: string };
        setError(e.userMessage ?? e.message ?? '分析失败');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [period, searchResult, symbol],
  );

  // Keep a stable ref so URL-sync effect can call it without stale closure
  useEffect(() => {
    handleAnalyzeRef.current = handleAnalyze;
  }, [handleAnalyze]);

  const screeningResult = usePricingScreening({
    handleAnalyze,
    initialScreeningFilter: 'all',
    initialScreeningMinScore: 0,
    initialScreeningSector: 'all',
    period,
    setSymbol,
  });

  const analysisDetailsResult = usePricingAnalysisDetails({
    data,
    period,
    symbol,
  });

  const sensitivityResult = usePricingSensitivity({
    data,
    researchContextSymbol: symbol,
    symbol,
  });

  // --- URL sync: popstate ---
  useEffect(() => {
    const syncFromUrl = () => {
      const state = readPricingUrlState();
      if (state.symbol) {
        setSymbol((prev) => (prev === state.symbol ? prev : state.symbol));
        setPeriod((prev) => (prev === state.period ? prev : state.period));
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  // --- Push URL state when period changes (after data is present) ---
  useEffect(() => {
    if (!symbol) return;
    window.history.replaceState(null, '', buildPricingUrl(symbol, period));
  }, [period, symbol]);

  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') void handleAnalyze();
    },
    [handleAnalyze],
  );

  return {
    // Core
    data,
    error,
    loading,
    period,
    setPeriod,
    setSymbol,
    symbol,
    handleAnalyze,
    handleKeyPress,
    HOT_PRICING_SYMBOLS,
    suggestionTagColors: ALIGNMENT_TAG_COLORS,
    // Sub-hook spreads
    ...searchResult,
    ...screeningResult,
    ...analysisDetailsResult,
    ...sensitivityResult,
  };
}
