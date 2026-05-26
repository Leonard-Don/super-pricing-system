import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/api', () => ({
  __esModule: true,
  getAltDataProviderCorrelation: jest.fn(),
  getAltDataThemesWithDiversity: jest.fn(),
  getCompositeSignalsClusterAware: jest.fn(),
  getCompositeSignalComparison: jest.fn(),
}));

import {
  getAltDataProviderCorrelation,
  getAltDataThemesWithDiversity,
  getCompositeSignalsClusterAware,
  getCompositeSignalComparison,
} from '../../../services/api';
import AltDataAdvancedDiagnosticsTile from '../AltDataAdvancedDiagnosticsTile';

beforeAll(() => {
  const matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });

  Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
  Object.defineProperty(global, 'matchMedia', { writable: true, value: matchMedia });
});

afterEach(() => {
  jest.clearAllMocks();
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buildProviderCorrelationPayload(overrides = {}) {
  return {
    days_window: 45,
    redundancy_clusters: [
      ['policy_radar', 'policy_execution'],
      ['macro_hf'],
      ['people_layer'],
    ],
    public_summary: {
      effective_provider_count: 3,
      redundant_cluster_count: 1,
      independent_provider_count: 2,
      average_pairwise_correlation: 0.42,
      most_redundant_pair: ['policy_radar', 'policy_execution', 0.93],
      most_independent_pair: ['macro_hf', 'people_layer', 0.12],
    },
    audit_doc_url: 'docs/alt_data_audit.md',
    ...overrides,
  };
}

function buildThemesPayload(overrides = {}) {
  return {
    days_window: 14,
    min_providers: 2,
    diversity_summary: {
      total: 2,
      tier_counts: { HIGH: 1, MEDIUM: 0, LOW: 1 },
    },
    themes: [
      {
        industry: '铜',
        conviction: 'high',
        supporting_archives: ['narrative', 'composite'],
        cluster_diversity: {
          diversity_tier: 'HIGH',
          providers_count: 4,
          clusters_count: 3,
          provider_cluster_ratio: 0.75,
        },
      },
    ],
    ...overrides,
  };
}

function buildClusterAwarePayload(overrides = {}) {
  return {
    days_window: 14,
    cluster_threshold: 0.9,
    tier_summary: { high: 1, medium: 0, low: 0 },
    composite_signals: [
      {
        target: 'AI算力',
        direction: 'bullish',
        conviction: 'high',
        aggregate_strength: 0.45,
        supporting_clusters_count: 3,
        supporting_clusters: [
          { cluster_name: 'policy_radar', contributing_providers: ['policy_radar'] },
          { cluster_name: 'northbound', contributing_providers: ['northbound'] },
          { cluster_name: 'people_layer', contributing_providers: ['people_layer'] },
        ],
      },
    ],
    ...overrides,
  };
}

function buildComparisonPayload(overrides = {}) {
  return {
    days_window: 14,
    cluster_threshold: 0.9,
    summary: {
      total_comparisons: 2,
      tier_changes_count: 1,
      downgrades: 1,
      upgrades: 0,
    },
    comparisons: [],
    tier_changes: [
      {
        industry: '新能源汽车',
        direction: 'bearish',
        legacy_conviction: 'medium',
        cluster_aware_conviction: 'low',
        legacy_supporting_components_count: 3,
        cluster_aware_supporting_clusters_count: 1,
        tier_delta: -1,
      },
    ],
    ...overrides,
  };
}

function mockSuccessfulFetches() {
  getAltDataProviderCorrelation.mockResolvedValueOnce(buildProviderCorrelationPayload());
  getAltDataThemesWithDiversity.mockResolvedValueOnce(buildThemesPayload());
  getCompositeSignalsClusterAware.mockResolvedValueOnce(buildClusterAwarePayload());
  getCompositeSignalComparison.mockResolvedValueOnce(buildComparisonPayload());
}

describe('<AltDataAdvancedDiagnosticsTile />', () => {
  test('renders provider redundancy, theme diversity, cluster-aware signals, and tier changes', async () => {
    mockSuccessfulFetches();

    render(<AltDataAdvancedDiagnosticsTile />);
    await flushAsync();

    await waitFor(() => expect(screen.getByTestId('alt-data-advanced-diagnostics-tile')).toBeInTheDocument());

    expect(getAltDataProviderCorrelation).toHaveBeenCalledWith({ days_window: 45 });
    expect(getAltDataThemesWithDiversity).toHaveBeenCalledWith({
      days_window: 14,
      min_conviction: 'low',
      min_providers: 2,
      cluster_threshold: 0.9,
    });
    expect(getCompositeSignalsClusterAware).toHaveBeenCalledWith({
      days_window: 14,
      min_conviction: 'low',
      cluster_threshold: 0.9,
      limit: 12,
    });
    expect(getCompositeSignalComparison).toHaveBeenCalledWith({ days_window: 14, cluster_threshold: 0.9 });

    expect(screen.getByText('冗余与 cluster-aware 诊断')).toBeInTheDocument();
    const summary = screen.getByTestId('advanced-diagnostics-provider-summary');
    expect(within(summary).getByText('有效来源 3')).toBeInTheDocument();
    expect(within(summary).getByText('冗余簇 1')).toBeInTheDocument();
    expect(within(summary).getByText('平均相关 0.42')).toBeInTheDocument();
    expect(within(summary).getByText('政策雷达 ↔ 政策执行 0.93')).toBeInTheDocument();

    const themeTable = screen.getByTestId('advanced-diagnostics-theme-table');
    expect(within(themeTable).getByText('铜')).toBeInTheDocument();
    expect(within(themeTable).getAllByText('HIGH').length).toBeGreaterThanOrEqual(1);
    expect(within(themeTable).getByText('4 来源 / 3 簇')).toBeInTheDocument();

    const clusterAwareTable = screen.getByTestId('advanced-diagnostics-cluster-aware-table');
    expect(within(clusterAwareTable).getByText('AI算力')).toBeInTheDocument();
    expect(within(clusterAwareTable).getByText('看多')).toBeInTheDocument();
    expect(within(clusterAwareTable).getByText('3 个独立簇')).toBeInTheDocument();

    const comparisonTable = screen.getByTestId('advanced-diagnostics-comparison-table');
    expect(within(comparisonTable).getByText('新能源汽车')).toBeInTheDocument();
    expect(within(comparisonTable).getByText('MEDIUM → LOW')).toBeInTheDocument();
    expect(within(comparisonTable).getByText('3 组件 → 1 簇')).toBeInTheDocument();
  });

  test('refresh button refetches all advanced diagnostic endpoints with fixed params', async () => {
    mockSuccessfulFetches();
    mockSuccessfulFetches();

    render(<AltDataAdvancedDiagnosticsTile />);
    await flushAsync();
    await waitFor(() => expect(screen.getByTestId('alt-data-advanced-diagnostics-tile')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('alt-data-advanced-diagnostics-refresh'));
    await flushAsync();

    await waitFor(() => expect(getAltDataProviderCorrelation).toHaveBeenCalledTimes(2));
    expect(getAltDataThemesWithDiversity).toHaveBeenCalledTimes(2);
    expect(getCompositeSignalsClusterAware).toHaveBeenCalledTimes(2);
    expect(getCompositeSignalComparison).toHaveBeenCalledTimes(2);
    expect(getCompositeSignalComparison).toHaveBeenLastCalledWith({ days_window: 14, cluster_threshold: 0.9 });
  });
});
