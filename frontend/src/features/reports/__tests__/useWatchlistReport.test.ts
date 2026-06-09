/**
 * Unit tests for useWatchlistReport hook — orchestration with mocked APIs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useWatchlistReport from '../hooks/useWatchlistReport';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/services/api/realtime', () => ({
  fetchWatchlistSymbols: vi.fn(),
}));

vi.mock('@/services/api/pricing', () => ({
  runPricingScreener: vi.fn(),
}));

vi.mock('@/features/pricing/lib/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pricing/lib/report')>();
  return {
    ...actual,
    openPricingResearchPrintWindow: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../lib/watchlistReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/watchlistReport')>();
  return {
    ...actual,
    buildWatchlistReportCsv: vi.fn(),
  };
});

import { fetchWatchlistSymbols } from '@/services/api/realtime';
import { runPricingScreener } from '@/services/api/pricing';
import { openPricingResearchPrintWindow } from '@/features/pricing/lib/report';
import { buildWatchlistReportCsv } from '../lib/watchlistReport';

const mockFetchWatchlist = vi.mocked(fetchWatchlistSymbols);
const mockRunScreener = vi.mocked(runPricingScreener);
const mockOpenPrint = vi.mocked(openPricingResearchPrintWindow);
const mockBuildCsv = vi.mocked(buildWatchlistReportCsv);

const MOCK_SYMBOLS = ['AAPL', 'MSFT'];

const MOCK_SCREENER_RESULT = {
  results: [
    {
      symbol: 'AAPL',
      company_name: 'Apple',
      sector: 'Tech',
      period: '1y',
      current_price: 150,
      fair_value: 120,
      gap_pct: 25,
      direction: 'over',
      severity: 'high',
      severity_label: 'high',
      primary_view: '高估',
      confidence: 'high',
      confidence_score: 0.85,
      factor_alignment_status: 'aligned',
      factor_alignment_label: 'aligned',
      factor_alignment_summary: '',
      price_source: 'yfinance',
      primary_driver: 'momentum',
      primary_driver_reason: '',
      people_governance_discount_pct: 0,
      people_governance_confidence: 'medium',
      people_governance_label: '',
      people_governance_summary: '',
      summary: '',
      screening_score: 80,
    },
    {
      symbol: 'MSFT',
      company_name: 'Microsoft',
      sector: 'Tech',
      period: '1y',
      current_price: 300,
      fair_value: 350,
      gap_pct: -14.3,
      direction: 'under',
      severity: 'medium',
      severity_label: 'medium',
      primary_view: '低估',
      confidence: 'medium',
      confidence_score: 0.7,
      factor_alignment_status: 'partial',
      factor_alignment_label: 'partial',
      factor_alignment_summary: '',
      price_source: 'yfinance',
      primary_driver: 'value',
      primary_driver_reason: '',
      people_governance_discount_pct: 0,
      people_governance_confidence: 'medium',
      people_governance_label: '',
      people_governance_summary: '',
      summary: '',
      screening_score: 65,
    },
  ],
  analyzed_count: 2,
  total_input: 2,
  failures: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockOpenPrint.mockReturnValue(true);
});

describe('useWatchlistReport', () => {
  it('initial state: not loading, no error, not empty', () => {
    const { result } = renderHook(() => useWatchlistReport());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isEmpty).toBe(false);
  });

  // ── generateAndPrint — happy path ─────────────────────────────────────────

  it('generateAndPrint: calls screener with watchlist symbols', async () => {
    mockFetchWatchlist.mockResolvedValue(MOCK_SYMBOLS);
    mockRunScreener.mockResolvedValue(MOCK_SCREENER_RESULT as unknown as Awaited<ReturnType<typeof runPricingScreener>>);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(mockRunScreener).toHaveBeenCalledWith(
      MOCK_SYMBOLS,
      '1y',
      MOCK_SYMBOLS.length,
      expect.any(Number),
    );
  });

  it('generateAndPrint: opens print window when popup succeeds', async () => {
    mockFetchWatchlist.mockResolvedValue(MOCK_SYMBOLS);
    mockRunScreener.mockResolvedValue(MOCK_SCREENER_RESULT as unknown as Awaited<ReturnType<typeof runPricingScreener>>);
    mockOpenPrint.mockReturnValue(true);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(mockOpenPrint).toHaveBeenCalledOnce();
    expect(mockBuildCsv).not.toHaveBeenCalled();
  });

  it('generateAndPrint: falls back to CSV when popup is blocked', async () => {
    mockFetchWatchlist.mockResolvedValue(MOCK_SYMBOLS);
    mockRunScreener.mockResolvedValue(MOCK_SCREENER_RESULT as unknown as Awaited<ReturnType<typeof runPricingScreener>>);
    mockOpenPrint.mockReturnValue(false);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(mockBuildCsv).toHaveBeenCalledOnce();
  });

  // ── empty watchlist ───────────────────────────────────────────────────────

  it('sets isEmpty when watchlist has no symbols', async () => {
    mockFetchWatchlist.mockResolvedValue([]);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(result.current.isEmpty).toBe(true);
    expect(mockRunScreener).not.toHaveBeenCalled();
  });

  it('isEmpty: downloadCsv also skips screener for empty watchlist', async () => {
    mockFetchWatchlist.mockResolvedValue([]);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.downloadCsv();
    });

    expect(result.current.isEmpty).toBe(true);
    expect(mockRunScreener).not.toHaveBeenCalled();
  });

  // ── screener failure ──────────────────────────────────────────────────────

  it('sets error when screener throws', async () => {
    mockFetchWatchlist.mockResolvedValue(MOCK_SYMBOLS);
    mockRunScreener.mockRejectedValue({ userMessage: '筛选服务超时' });

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(result.current.error).toBe('筛选服务超时');
    expect(result.current.loading).toBe(false);
  });

  it('sets error when fetchWatchlistSymbols throws', async () => {
    mockFetchWatchlist.mockRejectedValue({ message: '网络错误' });

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.generateAndPrint();
    });

    expect(result.current.error).toBe('网络错误');
  });

  // ── downloadCsv ───────────────────────────────────────────────────────────

  it('downloadCsv: calls buildWatchlistReportCsv with rows', async () => {
    mockFetchWatchlist.mockResolvedValue(MOCK_SYMBOLS);
    mockRunScreener.mockResolvedValue(MOCK_SCREENER_RESULT as unknown as Awaited<ReturnType<typeof runPricingScreener>>);

    const { result } = renderHook(() => useWatchlistReport());

    await act(async () => {
      await result.current.downloadCsv();
    });

    expect(mockBuildCsv).toHaveBeenCalledOnce();
    expect(mockOpenPrint).not.toHaveBeenCalled();
  });
});
