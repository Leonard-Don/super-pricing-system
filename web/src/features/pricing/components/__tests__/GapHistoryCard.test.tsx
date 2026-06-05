import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GapHistoryCard } from '@/features/pricing/components/GapHistoryCard';

const historyData = {
  history: [
    { date: '2024-01-01', gap_pct: -5.2, price: 182.5 },
    { date: '2024-02-01', gap_pct: -3.1, price: 185.0 },
    { date: '2024-03-01', gap_pct: 1.4, price: 188.5 },
  ],
  summary: {
    latest_gap_pct: 1.4,
    max_gap_pct: 12.3,
    min_gap_pct: -8.7,
  },
};

describe('GapHistoryCard', () => {
  it('renders the ChartFrame card title', () => {
    render(<GapHistoryCard historyData={historyData} />);
    // outer card heading
    expect(screen.getByText('偏差历史时间序列')).toBeInTheDocument();
    // ChartFrame also renders its own title
    expect(screen.getAllByText(/偏差历史/).length).toBeGreaterThan(0);
  });

  it('renders latest gap badge from summary', () => {
    render(<GapHistoryCard historyData={historyData} />);
    expect(screen.getByText(/最新偏差/)).toBeInTheDocument();
  });

  it('renders with empty history gracefully', () => {
    render(<GapHistoryCard historyData={{ history: [], summary: {} }} />);
    expect(screen.getByText('偏差历史时间序列')).toBeInTheDocument();
    expect(screen.getByText('暂无历史偏差数据')).toBeInTheDocument();
  });

  it('renders without historyData', () => {
    render(<GapHistoryCard />);
    expect(screen.getByText('偏差历史时间序列')).toBeInTheDocument();
  });
});
