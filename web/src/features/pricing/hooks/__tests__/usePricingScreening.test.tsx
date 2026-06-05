import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock runPricingScreener from the pricing API
const mockRunPricingScreener = vi.fn();
vi.mock('@/services/api/pricing', () => ({
  runPricingScreener: (...args: unknown[]) => mockRunPricingScreener(...args),
  getGapAnalysis: vi.fn(),
  getPricingSymbolSuggestions: vi.fn(),
  getPricingGapHistory: vi.fn(),
  getPricingPeerComparison: vi.fn(),
  getValuationSensitivityAnalysis: vi.fn(),
}));

import usePricingScreening from '../usePricingScreening';

const noop = () => {};

const makeDefaultProps = (overrides = {}) => ({
  handleAnalyze: vi.fn() as () => void,
  initialScreeningFilter: 'all' as const,
  initialScreeningMinScore: 0,
  initialScreeningSector: 'all' as const,
  period: '1y',
  setSymbol: vi.fn() as (s: string) => void,
  ...overrides,
});

describe('usePricingScreening', () => {
  beforeEach(() => {
    mockRunPricingScreener.mockReset();
  });

  it('starts with an empty results list and loading=false', () => {
    const { result } = renderHook(() => usePricingScreening(makeDefaultProps()));
    expect(result.current.screeningResults).toEqual([]);
    expect(result.current.screeningLoading).toBe(false);
  });

  it('setScreeningUniverse updates the universe text', () => {
    const { result } = renderHook(() => usePricingScreening(makeDefaultProps()));
    act(() => {
      result.current.setScreeningUniverse('AAPL\nMSFT');
    });
    expect(result.current.screeningUniverse).toBe('AAPL\nMSFT');
  });

  it('handleRunScreener calls runPricingScreener and updates screeningResults', async () => {
    const fakeResults = [
      {
        symbol: 'AAPL',
        company_name: 'Apple',
        sector: 'Tech',
        screening_score: 8.5,
        gap_pct: -0.12,
        primary_view: '低估',
        confidence_score: 0.8,
        factor_alignment_status: 'aligned',
      },
      {
        symbol: 'MSFT',
        company_name: 'Microsoft',
        sector: 'Tech',
        screening_score: 6.0,
        gap_pct: -0.08,
        primary_view: '低估',
        confidence_score: 0.75,
        factor_alignment_status: 'partial',
      },
    ];
    mockRunPricingScreener.mockResolvedValue({
      results: fakeResults,
      analyzed_count: 2,
      total_input: 2,
      failures: [],
    });

    const { result } = renderHook(() =>
      usePricingScreening(
        makeDefaultProps({ initialScreeningFilter: 'all' }),
      ),
    );

    act(() => {
      result.current.setScreeningUniverse('AAPL\nMSFT');
    });

    await act(async () => {
      await result.current.handleRunScreener();
    });

    expect(mockRunPricingScreener).toHaveBeenCalledOnce();
    expect(result.current.screeningResults).toHaveLength(2);
    expect(result.current.screeningLoading).toBe(false);
    expect(result.current.screeningError).toBeNull();
  });

  it('filteredScreeningResults respects undervalued filter', async () => {
    const fakeResults = [
      {
        symbol: 'AAPL',
        screening_score: 8,
        gap_pct: -0.12,
        primary_view: '低估',
        confidence_score: 0.8,
        factor_alignment_status: 'aligned',
        sector: 'Tech',
        people_governance_discount_pct: 0,
      },
      {
        symbol: 'MSFT',
        screening_score: 6,
        gap_pct: 0.08,
        primary_view: '高估',
        confidence_score: 0.75,
        factor_alignment_status: 'partial',
        sector: 'Tech',
        people_governance_discount_pct: 0,
      },
    ];
    mockRunPricingScreener.mockResolvedValue({
      results: fakeResults,
      analyzed_count: 2,
      total_input: 2,
      failures: [],
    });

    const { result } = renderHook(() =>
      usePricingScreening(makeDefaultProps()),
    );

    act(() => {
      result.current.setScreeningUniverse('AAPL\nMSFT');
    });

    await act(async () => {
      await result.current.handleRunScreener();
    });

    // With 'all' filter, both items pass
    expect(result.current.filteredScreeningResults).toHaveLength(2);

    // Switch to undervalued filter
    act(() => {
      result.current.setScreeningFilter('undervalued');
    });

    expect(result.current.filteredScreeningResults).toHaveLength(1);
    expect(result.current.filteredScreeningResults[0].symbol).toBe('AAPL');
  });

  it('screeningSectors derives unique sectors from results', async () => {
    mockRunPricingScreener.mockResolvedValue({
      results: [
        { symbol: 'AAPL', screening_score: 8, sector: 'Tech', gap_pct: 0 },
        { symbol: 'MSFT', screening_score: 6, sector: 'Tech', gap_pct: 0 },
        { symbol: 'JPM', screening_score: 5, sector: 'Finance', gap_pct: 0 },
      ],
      analyzed_count: 3,
      total_input: 3,
      failures: [],
    });

    const { result } = renderHook(() => usePricingScreening(makeDefaultProps()));

    act(() => {
      result.current.setScreeningUniverse('AAPL\nMSFT\nJPM');
    });

    await act(async () => {
      await result.current.handleRunScreener();
    });

    expect(result.current.screeningSectors).toContain('Tech');
    expect(result.current.screeningSectors).toContain('Finance');
    // deduped
    expect(result.current.screeningSectors).toHaveLength(2);
  });

  it('handleRunScreener sets error state on failure', async () => {
    mockRunPricingScreener.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => usePricingScreening(makeDefaultProps()));

    act(() => {
      result.current.setScreeningUniverse('AAPL');
    });

    await act(async () => {
      await result.current.handleRunScreener();
    });

    expect(result.current.screeningError).toBeTruthy();
    expect(result.current.screeningResults).toHaveLength(0);
    expect(result.current.screeningLoading).toBe(false);
  });

  it('handleApplyPreset sets the universe to joined symbols', () => {
    const { result } = renderHook(() => usePricingScreening(makeDefaultProps()));

    act(() => {
      result.current.handleApplyPreset(['AAPL', 'MSFT', 'NVDA']);
    });

    expect(result.current.screeningUniverse).toBe('AAPL\nMSFT\nNVDA');
  });

  // Guard: empty universe should not call the API
  void noop;
});
