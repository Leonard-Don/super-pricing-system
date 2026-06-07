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
  getAltDataHealth,
  getAltDataNarrative,
  getCompositeSignalsClusterAware,
  getAltDataMacroBriefing,
} from '@/services/api/altDataAndMacro';

describe('alt-data diagnostics API', () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it('getAltDataHealth() GETs /alt-data/health', async () => {
    await getAltDataHealth();
    expect(get.mock.calls[0][0]).toBe('/alt-data/health');
  });

  it('getAltDataNarrative() GETs /alt-data/narrative', async () => {
    await getAltDataNarrative();
    expect(get.mock.calls[0][0]).toBe('/alt-data/narrative');
  });

  it('getAltDataNarrative({industry}) appends industry param', async () => {
    await getAltDataNarrative({ industry: 'steel' });
    expect(get.mock.calls[0][0]).toContain('/alt-data/narrative');
    expect(get.mock.calls[0][0]).toContain('industry=steel');
  });

  it('getCompositeSignalsClusterAware() GETs /alt-data/composite-signals-cluster-aware', async () => {
    await getCompositeSignalsClusterAware();
    expect(get.mock.calls[0][0]).toBe('/alt-data/composite-signals-cluster-aware');
  });

  it('getCompositeSignalsClusterAware({days_window:30}) appends query param', async () => {
    await getCompositeSignalsClusterAware({ days_window: 30 });
    expect(get.mock.calls[0][0]).toContain('/alt-data/composite-signals-cluster-aware');
    expect(get.mock.calls[0][0]).toContain('days_window=30');
  });

  it('getAltDataMacroBriefing() GETs /alt-data/macro-briefing', async () => {
    await getAltDataMacroBriefing();
    expect(get.mock.calls[0][0]).toBe('/alt-data/macro-briefing');
  });

  it('getAltDataMacroBriefing({time_window_days:14}) appends query param', async () => {
    await getAltDataMacroBriefing({ time_window_days: 14 });
    expect(get.mock.calls[0][0]).toContain('/alt-data/macro-briefing');
    expect(get.mock.calls[0][0]).toContain('time_window_days=14');
  });
});
