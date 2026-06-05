// ---------------------------------------------------------------------------
// CompositeSignalTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getCompositeSignals: vi.fn(),
  getCompositeSignalsClusterAware: vi.fn(),
  getCompositeSignalHistory: vi.fn(),
}));

import CompositeSignalTile from '../CompositeSignalTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payloads
// ---------------------------------------------------------------------------

const minimalCompositePayload = {
  composite_signals: [
    {
      target: '钢铁',
      direction: 'bullish',
      conviction: 'high',
      aggregate_strength: 0.85,
      supporting_components: [
        { component: 'narrative' },
        { component: 'lme_inventory' },
      ],
    },
    {
      target: '新能源',
      direction: 'bearish',
      conviction: 'medium',
      aggregate_strength: 0.62,
      supporting_components: [{ component: 'composite_signal' }],
    },
  ],
  tier_summary: { high: 1, medium: 1, low: 0 },
  generated_at: '2026-06-05T10:00:00Z',
  audit_doc_url: 'docs/alt_data_audit.md',
};

const minimalClusterPayload = {
  composite_signals: [
    {
      cluster_label: '工业周期',
      direction: 'bullish',
      conviction: 'high',
      cluster_size: 3,
      avg_strength: 0.78,
    },
  ],
  generated_at: '2026-06-05T10:00:00Z',
};

const minimalHistoryPayload = {
  archives: [
    {
      target: '钢铁',
      direction: 'bullish',
      conviction: 'high',
      archived_at: '2026-06-04T10:00:00Z',
      original_emit_at: '2026-06-04T08:00:00Z',
      supporting_components_count: 2,
    },
  ],
};

describe('CompositeSignalTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getCompositeSignals).mockResolvedValue(minimalCompositePayload);
    vi.mocked(altDataApi.getCompositeSignalsClusterAware).mockResolvedValue(
      minimalClusterPayload,
    );
    vi.mocked(altDataApi.getCompositeSignalHistory).mockResolvedValue(minimalHistoryPayload);
  });

  it('renders card with title 跨组件复合信号', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() => expect(screen.getByTestId('composite-signal-tile')).toBeDefined());
  });

  it('renders bullish signal row for 钢铁', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-row-bullish-0')).toBeDefined(),
    );
  });

  it('renders bearish signal row for 新能源', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-row-bearish-0')).toBeDefined(),
    );
  });

  it('renders tier summary badge high', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-tier-high')).toBeDefined(),
    );
  });

  it('renders tier summary badge medium', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-tier-medium')).toBeDefined(),
    );
  });

  it('renders high-conviction badge on bullish row', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-conviction-high')).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-refresh')).toBeDefined(),
    );
  });

  it('renders history button', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-history-button')).toBeDefined(),
    );
  });

  it('shows error state when getCompositeSignals rejects', async () => {
    vi.mocked(altDataApi.getCompositeSignals).mockRejectedValue(new Error('API 错误'));
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-error')).toBeDefined(),
    );
  });

  it('shows empty state when no signals present', async () => {
    vi.mocked(altDataApi.getCompositeSignals).mockResolvedValue({
      ...minimalCompositePayload,
      composite_signals: [],
    });
    vi.mocked(altDataApi.getCompositeSignalsClusterAware).mockResolvedValue({
      composite_signals: [],
    });
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-empty')).toBeDefined(),
    );
  });

  it('renders cluster-aware section', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-signal-cluster-section')).toBeDefined(),
    );
  });

  it('renders cluster row 0', async () => {
    render(<CompositeSignalTile />);
    await waitFor(() =>
      expect(screen.getByTestId('composite-cluster-row-0')).toBeDefined(),
    );
  });
});
