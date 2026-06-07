import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PricingScreenerCard } from '@/features/pricing/components/PricingScreenerCard';

describe('PricingScreenerCard', () => {
  const defaultProps = {
    universe: '',
    onUniverseChange: vi.fn(),
    period: '1y',
    filter: 'all',
    onFilterChange: vi.fn(),
    sectorFilter: 'all',
    onSectorFilterChange: vi.fn(),
    minScore: 0,
    onMinScoreChange: vi.fn(),
    results: [],
    loading: false,
    onRun: vi.fn(),
    onApplyPreset: vi.fn(),
  };

  it('renders universe textarea', () => {
    render(<PricingScreenerCard {...defaultProps} />);
    expect(screen.getByTestId('pricing-screener-input')).toBeInTheDocument();
  });

  it('renders 批量筛选 button', () => {
    render(<PricingScreenerCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /批量筛选/ })).toBeInTheDocument();
  });

  it('clicking 批量筛选 calls onRun', async () => {
    const onRun = vi.fn();
    render(<PricingScreenerCard {...defaultProps} onRun={onRun} />);
    await userEvent.click(screen.getByRole('button', { name: /批量筛选/ }));
    expect(onRun).toHaveBeenCalled();
  });

  it('renders preset chips', () => {
    render(<PricingScreenerCard {...defaultProps} />);
    // SCREENING_PRESETS has '美股巨头', '半导体', '高增长软件'
    expect(screen.getByText('美股巨头')).toBeInTheDocument();
  });

  it('clicking preset chip calls onApplyPreset', async () => {
    const onApplyPreset = vi.fn();
    render(<PricingScreenerCard {...defaultProps} onApplyPreset={onApplyPreset} />);
    await userEvent.click(screen.getByText('美股巨头'));
    expect(onApplyPreset).toHaveBeenCalledWith(
      expect.arrayContaining(['AAPL', 'MSFT']),
    );
  });

  it('renders results table when results provided', () => {
    const results = [
      {
        symbol: 'AAPL',
        company_name: 'Apple',
        sector: 'Technology',
        period: '1y',
        current_price: 150,
        fair_value: 180,
        gap_pct: -16.7,
        direction: 'undervalued',
        severity: 'moderate',
        severity_label: '中度低估',
        primary_view: '低估',
        confidence: 'high',
        confidence_score: 0.85,
        factor_alignment_status: 'aligned',
        factor_alignment_label: '同向',
        factor_alignment_summary: '',
        price_source: 'live',
        primary_driver: 'revenue',
        primary_driver_reason: '',
        people_governance_discount_pct: 0,
        people_governance_confidence: 0,
        people_governance_label: '',
        people_governance_summary: '',
        summary: '',
        screening_score: 18.5,
        rank: 1,
      },
    ];
    render(<PricingScreenerCard {...defaultProps} results={results} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });
});
