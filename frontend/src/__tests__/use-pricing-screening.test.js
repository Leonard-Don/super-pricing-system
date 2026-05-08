import { renderHook } from '@testing-library/react';

import usePricingScreening from '../components/pricing/usePricingScreening';

jest.mock('../services/api', () => ({
  runPricingScreener: jest.fn(),
}));

jest.mock('../utils/messageApi', () => ({
  useSafeMessageApi: () => ({
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  }),
}));

describe('usePricingScreening initial values', () => {
  it('defaults to all/all/0 when no initial filter values are supplied', () => {
    const { result } = renderHook(() => usePricingScreening({
      handleAnalyze: jest.fn(),
      period: '1y',
      setSymbol: jest.fn(),
    }));

    expect(result.current.screeningFilter).toBe('all');
    expect(result.current.screeningSector).toBe('all');
    expect(result.current.screeningMinScore).toBe(0);
  });

  it('initializes filter, sector and min score from caller-supplied values (e.g. restored from a workbench return-to-screener deep link)', () => {
    const { result } = renderHook(() => usePricingScreening({
      handleAnalyze: jest.fn(),
      period: 'ttm',
      setSymbol: jest.fn(),
      initialScreeningFilter: 'undervalued',
      initialScreeningSector: 'tech',
      initialScreeningMinScore: 12,
    }));

    expect(result.current.screeningFilter).toBe('undervalued');
    expect(result.current.screeningSector).toBe('tech');
    expect(result.current.screeningMinScore).toBe(12);
  });
});
