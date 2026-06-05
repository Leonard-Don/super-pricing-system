// ---------------------------------------------------------------------------
// GodeyePage.test.tsx — TDD for Task 12 (P2 plan)
// ---------------------------------------------------------------------------
// Strategy:
//   - Mock `useGodEyeDashboardData` so we control the hook's return value.
//   - Test 1: loading=true → renders a Skeleton (no section kickers).
//   - Test 2: loading=false, data present → all 6 section kicker labels rendered
//             AND at least one known panel heading rendered per section.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock the hook — the module path must match the exact import in GodeyePage.tsx
// ---------------------------------------------------------------------------
vi.mock('@/features/godeye/hooks/useGodEyeDashboardData', () => ({
  default: vi.fn(),
}));

// Import the mock so tests can configure it
import useGodEyeDashboardDataMock from '@/features/godeye/hooks/useGodEyeDashboardData';

// Import the page AFTER mocking so it picks up the mocked module
import GodeyePage from '../GodeyePage';

// ---------------------------------------------------------------------------
// Minimal hook return shapes
// ---------------------------------------------------------------------------

const EMPTY_FACTOR_PANEL_MODEL = {
  topFactors: [],
  factors: [],
  primaryAction: null,
  resonanceSummary: {},
  evidenceSummary: {},
  confidenceAdjustment: {},
  providerHealth: {},
  staleness: {},
  macroTrend: {},
  peopleLayerSummary: {},
  departmentChaosSummary: {},
  inputReliabilitySummary: {},
};

const LOADING_RETURN = {
  loading: true,
  refreshing: false,
  overview: {},
  snapshot: {},
  crossMarketCards: [],
  decayWatchModel: [],
  dashboardStatus: {
    degradedProviders: [],
    providerCount: 0,
    providerHealth: {},
    schedulerStatus: {},
    snapshotTimestamp: undefined,
    staleness: {},
  },
  factorPanelModel: EMPTY_FACTOR_PANEL_MODEL,
  heatmapModel: { cells: [], anomalies: [] },
  hunterAlerts: [],
  radarData: [],
  refreshCounts: {},
  refreshSignals: [],
  tradeThesisWatchModel: [],
  timelineItems: [],
  handleManualRefresh: vi.fn(),
};

const DATA_RETURN = {
  ...LOADING_RETURN,
  loading: false,
  overview: {
    macro_signal: 0,
    macro_score: 0.1234,
    factors: [],
    people_layer_summary: {},
  },
  snapshot: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GodeyePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a skeleton loading indicator when loading=true and no overview data', () => {
    (useGodEyeDashboardDataMock as ReturnType<typeof vi.fn>).mockReturnValue(LOADING_RETURN);
    render(<GodeyePage />);
    // Skeleton(s) should be visible
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
    // Section kicker labels should NOT appear while loading
    expect(screen.queryByText('宏观态势')).toBeNull();
    expect(screen.queryByText('战场扫描')).toBeNull();
  });

  it('renders all 6 section kicker labels when data is loaded', () => {
    (useGodEyeDashboardDataMock as ReturnType<typeof vi.fn>).mockReturnValue(DATA_RETURN);
    render(<GodeyePage />);

    // Section 1
    expect(screen.getByText('宏观态势')).toBeDefined();
    // Section 2
    expect(screen.getByText('战场扫描')).toBeDefined();
    // Section 3
    expect(screen.getByText('宏观因子 & 政策')).toBeDefined();
    // Section 4
    expect(screen.getByText('猎杀信号 & 跨市场')).toBeDefined();
    // Section 5
    expect(screen.getByText('衰败 & 战术')).toBeDefined();
    // Section 6
    expect(screen.getByText('基础另类数据')).toBeDefined();
  });

  it('renders at least one panel heading per section when data is loaded', () => {
    (useGodEyeDashboardDataMock as ReturnType<typeof vi.fn>).mockReturnValue(DATA_RETURN);
    render(<GodeyePage />);

    // Section 1 — GodEyeHeader heading
    expect(screen.getByText('GodEye V2 作战大屏')).toBeDefined();
    // Section 2 — SupplyChainHeatmap
    expect(screen.getByText('实体链路热区')).toBeDefined();
    // Section 3 — MacroFactorPanel
    expect(screen.getByText('宏观因子面板')).toBeDefined();
    // Section 4 — AlertHunterPanel
    expect(screen.getByText('异常猎手')).toBeDefined();
    // Section 5 — StructuralDecayRadarPanel
    expect(screen.getByText('结构衰败雷达')).toBeDefined();
    // Section 6 — PeopleLayerWatchlistPanel
    expect(screen.getByText('人的维度观察名单')).toBeDefined();
  });

  it('wires the header refresh button to the hook refresh function', () => {
    const mockRefresh = vi.fn();
    (useGodEyeDashboardDataMock as ReturnType<typeof vi.fn>).mockReturnValue({
      ...DATA_RETURN,
      handleManualRefresh: mockRefresh,
    });
    render(<GodeyePage />);
    // GodEyeHeader renders a refresh button with text "强制刷新"
    const refreshButton = screen.getByRole('button', { name: /强制刷新/ });
    refreshButton.click();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
