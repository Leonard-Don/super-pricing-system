// Tests for SnapshotComparePanel (Task 8).
// TDD: written before implementation — will fail until component exists.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SnapshotComparePanel from '../SnapshotComparePanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal pricing snapshot shaped like what the API returns. */
const makePricingSnapshot = (fairValueMid: number, gapPct: number) => ({
  saved_at: '2026-06-01T10:00:00Z',
  payload: {
    fair_value: { mid: fairValueMid, low: fairValueMid * 0.9, high: fairValueMid * 1.1 },
    gap_analysis: { gap_pct: gapPct, fair_value_mid: fairValueMid },
    implications: { primary_view: 'undervalued', confidence: 'high', confidence_score: 0.85 },
    period: '12M',
  },
});

const minimalTask = {
  id: 'task-1',
  type: 'pricing' as const,
  snapshot_history: [
    makePricingSnapshot(100, -10),
    makePricingSnapshot(120, 5),
  ],
};

describe('SnapshotComparePanel', () => {
  it('renders the comparison panel with testid', () => {
    render(
      <SnapshotComparePanel
        task={minimalTask}
        baseIndex={1}
        targetIndex={0}
        onBaseChange={() => void 0}
        onTargetChange={() => void 0}
      />,
    );
    expect(screen.getByTestId('workbench-snapshot-compare')).toBeDefined();
  });

  it('renders comparison rows when two snapshots are provided', () => {
    render(
      <SnapshotComparePanel
        task={minimalTask}
        baseIndex={1}
        targetIndex={0}
        onBaseChange={() => void 0}
        onTargetChange={() => void 0}
      />,
    );
    // The table should contain the fair-value row label
    expect(screen.getByText('公允价值')).toBeDefined();
    // The price-gap row
    expect(screen.getByText('价格偏差')).toBeDefined();
  });

  it('shows empty state when fewer than 2 snapshots exist', () => {
    const taskOne = { ...minimalTask, snapshot_history: [makePricingSnapshot(100, -5)] };
    render(
      <SnapshotComparePanel
        task={taskOne}
        baseIndex={0}
        targetIndex={0}
        onBaseChange={() => void 0}
        onTargetChange={() => void 0}
      />,
    );
    expect(screen.getByTestId('workbench-snapshot-compare')).toBeDefined();
    expect(screen.getByText(/至少需要两个快照/)).toBeDefined();
  });

  it('renders version selector labels', () => {
    render(
      <SnapshotComparePanel
        task={minimalTask}
        baseIndex={1}
        targetIndex={0}
        onBaseChange={() => void 0}
        onTargetChange={() => void 0}
      />,
    );
    // version option labels (dates or fallback version labels)
    const versionText = screen.getAllByText(/版本|2026/);
    expect(versionText.length).toBeGreaterThan(0);
  });

  it('accepts pre-built rows and renders them via DataTable', () => {
    const prebuiltRows = [
      { key: 'test-row', label: '测试指标', left: '100.00', right: '120.00', delta: '+20.00' },
    ];
    render(
      <SnapshotComparePanel
        rows={prebuiltRows}
        onBaseChange={() => void 0}
        onTargetChange={() => void 0}
      />,
    );
    expect(screen.getByText('测试指标')).toBeDefined();
    expect(screen.getByText('100.00')).toBeDefined();
    expect(screen.getByText('+20.00')).toBeDefined();
  });

  it('fires onBaseChange when user changes the base selector', async () => {
    const user = userEvent.setup();
    const onBaseChange = vi.fn();
    render(
      <SnapshotComparePanel
        task={minimalTask}
        baseIndex={1}
        targetIndex={0}
        onBaseChange={onBaseChange}
        onTargetChange={() => void 0}
      />,
    );
    const selects = screen.getAllByRole('combobox');
    // first combobox is base selector
    await user.selectOptions(selects[0], '0');
    expect(onBaseChange).toHaveBeenCalledWith(0);
  });
});
