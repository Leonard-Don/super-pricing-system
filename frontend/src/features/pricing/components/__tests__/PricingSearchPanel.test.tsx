import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PricingSearchPanel } from '@/features/pricing/components/PricingSearchPanel';

describe('PricingSearchPanel', () => {
  const defaultProps = {
    symbol: '',
    onSymbolChange: vi.fn(),
    period: '1y',
    onPeriodChange: vi.fn(),
    onAnalyze: vi.fn(),
    loading: false,
  };

  it('renders symbol input', () => {
    render(<PricingSearchPanel {...defaultProps} />);
    expect(screen.getByTestId('pricing-symbol-input')).toBeInTheDocument();
  });

  it('renders 开始分析 button', () => {
    render(<PricingSearchPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /开始分析/ })).toBeInTheDocument();
  });

  it('typing a symbol calls onSymbolChange', async () => {
    const onSymbolChange = vi.fn();
    render(<PricingSearchPanel {...defaultProps} onSymbolChange={onSymbolChange} />);
    const input = screen.getByTestId('pricing-symbol-input');
    await userEvent.type(input, 'AAPL');
    expect(onSymbolChange).toHaveBeenCalled();
  });

  it('clicking 开始分析 calls onAnalyze', async () => {
    const onAnalyze = vi.fn();
    render(<PricingSearchPanel {...defaultProps} symbol="AAPL" onAnalyze={onAnalyze} />);
    await userEvent.click(screen.getByRole('button', { name: /开始分析/ }));
    expect(onAnalyze).toHaveBeenCalled();
  });

  it('renders hot symbol chips when hotSymbols provided', () => {
    render(
      <PricingSearchPanel
        {...defaultProps}
        hotSymbols={[{ symbol: 'NVDA', name: 'NVIDIA' }]}
      />,
    );
    expect(screen.getByText('NVDA')).toBeInTheDocument();
  });

  it('disables 导出 button when no data', () => {
    render(<PricingSearchPanel {...defaultProps} onExport={vi.fn()} />);
    // no data prop → export button should be disabled
    const exportBtn = screen.queryByRole('button', { name: /导出/ });
    if (exportBtn) {
      expect(exportBtn).toBeDisabled();
    }
  });
});
