import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getPricingSymbolSuggestions,
} from '@/services/api/pricing';
import {
  buildRecentPricingResearchEntries,
  mergePricingSuggestions,
  type RecentPricingEntry,
} from '@/features/pricing/lib/pricingResearch';

// NOTE: getResearchTasks (research-workbench service) is NOT ported in P1.
// recentResearchEntries from research tasks is dropped; the shortcut cards
// and handleOpenRecentResearchTask that require a taskId + navigateByResearchAction
// still exist in the API but the research-task fetch is omitted until P3.

const SEARCH_HISTORY_KEY = 'pricing-research-history';

export interface SuggestionRichLabel {
  recent: boolean;
  primaryView: string;
  confidenceLabel: string;
  factorAlignmentLabel: string;
  factorAlignmentStatus: string;
  name: string;
  group: string;
  market: string;
  period: string;
  headline: string;
  summary: string;
  primaryDriver: string;
  taskId: string;
}

export interface SuggestionOption {
  value: string;
  taskId: string;
  period: string;
  label: string;
  labelMeta: Record<string, unknown>;
  richLabel: SuggestionRichLabel;
}

export interface RecentResearchShortcutCard extends RecentPricingEntry {
  title: string;
  subtitle: string;
}

export interface UsePricingSearchParams {
  deferredSymbolQuery: string;
  navigateByResearchAction?: (action: Record<string, unknown>, search?: string) => void;
  setPeriod: (period: string) => void;
  setSymbol: (symbol: string) => void;
}

export interface UsePricingSearchResult {
  handleOpenRecentResearchTask: (entry?: Record<string, unknown>) => void;
  handleSuggestionSelect: (value: string, option: Record<string, unknown>) => void;
  recentResearchShortcutCards: RecentResearchShortcutCard[];
  recordSearchHistory: (targetSymbol: string) => void;
  searchHistory: string[];
  suggestions: SuggestionOption[];
}

export default function usePricingSearch({
  deferredSymbolQuery,
  navigateByResearchAction,
  setPeriod,
  setSymbol,
}: UsePricingSearchParams): UsePricingSearchResult {
  const [suggestions, setSuggestions] = useState<SuggestionOption[]>([]);
  // Initialize searchHistory directly from localStorage to avoid a
  // synchronous setState inside an effect (react-hooks/set-state-in-effect).
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(SEARCH_HISTORY_KEY) || '[]',
      );
      if (Array.isArray(stored)) {
        return (stored as unknown[]).filter(
          (s): s is string => typeof s === 'string' && Boolean(s),
        );
      }
    } catch {
      // ignore
    }
    return [];
  });
  // NOTE: recentResearchEntries from getResearchTasks (P3) is intentionally
  // omitted in P1. We keep the shape but initialize empty.
  const [recentResearchEntries] = useState<RecentPricingEntry[]>([]);

  const recordSearchHistory = useCallback((targetSymbol: string) => {
    setSearchHistory((prev) => {
      const next = [targetSymbol, ...prev.filter((item) => item !== targetSymbol)].slice(0, 8);
      try {
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch (storageError) {
        console.debug('unable to persist pricing history', storageError);
      }
      return next;
    });
  }, []);

  const handleOpenRecentResearchTask = useCallback(
    (entry: Record<string, unknown> = {}) => {
      const taskId = String(entry?.taskId || entry?.task_id || '');
      if (taskId && navigateByResearchAction) {
        navigateByResearchAction({
          target: 'workbench',
          type: 'pricing',
          sourceFilter: 'research_workbench',
          reason: 'recent_pricing_search',
          taskId,
        });
        return;
      }
      if (entry?.period) setPeriod(String(entry.period));
      if (entry?.symbol) setSymbol(String(entry.symbol));
    },
    [navigateByResearchAction, setPeriod, setSymbol],
  );

  const handleSuggestionSelect = useCallback(
    (value: string, option: Record<string, unknown>) => {
      const taskId = String(option?.taskId || option?.task_id || '');
      if (taskId) {
        handleOpenRecentResearchTask({
          taskId,
          symbol: value,
          period: String(option?.period || ''),
        });
        return;
      }
      setSymbol(value);
    },
    [handleOpenRecentResearchTask, setSymbol],
  );

  const recentResearchShortcuts = useMemo(
    () => recentResearchEntries.slice(0, 4),
    [recentResearchEntries],
  );

  const recentResearchShortcutCards = useMemo(
    () =>
      recentResearchShortcuts.map((item) => ({
        ...item,
        title: item.headline || item.title || `${item.symbol} 定价研究`,
        subtitle: [
          item.primary_view || '',
          item.confidence_label ? `置信度 ${item.confidence_label}` : '',
          item.factor_alignment_label || '',
          item.period ? `窗口 ${item.period}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    [recentResearchShortcuts],
  );

  // NOTE: getResearchTasks fetch (P3 concern) is intentionally dropped here.
  // When P3 ports the research-workbench service, restore the useEffect
  // that calls getResearchTasks({ limit: 40, type: 'pricing' }) and
  // populates recentResearchEntries.

  // Fetch symbol suggestions when the deferred query changes
  useEffect(() => {
    let active = true;
    const query = String(deferredSymbolQuery || '').trim();
    const preferredEntries: (string | Record<string, unknown>)[] = [
      ...buildRecentPricingResearchEntries(
        searchHistory.map((item) => ({ symbol: item })),
      ) as unknown as Record<string, unknown>[],
      ...(recentResearchEntries as unknown as Record<string, unknown>[]),
    ];
    getPricingSymbolSuggestions(query, 8)
      .then((payload) => {
        if (!active) return;
        const payloadAny = payload as Record<string, unknown>;
        const mergedSuggestions = mergePricingSuggestions(
          (payloadAny?.data as Record<string, unknown>[]) || [],
          preferredEntries,
          query,
        );
        const options: SuggestionOption[] = mergedSuggestions.map((item) => ({
          value: item.symbol,
          taskId: item.task_id || '',
          period: item.period || '',
          labelMeta: item as unknown as Record<string, unknown>,
          label: item.symbol,
          richLabel: {
            recent: item.recent,
            primaryView: item.primary_view,
            confidenceLabel: item.confidence_label,
            factorAlignmentLabel: item.factor_alignment_label,
            factorAlignmentStatus: item.factor_alignment_status,
            name: item.name,
            group: item.group,
            market: item.market,
            period: item.period,
            headline: item.headline,
            summary: item.summary,
            primaryDriver: item.primary_driver,
            taskId: item.task_id,
          },
        }));
        setSuggestions(options);
      })
      .catch(() => {
        if (active) setSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [deferredSymbolQuery, recentResearchEntries, searchHistory]);

  return {
    handleOpenRecentResearchTask,
    handleSuggestionSelect,
    recentResearchShortcutCards,
    recordSearchHistory,
    searchHistory,
    suggestions,
  };
}
