import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PricingLayout } from '@/routes/pricing/PricingLayout';

describe('PricingLayout', () => {
  it('renders three sub-nav links', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <Routes>
          <Route path="/pricing/*" element={<PricingLayout />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '分析' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '估值历史' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '自定义因子' })).toBeInTheDocument();
  });

  it('renders the outlet for nested route /pricing/valuation', () => {
    render(
      <MemoryRouter initialEntries={['/pricing/valuation']}>
        <Routes>
          <Route path="/pricing" element={<PricingLayout />}>
            <Route path="valuation" element={<div>Valuation Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Valuation Content')).toBeInTheDocument();
  });
});
