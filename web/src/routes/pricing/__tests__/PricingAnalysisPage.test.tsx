import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock usePricingResearchData so no network/hook internals run in tests
// ---------------------------------------------------------------------------

const mockHookReturn = {
  // Core
  data: null as Record<string, unknown> | null,
  error: null as string | null,
  loading: false,
  period: '1y',
  setPeriod: vi.fn(),
  setSymbol: vi.fn(),
  symbol: '',
  handleAnalyze: vi.fn().mockResolvedValue(undefined),
  handleKeyPress: vi.fn(),
  HOT_PRICING_SYMBOLS: [],
  suggestionTagColors: {},
  // Search sub-hook
  handleOpenRecentResearchTask: vi.fn(),
  handleSuggestionSelect: vi.fn(),
  recentResearchShortcutCards: [],
  recordSearchHistory: vi.fn(),
  searchHistory: [],
  suggestions: [],
  // Screening sub-hook
  filteredScreeningResults: [],
  handleApplyPreset: vi.fn(),
  handleExportScreening: vi.fn(),
  handleInspectScreeningResult: vi.fn(),
  handleRunScreener: vi.fn().mockResolvedValue(undefined),
  screeningError: null,
  screeningFilter: 'all' as const,
  screeningLoading: false,
  screeningMeta: null,
  screeningMinScore: 0,
  screeningProgress: { completed: 0, total: 0, running: false },
  screeningResults: [],
  screeningSector: 'all',
  screeningSectors: [],
  screeningUniverse: '',
  setScreeningFilter: vi.fn(),
  setScreeningMinScore: vi.fn(),
  setScreeningSector: vi.fn(),
  setScreeningUniverse: vi.fn(),
  // Analysis details sub-hook
  gapHistory: null,
  gapHistoryError: null,
  gapHistoryLoading: false,
  peerComparison: null,
  peerComparisonError: null,
  peerComparisonLoading: false,
  // Sensitivity sub-hook
  handleRunSensitivity: vi.fn().mockResolvedValue(undefined),
  sensitivity: null,
  sensitivityControls: { wacc: 8.2, initialGrowth: 12, terminalGrowth: 2.5, fcfMargin: 80 },
  sensitivityError: null,
  sensitivityLoading: false,
  setSensitivityControls: vi.fn(),
};

vi.mock('@/features/pricing/hooks/usePricingResearchData', () => ({
  default: () => mockHookReturn,
}));

// Mock sub-components that have complex recharts / DOM dependencies
vi.mock('@/features/pricing/components/PricingResults', () => ({
  PricingResults: ({ data }: { data: Record<string, unknown> | null }) => {
    if (!data) return null;
    return <div data-testid="pricing-results-mock">因子模型分析</div>;
  },
}));

import PricingAnalysisPage from '@/routes/pricing/PricingAnalysisPage';

// Helper: render in MemoryRouter (router context required for NavLinks inside children)
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingAnalysisPage />
    </MemoryRouter>,
  );
}

// Reset mock data between tests
beforeEach(() => {
  mockHookReturn.data = null;
  mockHookReturn.error = null;
  mockHookReturn.loading = false;
});

describe('PricingAnalysisPage', () => {
  it('renders empty state when no data and not loading', () => {
    renderPage();
    // Empty state copy
    expect(screen.getByText(/输入股票代码开始定价研究/i)).toBeInTheDocument();
  });

  it('does NOT render PricingResults when data is null', () => {
    renderPage();
    expect(screen.queryByTestId('pricing-results-mock')).not.toBeInTheDocument();
  });

  it('renders PricingResults when hook returns data', () => {
    mockHookReturn.data = {
      symbol: 'AAPL',
      gap_analysis: { gap_pct: -0.1 },
      factor_model: {},
      valuation: {},
    };
    renderPage();
    // Our mock renders "因子模型分析" heading when data is present
    expect(screen.getByText('因子模型分析')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-results-mock')).toBeInTheDocument();
  });

  it('shows skeleton / loading state when loading=true', () => {
    mockHookReturn.loading = true;
    renderPage();
    // Loading indicator — the Skeleton elements use data-slot="skeleton"
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error Alert when error is set', () => {
    mockHookReturn.error = '分析失败';
    renderPage();
    expect(screen.getByText('分析失败')).toBeInTheDocument();
  });

  it('renders the search panel', () => {
    renderPage();
    expect(screen.getByTestId('pricing-search-panel')).toBeInTheDocument();
  });

  it('renders the screener card', () => {
    renderPage();
    expect(screen.getByTestId('pricing-screener-card')).toBeInTheDocument();
  });
});
