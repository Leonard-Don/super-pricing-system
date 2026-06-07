// ---------------------------------------------------------------------------
// AltSignalDiagnosticsTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltSignalDiagnostics: vi.fn(),
}));

import AltSignalDiagnosticsTile from '../AltSignalDiagnosticsTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payload
// ---------------------------------------------------------------------------

const minimalDiagnosticsPayload = {
  record_count: 150,
  half_life_days: 14,
  timeframe: '90d',
  snapshot_timestamp: '2026-06-05T10:00:00Z',
  realized_outcome_count: 42,
  hit_rate_note: null,
  overall: {
    hit_rate: 0.65,
    hit_rate_type: 'realized',
    avg_confidence: 0.72,
    avg_strength: 0.58,
  },
  providers: [
    {
      provider: 'narrative',
      count: 80,
      hit_rate: 0.7,
      hit_rate_type: 'realized',
      avg_strength: 0.6,
      avg_confidence: 0.75,
    },
  ],
  categories: [
    {
      category: 'people',
      count: 70,
      hit_rate: 0.6,
      hit_rate_type: 'proxy',
      avg_strength: 0.55,
      avg_confidence: 0.68,
    },
  ],
  decay_curve: [
    { age_days: 0, decay_weight: 1.0, avg_decayed_signal: 0.8 },
    { age_days: 7, decay_weight: 0.707, avg_decayed_signal: 0.56 },
    { age_days: 14, decay_weight: 0.5, avg_decayed_signal: 0.4 },
  ],
  recent_records: [
    {
      record_id: 'rec-001',
      source: 'narrative',
      category: 'macro',
      age_days: 2,
      decayed_strength: 0.74,
    },
  ],
};

describe('AltSignalDiagnosticsTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltSignalDiagnostics).mockResolvedValue(
      minimalDiagnosticsPayload,
    );
  });

  it('renders card with testid alt-signal-diagnostics-tile', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-tile')).toBeDefined(),
    );
  });

  it('renders title 信号命中率与衰减诊断', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByText(/信号命中率与衰减诊断/)).toBeDefined(),
    );
  });

  it('renders record count stat 150', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-record-count')).toBeDefined(),
    );
  });

  it('renders provider table', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-provider-table')).toBeDefined(),
    );
  });

  it('renders decay chart', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-decay-chart')).toBeDefined(),
    );
  });

  it('renders recent records table', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-recent-table')).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-refresh')).toBeDefined(),
    );
  });

  it('shows error state when API rejects', async () => {
    vi.mocked(altDataApi.getAltSignalDiagnostics).mockRejectedValue(
      new Error('API 错误'),
    );
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-error')).toBeDefined(),
    );
  });

  it('shows empty state when data is null', async () => {
    vi.mocked(altDataApi.getAltSignalDiagnostics).mockResolvedValue(null);
    render(<AltSignalDiagnosticsTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-signal-diagnostics-empty')).toBeDefined(),
    );
  });
});
