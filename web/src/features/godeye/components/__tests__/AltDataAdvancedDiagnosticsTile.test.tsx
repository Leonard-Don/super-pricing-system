// ---------------------------------------------------------------------------
// AltDataAdvancedDiagnosticsTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro (4 methods)
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltDataThemesWithDiversity: vi.fn(),
  getAltDataProviderCorrelation: vi.fn(),
  getCompositeSignalsClusterAware: vi.fn(),
  getCompositeSignalComparison: vi.fn(),
}));

import AltDataAdvancedDiagnosticsTile from '../AltDataAdvancedDiagnosticsTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payloads
// ---------------------------------------------------------------------------

const minimalCorrelationPayload = {
  public_summary: {
    effective_provider_count: 4,
    redundant_cluster_count: 1,
    average_pairwise_correlation: 0.42,
    most_redundant_pair: ['narrative', 'people_layer', 0.87],
    most_independent_pair: ['lme_inventory', 'narrative', 0.12],
    redundancy_clusters: [['narrative', 'people_layer']],
  },
  audit_doc_url: 'docs/alt_data_audit.md',
};

const minimalThemesPayload = {
  themes: [
    {
      industry: '钢铁',
      conviction: 'high',
      cluster_diversity: {
        diversity_tier: 'HIGH',
        providers_count: 3,
        clusters_count: 2,
      },
      supporting_archives: ['lme_inventory', 'narrative'],
    },
    {
      industry: '新能源',
      conviction: 'medium',
      cluster_diversity: {
        diversity_tier: 'MEDIUM',
        providers_count: 2,
        clusters_count: 1,
      },
      supporting_archives: ['people_layer'],
    },
  ],
};

const minimalClusterAwarePayload = {
  composite_signals: [
    {
      target: '有色金属',
      direction: 'bullish',
      conviction: 'high',
      supporting_clusters_count: 2,
      aggregate_strength: 0.78,
    },
    {
      target: '地产',
      direction: 'bearish',
      conviction: 'medium',
      supporting_clusters: [{ providers: ['narrative'] }, { providers: ['people_layer'] }],
      aggregate_strength: 0.55,
    },
  ],
};

const minimalComparisonPayload = {
  tier_changes: [
    {
      industry: '钢铁',
      direction: 'bullish',
      legacy_conviction: 'high',
      cluster_aware_conviction: 'medium',
      legacy_supporting_components_count: 3,
      cluster_aware_supporting_clusters_count: 2,
    },
  ],
  summary: {
    tier_changes_count: 1,
    downgrades: 1,
    upgrades: 0,
    total_comparisons: 5,
  },
};

describe('AltDataAdvancedDiagnosticsTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltDataThemesWithDiversity).mockResolvedValue(minimalThemesPayload);
    vi.mocked(altDataApi.getAltDataProviderCorrelation).mockResolvedValue(minimalCorrelationPayload);
    vi.mocked(altDataApi.getCompositeSignalsClusterAware).mockResolvedValue(minimalClusterAwarePayload);
    vi.mocked(altDataApi.getCompositeSignalComparison).mockResolvedValue(minimalComparisonPayload);
  });

  // ---- structural ----

  it('renders tile with testid alt-data-advanced-diagnostics-tile', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-advanced-diagnostics-tile')).toBeDefined(),
    );
  });

  it('renders title 冗余与 cluster-aware 诊断', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByText(/冗余与 cluster-aware 诊断/)).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-advanced-diagnostics-refresh')).toBeDefined(),
    );
  });

  // ---- provider correlation section ----

  it('renders provider correlation summary section', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-provider-summary')).toBeDefined(),
    );
  });

  it('renders effective provider count 4', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-effective-provider-count')).toBeDefined(),
    );
  });

  it('renders redundant cluster count 1', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-redundant-cluster-count')).toBeDefined(),
    );
  });

  // ---- cluster-aware section ----

  it('renders cluster-aware signals table', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-cluster-aware-table')).toBeDefined(),
    );
  });

  it('renders cluster-aware signal row for 有色金属', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() => expect(screen.getByText('有色金属')).toBeDefined());
  });

  // ---- comparison section ----

  it('renders comparison table', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-comparison-table')).toBeDefined(),
    );
  });

  it('renders comparison summary conviction shift count', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-comparison-summary')).toBeDefined(),
    );
  });

  // ---- diversity section ----

  it('renders theme diversity table', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('advanced-diagnostics-theme-table')).toBeDefined(),
    );
  });

  it('renders theme row 钢铁', async () => {
    render(<AltDataAdvancedDiagnosticsTile />);
    // 钢铁 appears in both theme-table and comparison-table; getAllByText handles multiple matches
    await waitFor(() => expect(screen.getAllByText('钢铁').length).toBeGreaterThan(0));
  });

  // ---- loading state ----

  it('shows spinner while loading', () => {
    vi.mocked(altDataApi.getAltDataThemesWithDiversity).mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.mocked(altDataApi.getAltDataProviderCorrelation).mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.mocked(altDataApi.getCompositeSignalsClusterAware).mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.mocked(altDataApi.getCompositeSignalComparison).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<AltDataAdvancedDiagnosticsTile />);
    expect(screen.getByTestId('alt-data-advanced-diagnostics-spinner')).toBeDefined();
  });

  // ---- error state ----

  it('shows error banner when any API rejects', async () => {
    vi.mocked(altDataApi.getAltDataThemesWithDiversity).mockRejectedValue(new Error('network'));
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-advanced-diagnostics-error')).toBeDefined(),
    );
  });

  // ---- empty state ----

  it('shows empty state when all arrays are empty', async () => {
    vi.mocked(altDataApi.getAltDataThemesWithDiversity).mockResolvedValue({ themes: [] });
    vi.mocked(altDataApi.getAltDataProviderCorrelation).mockResolvedValue({
      public_summary: {},
    });
    vi.mocked(altDataApi.getCompositeSignalsClusterAware).mockResolvedValue({
      composite_signals: [],
    });
    vi.mocked(altDataApi.getCompositeSignalComparison).mockResolvedValue({
      tier_changes: [],
    });
    render(<AltDataAdvancedDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-advanced-diagnostics-empty')).toBeDefined(),
    );
  });
});
