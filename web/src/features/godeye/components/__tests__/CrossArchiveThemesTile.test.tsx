// ---------------------------------------------------------------------------
// CrossArchiveThemesTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltDataCrossArchiveThemes: vi.fn(),
}));

import CrossArchiveThemesTile from '../CrossArchiveThemesTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payload
// ---------------------------------------------------------------------------

const minimalCrossArchivePayload = {
  themes: [
    {
      industry: '钢铁',
      conviction: 'high',
      trend_direction: 'bullish',
      days_in_narrative: 5,
      days_in_composite: 4,
      days_in_macro_briefing: 3,
      supporting_archives: ['narrative', 'composite'],
    },
    {
      industry: '新能源',
      conviction: 'medium',
      trend_direction: 'mixed',
      days_in_narrative: 3,
      days_in_composite: 2,
      days_in_macro_briefing: 1,
      supporting_archives: ['narrative'],
    },
    {
      industry: '消费',
      conviction: 'low',
      trend_direction: 'neutral',
      days_in_narrative: 6,
      days_in_composite: 0,
      days_in_macro_briefing: 0,
      supporting_archives: ['narrative'],
    },
  ],
  tier_summary: { high: 1, medium: 1, low: 1 },
  generated_at: '2026-06-05T10:00:00Z',
  audit_doc_url: 'docs/alt_data_audit.md',
};

describe('CrossArchiveThemesTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltDataCrossArchiveThemes).mockResolvedValue(
      minimalCrossArchivePayload,
    );
  });

  it('renders card title 跨归档高置信叙事', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByText(/跨归档高置信叙事/)).toBeDefined(),
    );
  });

  it('renders HIGH conviction theme row', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-conviction-high')).toBeDefined(),
    );
  });

  it('renders industry 钢铁 in high conviction row', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() => expect(screen.getByText('钢铁')).toBeDefined());
  });

  it('renders MEDIUM conviction section', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-themes-section-medium')).toBeDefined(),
    );
  });

  it('renders LOW conviction section', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-themes-section-low')).toBeDefined(),
    );
  });

  it('renders tier summary badge HIGH', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-tier-high')).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-themes-refresh')).toBeDefined(),
    );
  });

  it('shows error state when API rejects', async () => {
    vi.mocked(altDataApi.getAltDataCrossArchiveThemes).mockRejectedValue(
      new Error('API 错误'),
    );
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-themes-error')).toBeDefined(),
    );
  });

  it('shows empty state when themes is empty', async () => {
    vi.mocked(altDataApi.getAltDataCrossArchiveThemes).mockResolvedValue({
      ...minimalCrossArchivePayload,
      themes: [],
      tier_summary: { high: 0, medium: 0, low: 0 },
    });
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-themes-empty')).toBeDefined(),
    );
  });

  it('renders theme row 0 with cross-archive-theme-row data-testid', async () => {
    render(<CrossArchiveThemesTile />);
    await waitFor(() =>
      expect(screen.getByTestId('cross-archive-theme-row-0')).toBeDefined(),
    );
  });
});
