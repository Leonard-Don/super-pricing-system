/**
 * MispricingAlertPanel tests — render from props/mock API, no live fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MispricingAlertPanel } from '../components/MispricingAlertPanel';
import type { MispricingRule, MispricingHistoryEntry, WouldFireEntry } from '../types';

// ---------------------------------------------------------------------------
// Mock the API module so no real HTTP calls happen
// ---------------------------------------------------------------------------

vi.mock('../api', () => ({
  fetchMispricingRule: vi.fn(),
  saveMispricingRule: vi.fn(),
  fetchMispricingHistory: vi.fn(),
  evaluateMispricing: vi.fn(),
}));

import {
  saveMispricingRule,
  evaluateMispricing,
} from '../api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RULE_ENABLED: MispricingRule = {
  enabled: true,
  threshold_pct: 5,
  direction: 'both',
  min_confidence: 0.6,
  cooldown_hours: 24,
  channels: ['email', 'slack'],
};

const RULE_DISABLED: MispricingRule = {
  ...RULE_ENABLED,
  enabled: false,
};

const HISTORY: MispricingHistoryEntry[] = [
  {
    symbol: '600519',
    gap_pct: -8.2,
    confidence: 0.82,
    direction: 'under',
    fired_at: '2026-06-01T09:30:00Z',
  },
  {
    symbol: '000858',
    gap_pct: 6.5,
    confidence: 0.71,
    direction: 'over',
    fired_at: '2026-06-02T14:00:00Z',
  },
];

const WOULD_FIRE: WouldFireEntry[] = [
  { symbol: '601318', gap_pct: -11.0, confidence: 0.88, direction: 'under' },
  { symbol: '002594', gap_pct: 7.3, confidence: 0.65, direction: 'over' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MispricingAlertPanel', () => {
  // ── 1. Renders rule form from initialRule prop ───────────────────────────

  it('renders the rule form when initialRule provided', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    expect(screen.getByTestId('mispricing-alert-panel')).toBeInTheDocument();
    expect(screen.getByTestId('rule-enabled-toggle')).toBeChecked();
    expect(screen.getByTestId('rule-threshold-input')).toHaveValue(5);
    expect(screen.getByTestId('rule-confidence-input')).toHaveValue(0.6);
    expect(screen.getByTestId('rule-cooldown-input')).toHaveValue(24);
    expect(screen.getByTestId('rule-channels-input')).toHaveValue('email, slack');
  });

  // ── 2. Disabled-rule notice appears when enabled=false ───────────────────

  it('shows disabled notice when rule.enabled is false', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_DISABLED} initialHistory={[]} />,
    );

    expect(screen.getByTestId('rule-disabled-notice')).toBeInTheDocument();
    expect(screen.getByTestId('rule-disabled-notice')).toHaveTextContent('当前已停用');
  });

  // ── 3. No disabled notice when enabled=true ──────────────────────────────

  it('does not show disabled notice when rule is enabled', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );
    expect(screen.queryByTestId('rule-disabled-notice')).not.toBeInTheDocument();
  });

  // ── 4. History list renders entries ─────────────────────────────────────

  it('renders history entries', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={HISTORY} />,
    );

    const rows = screen.getAllByTestId('history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('600519');
    expect(rows[1]).toHaveTextContent('000858');
  });

  // ── 5. Empty history state ───────────────────────────────────────────────

  it('shows empty-state message when history is empty', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
  });

  // ── 6. Direction selector works ──────────────────────────────────────────

  it('updates direction when a direction button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('rule-direction-under'));
    // The "under" button should now be styled as selected — we test indirectly
    // by checking the save call uses the updated direction.
    vi.mocked(saveMispricingRule).mockResolvedValueOnce({
      ...RULE_ENABLED,
      direction: 'under',
    });

    await user.click(screen.getByTestId('save-rule-btn'));
    await waitFor(() => {
      expect(saveMispricingRule).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'under' }),
      );
    });
  });

  // ── 7. Save button calls saveMispricingRule ──────────────────────────────

  it('calls saveMispricingRule with the current form values on save', async () => {
    const user = userEvent.setup();
    vi.mocked(saveMispricingRule).mockResolvedValueOnce(RULE_ENABLED);

    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('save-rule-btn'));
    await waitFor(() => {
      expect(saveMispricingRule).toHaveBeenCalledOnce();
    });
    // No error message
    expect(screen.queryByTestId('save-error-msg')).not.toBeInTheDocument();
  });

  // ── 8. Save error shows message ──────────────────────────────────────────

  it('shows save-error when saveMispricingRule rejects', async () => {
    const user = userEvent.setup();
    vi.mocked(saveMispricingRule).mockRejectedValueOnce(new Error('network'));

    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('save-rule-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('save-error-msg')).toBeInTheDocument();
    });
  });

  // ── 9. Evaluate dry-run renders would-fire list ──────────────────────────

  it('renders would-fire entries after evaluate', async () => {
    const user = userEvent.setup();
    vi.mocked(evaluateMispricing).mockResolvedValueOnce({
      status: 'ok',
      rule: RULE_ENABLED,
      evaluated: 120,
      would_fire: WOULD_FIRE,
    });

    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('evaluate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('would-fire-list')).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId('would-fire-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('601318');
    expect(rows[1]).toHaveTextContent('002594');
  });

  // ── 10. Empty would-fire state ───────────────────────────────────────────

  it('shows empty-state message when would_fire is empty', async () => {
    const user = userEvent.setup();
    vi.mocked(evaluateMispricing).mockResolvedValueOnce({
      status: 'ok',
      rule: RULE_ENABLED,
      evaluated: 50,
      would_fire: [],
    });

    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('evaluate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('evaluate-empty')).toBeInTheDocument();
    });
  });

  // ── 11. Evaluate error shows message ────────────────────────────────────

  it('shows eval-error when evaluateMispricing rejects', async () => {
    const user = userEvent.setup();
    vi.mocked(evaluateMispricing).mockRejectedValueOnce(new Error('fail'));

    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );

    await user.click(screen.getByTestId('evaluate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('eval-error-msg')).toBeInTheDocument();
    });
  });

  // ── 12. Threshold input updates ──────────────────────────────────────────

  it('updates threshold when input changes', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );
    const input = screen.getByTestId('rule-threshold-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10' } });
    expect(input.value).toBe('10');
  });

  // ── 13. Channels input updates ───────────────────────────────────────────

  it('updates channels text when input changes', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );
    const input = screen.getByTestId('rule-channels-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'webhook' } });
    expect(input.value).toBe('webhook');
  });

  // ── 14. History panel always renders ────────────────────────────────────

  it('renders history panel container regardless of history content', () => {
    render(
      <MispricingAlertPanel initialRule={RULE_ENABLED} initialHistory={[]} />,
    );
    expect(screen.getByTestId('history-panel')).toBeInTheDocument();
  });
});
