// Tests for SnapshotSummary (Task 8).
// TDD: written before implementation — will fail until component exists.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import SnapshotSummary from '../SnapshotSummary';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const pricingTask = {
  id: 'task-p1',
  type: 'pricing',
  snapshot: {
    headline: '定价快照 · AAPL',
    summary: '当前价被低估 10%，建议买入',
    highlights: ['因子共振显著', '治理层无风险'],
    payload: {
      fair_value: { mid: 120, low: 108, high: 132 },
      gap_analysis: { gap_pct: -10, fair_value_mid: 120, current_price: 108 },
      implications: {
        primary_view: 'undervalued',
        confidence: 'high',
        confidence_score: 0.87,
        factor_alignment: { label: 'aligned', summary: '三因子同向' },
      },
      period: '12M',
      current_price_source: 'realtime',
    },
  },
};

const crossMarketTask = {
  id: 'task-cm1',
  type: 'cross_market',
  snapshot: {
    headline: '跨市场快照',
    summary: '美股/A股组合偏置稳健',
    highlights: [],
    payload: {
      trade_thesis: {
        thesis: { stance: 'long', horizon: '3M' },
        symbol: 'SPY',
        results_summary: { total_return: 0.12, sharpe_ratio: 1.8, coverage: 0.95 },
        assets: [
          { symbol: 'SPY', side: 'long' },
          { symbol: '510300', side: 'short' },
        ],
      },
      template_meta: {
        theme: 'macro_divergence',
        allocation_mode: 'macro_bias',
        selection_quality: { label: 'original' },
      },
    },
  },
};

describe('SnapshotSummary', () => {
  it('renders empty state when task has no snapshot', () => {
    render(<SnapshotSummary task={{ id: 't0', type: 'pricing' }} />);
    expect(screen.getByText(/暂无保存快照/)).toBeDefined();
  });

  it('renders the headline for a pricing snapshot', () => {
    render(<SnapshotSummary task={pricingTask} />);
    expect(screen.getByText('定价快照 · AAPL')).toBeDefined();
  });

  it('renders the summary text for a pricing snapshot', () => {
    render(<SnapshotSummary task={pricingTask} />);
    expect(screen.getByText('当前价被低估 10%，建议买入')).toBeDefined();
  });

  it('renders fair_value / gap core fields for pricing path', () => {
    render(<SnapshotSummary task={pricingTask} />);
    // Should show current price or fair value info
    expect(screen.getByText(/公允价值|108|120/)).toBeDefined();
  });

  it('renders primary_view implications for pricing snapshot', () => {
    render(<SnapshotSummary task={pricingTask} />);
    // implications primary_view rendered — use getAllByText because the regex may match multiple nodes
    expect(screen.getAllByText(/undervalued|低估/i).length).toBeGreaterThan(0);
  });

  it('renders highlights list', () => {
    render(<SnapshotSummary task={pricingTask} />);
    expect(screen.getByText('因子共振显著')).toBeDefined();
    expect(screen.getByText('治理层无风险')).toBeDefined();
  });

  it('renders cross-market snapshot headline', () => {
    render(<SnapshotSummary task={crossMarketTask} />);
    expect(screen.getByText('跨市场快照')).toBeDefined();
  });

  it('renders cross-market trade thesis stance', () => {
    render(<SnapshotSummary task={crossMarketTask} />);
    // multiple elements may contain "long" — use getAllByText
    expect(screen.getAllByText(/long|Thesis/i).length).toBeGreaterThan(0);
  });

  it('renders backtest total_return for cross-market snapshot', () => {
    render(<SnapshotSummary task={crossMarketTask} />);
    // 0.12 * 100 = 12.00%
    expect(screen.getByText(/12\.00%|回测/)).toBeDefined();
  });
});
