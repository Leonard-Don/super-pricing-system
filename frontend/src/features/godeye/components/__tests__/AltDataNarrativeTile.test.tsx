// ---------------------------------------------------------------------------
// AltDataNarrativeTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltDataNarrative: vi.fn(),
  getAltDataNarrativeHistory: vi.fn(),
}));

import AltDataNarrativeTile from '../AltDataNarrativeTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payloads
// ---------------------------------------------------------------------------

const minimalNarrativePayload = {
  summary: '近期另类数据显示通胀压力边际缓解，供应链改善信号增强。',
  bullets: ['通胀预期回落', '港口物流好转'],
  evidence_links: [
    { component: 'narrative', verdict: 'PRODUCTION', stale: false },
    { component: 'composite_signal', verdict: 'WORKING-PROTOTYPE', stale: true },
  ],
  generated_at: '2026-06-05T10:00:00Z',
  audit_doc_url: 'docs/alt_data_audit.md',
};

const minimalHistoryPayload = {
  archives: [
    {
      archived_at: '2026-06-04T20:00:00Z',
      original_generated_at: '2026-06-04T10:00:00Z',
      industry: '全局',
      summary: '昨日另类数据摘要示例',
    },
  ],
};

describe('AltDataNarrativeTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltDataNarrative).mockResolvedValue(minimalNarrativePayload);
    vi.mocked(altDataApi.getAltDataNarrativeHistory).mockResolvedValue(minimalHistoryPayload);
  });

  it('renders card title 今日另类数据要点', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() => expect(screen.getByText('今日另类数据要点')).toBeDefined());
  });

  it('renders summary paragraph after load', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-summary')).toBeDefined(),
    );
  });

  it('renders summary text content', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByText(/通胀压力边际缓解/)).toBeDefined(),
    );
  });

  it('renders bullet list', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-bullets')).toBeDefined(),
    );
  });

  it('renders PRODUCTION verdict badge for first bullet', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-bullet-PRODUCTION')).toBeDefined(),
    );
  });

  it('renders freshness badge stale for second bullet', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-stale-stale')).toBeDefined(),
    );
  });

  it('renders history button', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-history-button')).toBeDefined(),
    );
  });

  it('renders refresh button', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-refresh')).toBeDefined(),
    );
  });

  it('shows error state when API rejects', async () => {
    vi.mocked(altDataApi.getAltDataNarrative).mockRejectedValue(new Error('服务器错误'));
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-error')).toBeDefined(),
    );
  });

  it('shows empty state when no bullets returned', async () => {
    vi.mocked(altDataApi.getAltDataNarrative).mockResolvedValue({
      ...minimalNarrativePayload,
      bullets: [],
    });
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-empty')).toBeDefined(),
    );
  });

  it('opens history drawer and shows history entry on button click', async () => {
    render(<AltDataNarrativeTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-history-button')).toBeDefined(),
    );
    await userEvent.click(screen.getByTestId('alt-data-narrative-history-button'));
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-narrative-history-entry-0')).toBeDefined(),
    );
  });
});
