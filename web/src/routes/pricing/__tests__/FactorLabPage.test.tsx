import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock runQuantFactorExpression from quantLab API
// ---------------------------------------------------------------------------
const mockRunQuantFactorExpression = vi.fn();
vi.mock('@/services/api/quantLab', () => ({
  runQuantFactorExpression: (...args: unknown[]) =>
    mockRunQuantFactorExpression(...args),
  queueQuantFactorExpressionTask: vi.fn(),
}));

// Minimal factor expression result shape (enough for stat cards + preview table)
const MINIMAL_RESULT = {
  latest_value: 1.234567,
  diagnostics: {
    non_null_factor_points: 245,
    rows: 252,
  },
  preview: [
    { date: '2025-06-01', factor: 1.234567 },
    { date: '2025-05-31', factor: 0.987654 },
  ],
};

import FactorLabPage from '@/routes/pricing/FactorLabPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pricing/factors']}>
      <FactorLabPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockRunQuantFactorExpression.mockReset();
});

describe('FactorLabPage', () => {
  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText(/自定义因子/)).toBeInTheDocument();
  });

  it('renders the default expression in the textarea', () => {
    renderPage();
    const textarea = screen.getByRole('textbox', { name: /因子表达式/ });
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe(
      'rank(close / sma(close, 20)) + rank(volume / sma(volume, 20))',
    );
  });

  it('renders the symbol input with default value AAPL', () => {
    renderPage();
    const input = screen.getByLabelText(/标的代码/);
    expect((input as HTMLInputElement).value).toBe('AAPL');
  });

  it('renders the safety-notice Alert with whitelisted functions', () => {
    renderPage();
    // Alert description mentions whitelisted functions (use getAllByText to
    // handle cases where "rank" also appears in the textarea default value)
    expect(screen.getAllByText(/rank/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/zscore|rolling_std/).length).toBeGreaterThan(0);
  });

  it('renders the 运行 button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /运行/ })).toBeInTheDocument();
  });

  it('calls runQuantFactorExpression when 运行 is clicked', async () => {
    mockRunQuantFactorExpression.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      expect(mockRunQuantFactorExpression).toHaveBeenCalledOnce();
    });

    const callArg = mockRunQuantFactorExpression.mock.calls[0][0] as {
      symbol: string;
      expression: string;
    };
    expect(callArg.symbol).toBe('AAPL');
    expect(callArg.expression).toBe(
      'rank(close / sma(close, 20)) + rank(volume / sma(volume, 20))',
    );
  });

  it('renders latest_value stat after a successful run', async () => {
    mockRunQuantFactorExpression.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      expect(screen.getByText('最新因子值')).toBeInTheDocument();
    });

    // 1.234567 formatted to 4 decimals → "1.2346"
    expect(screen.getAllByText(/1\.234/).length).toBeGreaterThan(0);
  });

  it('renders non_null_factor_points and rows stats', async () => {
    mockRunQuantFactorExpression.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      expect(screen.getByText('有效点数')).toBeInTheDocument();
      expect(screen.getByText('样本行数')).toBeInTheDocument();
    });

    expect(screen.getAllByText('245').length).toBeGreaterThan(0);
    expect(screen.getAllByText('252').length).toBeGreaterThan(0);
  });

  it('renders factor-preview table with a row', async () => {
    mockRunQuantFactorExpression.mockResolvedValue(MINIMAL_RESULT);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      // Table header
      expect(screen.getByText('日期')).toBeInTheDocument();
      expect(screen.getByText('因子值')).toBeInTheDocument();
    });

    // Preview row date
    expect(screen.getByText('2025-06-01')).toBeInTheDocument();
    // Factor value 1.234567 to 6 decimals
    expect(screen.getByText('1.234567')).toBeInTheDocument();
  });

  it('shows error message when API call fails', async () => {
    mockRunQuantFactorExpression.mockRejectedValue(new Error('计算失败'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      expect(screen.getByText(/计算失败|因子计算失败/)).toBeInTheDocument();
    });
  });

  it('does not submit when symbol is empty', () => {
    renderPage();

    const input = screen.getByLabelText(/标的代码/);
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /运行/ }));

    expect(mockRunQuantFactorExpression).not.toHaveBeenCalled();
  });
});
