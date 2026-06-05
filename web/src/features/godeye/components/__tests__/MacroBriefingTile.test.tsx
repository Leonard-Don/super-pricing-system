// ---------------------------------------------------------------------------
// MacroBriefingTile tests — TDD: write first → run → fail → implement → pass
// Self-fetching tile; mocks @/services/api/altDataAndMacro
// 5 briefing sections + delta tab + lazy history slide-in.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock API before importing component
// ---------------------------------------------------------------------------

vi.mock('@/services/api/altDataAndMacro', () => ({
  getAltDataMacroBriefing: vi.fn(),
  getAltDataMacroBriefingDelta: vi.fn(),
  getAltDataMacroBriefingHistory: vi.fn(),
}));

import MacroBriefingTile from '../MacroBriefingTile';
import * as altDataApi from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Minimal payloads
// ---------------------------------------------------------------------------

const minimalBriefingPayload = {
  summary_paragraph: '宏观日报综合多维度信号，当前整体偏多。',
  policy_section: ['货币政策维持宽松', '财政刺激力度加大'],
  capital_flow_section: ['北向资金净流入', '融资余额小幅增加'],
  commodity_section: ['铜价维稳', '原油小幅回调'],
  governance_section: ['监管政策趋于宽松'],
  composite_section: ['综合信号偏多'],
  evidence_links: [
    { component: 'policy_tracker', stale: false, section: 'policy' },
    { component: 'capital_flow', stale: true, section: 'capital_flow' },
  ],
  generated_at: '2026-06-05T10:00:00Z',
  time_window_days: 7,
  audit_doc_url: 'docs/alt_data_audit.md',
};

const minimalDeltaPayload = {
  summary_delta: '较昨日整体无重大变化，政策面小幅趋于偏多。',
  has_baseline: true,
  policy_deltas: [
    { direction: 'intensified_bullish', headline: '政策面加强看多' },
  ],
  capital_flow_deltas: [],
  commodity_deltas: [],
  governance_deltas: [],
  composite_deltas: [],
};

const minimalHistoryPayload = {
  archives: [
    {
      archived_at: '2026-06-04T20:00:00Z',
      original_generated_at: '2026-06-04T10:00:00Z',
      summary_paragraph: '昨日宏观日报摘要示例',
      time_window_days: 7,
      evidence_links_count: 3,
    },
  ],
};

describe('MacroBriefingTile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(altDataApi.getAltDataMacroBriefing).mockResolvedValue(minimalBriefingPayload);
    vi.mocked(altDataApi.getAltDataMacroBriefingDelta).mockResolvedValue(minimalDeltaPayload);
    vi.mocked(altDataApi.getAltDataMacroBriefingHistory).mockResolvedValue(
      minimalHistoryPayload,
    );
  });

  // ── tile wrapper ──────────────────────────────────────────────────────────
  it('renders tile wrapper', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('alt-data-macro-briefing-tile')).toBeDefined(),
    );
  });

  it('renders card title 另类数据宏观日报', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() => expect(screen.getByText('另类数据宏观日报')).toBeDefined());
  });

  // ── today tab ─────────────────────────────────────────────────────────────
  it('renders summary paragraph after load', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-summary')).toBeDefined(),
    );
  });

  it('renders summary text content', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByText(/宏观日报综合多维度信号/)).toBeDefined(),
    );
  });

  // ── section headers ───────────────────────────────────────────────────────
  it('renders policy section header', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-policy')).toBeDefined(),
    );
  });

  it('renders capital-flow section header', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-capital-flow')).toBeDefined(),
    );
  });

  it('renders commodity section header', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-commodity')).toBeDefined(),
    );
  });

  it('renders governance section header', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-governance')).toBeDefined(),
    );
  });

  it('renders composite section header', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-composite')).toBeDefined(),
    );
  });

  it('renders a policy bullet', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-policy-bullet-0')).toBeDefined(),
    );
  });

  // ── tabs ──────────────────────────────────────────────────────────────────
  it('renders today tab button', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-tab-today')).toBeDefined(),
    );
  });

  it('renders vs 昨日 tab button', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-tab-delta')).toBeDefined(),
    );
  });

  it('switches to delta tab and loads delta on click', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-tab-delta')).toBeDefined(),
    );
    await userEvent.click(screen.getByTestId('macro-briefing-tab-delta'));
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-delta-summary')).toBeDefined(),
    );
  });

  it('renders delta section for policy after tab switch', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-tab-delta')).toBeDefined(),
    );
    await userEvent.click(screen.getByTestId('macro-briefing-tab-delta'));
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-delta-section-policy')).toBeDefined(),
    );
  });

  // ── refresh button ────────────────────────────────────────────────────────
  it('renders refresh button', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-refresh')).toBeDefined(),
    );
  });

  // ── history ───────────────────────────────────────────────────────────────
  it('renders history button', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-history-button')).toBeDefined(),
    );
  });

  it('opens history panel and shows entry on button click', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-history-button')).toBeDefined(),
    );
    await userEvent.click(screen.getByTestId('macro-briefing-history-button'));
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-history-entry-0')).toBeDefined(),
    );
  });

  // ── loading state ─────────────────────────────────────────────────────────
  it('shows loading spinner initially', () => {
    vi.mocked(altDataApi.getAltDataMacroBriefing).mockReturnValue(new Promise(() => {}));
    render(<MacroBriefingTile />);
    expect(screen.getByTestId('macro-briefing-spinner')).toBeDefined();
  });

  // ── error state ───────────────────────────────────────────────────────────
  it('shows error state when API rejects', async () => {
    vi.mocked(altDataApi.getAltDataMacroBriefing).mockRejectedValue(
      new Error('服务器错误'),
    );
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-error')).toBeDefined(),
    );
  });

  // ── empty state ───────────────────────────────────────────────────────────
  it('shows empty state when all sections have no bullets', async () => {
    vi.mocked(altDataApi.getAltDataMacroBriefing).mockResolvedValue({
      ...minimalBriefingPayload,
      policy_section: [],
      capital_flow_section: [],
      commodity_section: [],
      governance_section: [],
      composite_section: [],
    });
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-empty')).toBeDefined(),
    );
  });

  // ── delta cold-start ──────────────────────────────────────────────────────
  it('shows cold-start notice when has_baseline is false', async () => {
    vi.mocked(altDataApi.getAltDataMacroBriefingDelta).mockResolvedValue({
      has_baseline: false,
      summary_delta: '首日无基线',
    });
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-tab-delta')).toBeDefined(),
    );
    await userEvent.click(screen.getByTestId('macro-briefing-tab-delta'));
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-delta-cold-start')).toBeDefined(),
    );
  });

  // ── section-label map ─────────────────────────────────────────────────────
  it('exposes section-label map in hidden span', async () => {
    render(<MacroBriefingTile />);
    await waitFor(() =>
      expect(screen.getByTestId('macro-briefing-section-label-map')).toBeDefined(),
    );
  });
});
