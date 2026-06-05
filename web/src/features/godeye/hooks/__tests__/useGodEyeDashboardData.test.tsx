import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock all external API calls before importing the hook
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getMacroOverview: vi.fn().mockResolvedValue({ factors: [], trend: {} }),
  getAltDataSnapshot: vi.fn().mockResolvedValue({ signals: {}, providers: {} }),
  getAltDataStatus: vi.fn().mockResolvedValue({ provider_health: {} }),
  getAltDataHistory: vi.fn().mockResolvedValue({ records: [] }),
  refreshAltData: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/services/api/crossMarket', () => ({
  getCrossMarketTemplates: vi.fn().mockResolvedValue({ templates: [] }),
}));

vi.mock('@/services/api/research', () => ({
  getResearchTasks: vi.fn().mockResolvedValue({ data: [] }),
}));

// ---------------------------------------------------------------------------
// Import hook after mocks are established
// ---------------------------------------------------------------------------

import useGodEyeDashboardData from '../useGodEyeDashboardData';
import * as altDataApi from '@/services/api/altDataAndMacro';

describe('useGodEyeDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default implementations after clearAllMocks
    vi.mocked(altDataApi.getMacroOverview).mockResolvedValue({ factors: [], trend: {} });
    vi.mocked(altDataApi.getAltDataSnapshot).mockResolvedValue({ signals: {}, providers: {} });
    vi.mocked(altDataApi.getAltDataStatus).mockResolvedValue({ provider_health: {} });
    vi.mocked(altDataApi.getAltDataHistory).mockResolvedValue({ records: [] });
    vi.mocked(altDataApi.refreshAltData).mockResolvedValue({ ok: true });
  });

  it('starts with loading=true', () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    expect(result.current.loading).toBe(true);
  });

  it('loading converges to false after mount fetch', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('exposes overview after load', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overview).toBeDefined();
    expect(result.current.overview).not.toBeNull();
  });

  it('exposes snapshot after load', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshot).toBeDefined();
    expect(result.current.snapshot).not.toBeNull();
  });

  it('exposes factorPanelModel derived state', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.factorPanelModel).toBeDefined();
    expect(result.current.factorPanelModel).toHaveProperty('factors');
    expect(result.current.factorPanelModel).toHaveProperty('topFactors');
  });

  it('exposes heatmapModel derived state', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.heatmapModel).toBeDefined();
    expect(result.current.heatmapModel).toHaveProperty('cells');
    expect(result.current.heatmapModel).toHaveProperty('anomalies');
  });

  it('exposes all named derived fields', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toHaveProperty('crossMarketCards');
    expect(result.current).toHaveProperty('decayWatchModel');
    expect(result.current).toHaveProperty('dashboardStatus');
    expect(result.current).toHaveProperty('hunterAlerts');
    expect(result.current).toHaveProperty('radarData');
    expect(result.current).toHaveProperty('refreshCounts');
    expect(result.current).toHaveProperty('refreshSignals');
    expect(result.current).toHaveProperty('tradeThesisWatchModel');
    expect(result.current).toHaveProperty('timelineItems');
  });

  it('exposes handleManualRefresh function', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.handleManualRefresh).toBe('function');
  });

  it('handleManualRefresh calls refreshAltData("all")', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.handleManualRefresh();

    expect(altDataApi.refreshAltData).toHaveBeenCalledWith('all');
  });

  it('handleManualRefresh reloads dashboard after refresh', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const initialCallCount = vi.mocked(altDataApi.getMacroOverview).mock.calls.length;
    await result.current.handleManualRefresh();

    // getMacroOverview should have been called again (reload)
    expect(vi.mocked(altDataApi.getMacroOverview).mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('refreshing starts false', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.refreshing).toBe(false);
  });

  it('arrays are initialized as arrays', async () => {
    const { result } = renderHook(() => useGodEyeDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.crossMarketCards)).toBe(true);
    expect(Array.isArray(result.current.decayWatchModel)).toBe(true);
    expect(Array.isArray(result.current.hunterAlerts)).toBe(true);
    expect(Array.isArray(result.current.radarData)).toBe(true);
    expect(Array.isArray(result.current.refreshSignals)).toBe(true);
    expect(Array.isArray(result.current.tradeThesisWatchModel)).toBe(true);
    expect(Array.isArray(result.current.timelineItems)).toBe(true);
  });
});
