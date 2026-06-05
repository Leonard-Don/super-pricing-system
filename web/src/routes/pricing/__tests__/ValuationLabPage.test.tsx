import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock runQuantValuationLab from quantLab API
// ---------------------------------------------------------------------------
const mockRunQuantValuationLab = vi.fn();
vi.mock('@/services/api/quantLab', () => ({
  runQuantValuationLab: (...args: unknown[]) => mockRunQuantValuationLab(...args),
  queueQuantValuationLab: vi.fn(),
}));

// Minimal valuation result shape (enough for stat cards)
const MINIMAL_RESULT = {
  ensemble_valuation: {
    fair_value: 182.5,
    gap_pct: -0.087,
    models: [
      { model: 'DCF', value: 185.0, weight: 0.5 },
      { model: 'Comparable', value: 180.0, weight: 0.5 },
    ],
  },
  analysis: {
    valuation: {
      current_price: 168.0,
    },
  },
  valuation_history: [
    {
      timestamp: '2025-06-01T10:00:00Z',
      fair_value: 182.5,
      market_price: 168.0,
      gap_pct: -0.087,
    },
  ],
  peer_matrix: {
    sector: 'Technology',
    industry: 'Software',
    summary: {
      peer_count: 4,
      custom_peer_count: 2,
      median_peer_premium_discount: -3.5,
    },
    rows: [
      {
        symbol: 'MSFT',
        is_target: false,
        peer_source: 'auto',
        current_price: 320.0,
        fair_value: 310.0,
        premium_discount: 3.2,
        pe_ratio: 28.5,
        price_to_sales: 9.5,
        revenue_growth: 0.12,
        earnings_growth: 0.15,
        return_on_equity: 0.42,
        profit_margin: 0.36,
        value_score: 0.65,
        growth_score: 0.71,
        quality_score: 0.82,
      },
    ],
  },
};

import ValuationLabPage from '@/routes/pricing/ValuationLabPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pricing/valuation']}>
      <ValuationLabPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockRunQuantValuationLab.mockReset();
});

describe('ValuationLabPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText(/估值历史/)).toBeInTheDocument();
  });

  it('renders the symbol input with default value', () => {
    renderPage();
    const input = screen.getByLabelText(/股票代码/);
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('AAPL');
  });

  it('renders the 运行估值 button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /运行估值/ })).toBeInTheDocument();
  });

  it('calls runQuantValuationLab when 运行估值 is clicked with a symbol', async () => {
    mockRunQuantValuationLab.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    // Symbol already pre-filled with AAPL
    const btn = screen.getByRole('button', { name: /运行估值/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockRunQuantValuationLab).toHaveBeenCalledOnce();
    });

    const callArg = mockRunQuantValuationLab.mock.calls[0][0] as { symbol: string };
    expect(callArg.symbol).toBe('AAPL');
  });

  it('renders 3 stat cards after a successful run', async () => {
    mockRunQuantValuationLab.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行估值/ }));

    // 综合公允价值 stat card (may also appear as table column header — use getAllBy)
    await waitFor(() => {
      expect(screen.getAllByText('综合公允价值').length).toBeGreaterThan(0);
    });

    // 市场偏离 stat card
    expect(screen.getByText('市场偏离')).toBeInTheDocument();

    // 现价 stat card (may also appear as table column header)
    expect(screen.getAllByText('现价').length).toBeGreaterThan(0);
  });

  it('renders fair value from result', async () => {
    mockRunQuantValuationLab.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行估值/ }));

    await waitFor(() => {
      // $182.50 formatted — may appear in stat card and history table
      expect(screen.getAllByText(/182\.5/).length).toBeGreaterThan(0);
    });
  });

  it('renders current price from result', async () => {
    mockRunQuantValuationLab.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行估值/ }));

    await waitFor(() => {
      // $168.00 formatted — may appear in stat card and table
      expect(screen.getAllByText(/168/).length).toBeGreaterThan(0);
    });
  });

  it('shows error message when API call fails', async () => {
    mockRunQuantValuationLab.mockRejectedValue(new Error('服务器错误'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行估值/ }));

    await waitFor(() => {
      expect(screen.getByText(/服务器错误|估值失败/)).toBeInTheDocument();
    });
  });

  it('does not submit when symbol is empty', () => {
    renderPage();

    // Clear symbol input
    const input = screen.getByLabelText(/股票代码/);
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /运行估值/ }));

    expect(mockRunQuantValuationLab).not.toHaveBeenCalled();
  });
});
