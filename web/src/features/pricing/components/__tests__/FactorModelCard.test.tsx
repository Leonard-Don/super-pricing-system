import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FactorModelCard } from '@/features/pricing/components/FactorModelCard';

const minimalFactorModel = {
  capm: {
    alpha_pct: 8.25,
    beta: 1.12,
    r_squared: 0.74,
    significance: {
      alpha_t_stat: 2.1,
      alpha_p_value: 0.038,
      beta_t_stat: 14.3,
    },
    residual_diagnostics: { durbin_watson: 1.97 },
  },
  fama_french: {
    alpha_pct: 6.5,
    factor_loadings: { market: 1.08, size: -0.31, value: 0.15 },
    r_squared: 0.82,
    significance: {
      alpha_p_value: 0.045,
      market_p_value: 0.0001,
      size_p_value: 0.12,
      value_p_value: 0.34,
    },
  },
  period: '1y',
  data_points: 252,
};

describe('FactorModelCard', () => {
  it('renders CAPM alpha value', () => {
    render(<FactorModelCard data={minimalFactorModel} />);
    expect(screen.getByText(/8\.25/)).toBeInTheDocument();
  });

  it('renders CAPM beta value', () => {
    render(<FactorModelCard data={minimalFactorModel} />);
    expect(screen.getByText(/1\.12/)).toBeInTheDocument();
  });

  it('renders FF3 market loading', () => {
    render(<FactorModelCard data={minimalFactorModel} />);
    // getAllByText because the value appears both in the stat grid and the legend
    const matches = screen.getAllByText(/1\.08/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders factor model card section headings', () => {
    render(<FactorModelCard data={minimalFactorModel} />);
    expect(screen.getAllByText(/CAPM/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fama.French|FF3/i).length).toBeGreaterThan(0);
  });

  it('renders null when data is null', () => {
    const { container } = render(<FactorModelCard data={null} />);
    expect(container.firstChild).toBeNull();
  });
});
