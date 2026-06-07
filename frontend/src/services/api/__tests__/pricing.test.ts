import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: {} });
const get = vi.fn().mockResolvedValue({ data: {} });
vi.mock('@/services/api/core', () => ({
  default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  api: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  withTimeoutProfile: (_p: string, c: object = {}) => c,
  API_TIMEOUT_PROFILES: { analysis: 120000, standard: 30000, dashboard: 45000, default: 300000, workbench: 30000 },
}));
import {
  getGapAnalysis,
  runPricingScreener,
  getPricingSymbolSuggestions,
  getPricingGapHistory,
  getPricingPeerComparison,
  getValuationSensitivityAnalysis,
} from '@/services/api/pricing';

describe('pricing api', () => {
  beforeEach(() => {
    post.mockClear();
    get.mockClear();
  });

  it('getGapAnalysis POSTs to /pricing/gap-analysis', async () => {
    await getGapAnalysis('AAPL', '1y');
    expect(post.mock.calls[0][0]).toBe('/pricing/gap-analysis');
  });

  it('getGapAnalysis sends symbol and period in body', async () => {
    await getGapAnalysis('AAPL', '1y');
    expect(post.mock.calls[0][1]).toEqual({ symbol: 'AAPL', period: '1y' });
  });

  it('runPricingScreener POSTs to /pricing/screener', async () => {
    await runPricingScreener(['AAPL', 'MSFT'], '1y', 10, 3);
    expect(post.mock.calls[0][0]).toBe('/pricing/screener');
  });

  it('runPricingScreener sends correct body', async () => {
    await runPricingScreener(['AAPL', 'MSFT'], '1y', 10, 3);
    expect(post.mock.calls[0][1]).toEqual({
      symbols: ['AAPL', 'MSFT'],
      period: '1y',
      limit: 10,
      max_workers: 3,
    });
  });

  it('getPricingSymbolSuggestions GETs /pricing/symbol-suggestions', async () => {
    await getPricingSymbolSuggestions('APP', 8);
    expect(get.mock.calls[0][0]).toContain('/pricing/symbol-suggestions');
  });

  it('getPricingSymbolSuggestions passes query params', async () => {
    await getPricingSymbolSuggestions('APP', 8);
    expect(get.mock.calls[0][0]).toContain('q=APP');
    expect(get.mock.calls[0][0]).toContain('limit=8');
  });

  it('getPricingGapHistory GETs /pricing/gap-history', async () => {
    await getPricingGapHistory('AAPL', '1y', 60);
    expect(get.mock.calls[0][0]).toContain('/pricing/gap-history');
  });

  it('getPricingPeerComparison GETs the right path', async () => {
    await getPricingPeerComparison('AAPL', 5);
    expect(get.mock.calls[0][0]).toContain('/pricing/peers');
  });

  it('getPricingPeerComparison sends symbol and limit', async () => {
    await getPricingPeerComparison('AAPL', 5);
    expect(get.mock.calls[0][0]).toContain('symbol=AAPL');
    expect(get.mock.calls[0][0]).toContain('limit=5');
  });

  it('getValuationSensitivityAnalysis POSTs to /pricing/valuation-sensitivity', async () => {
    const payload = { symbol: 'AAPL', period: '1y' };
    await getValuationSensitivityAnalysis(payload);
    expect(post.mock.calls[0][0]).toBe('/pricing/valuation-sensitivity');
    expect(post.mock.calls[0][1]).toEqual(payload);
  });
});
