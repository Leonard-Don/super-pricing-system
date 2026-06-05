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
  getMacroOverview,
  getAltDataSnapshot,
  getAltDataStatus,
  refreshAltData,
  getAltDataHistory,
} from '@/services/api/altDataAndMacro';
import { getCrossMarketTemplates } from '@/services/api/crossMarket';
import { getResearchTasks } from '@/services/api/research';

describe('altDataAndMacro api', () => {
  beforeEach(() => {
    post.mockClear();
    get.mockClear();
  });

  it('getMacroOverview(true) GETs /macro/overview with refresh=true', async () => {
    await getMacroOverview(true);
    expect(get.mock.calls[0][0]).toContain('/macro/overview');
    expect(get.mock.calls[0][0]).toContain('refresh=true');
  });

  it('getMacroOverview defaults to refresh=false', async () => {
    await getMacroOverview();
    expect(get.mock.calls[0][0]).toContain('refresh=false');
  });

  it('getAltDataSnapshot GETs /alt-data/snapshot', async () => {
    await getAltDataSnapshot();
    expect(get.mock.calls[0][0]).toContain('/alt-data/snapshot');
  });

  it('getAltDataSnapshot(true) includes refresh=true', async () => {
    await getAltDataSnapshot(true);
    expect(get.mock.calls[0][0]).toContain('refresh=true');
  });

  it('getAltDataStatus GETs /alt-data/status', async () => {
    await getAltDataStatus();
    expect(get.mock.calls[0][0]).toContain('/alt-data/status');
  });

  it('refreshAltData("all") POSTs to /alt-data/refresh', async () => {
    await refreshAltData('all');
    expect(post.mock.calls[0][0]).toContain('/alt-data/refresh');
  });

  it('refreshAltData passes provider in query string', async () => {
    await refreshAltData('people_layer');
    expect(post.mock.calls[0][0]).toContain('provider=people_layer');
  });

  it('refreshAltData defaults to provider=all', async () => {
    await refreshAltData();
    expect(post.mock.calls[0][0]).toContain('provider=all');
  });

  it('getAltDataHistory GETs /alt-data/history', async () => {
    await getAltDataHistory({});
    expect(get.mock.calls[0][0]).toContain('/alt-data/history');
  });

  it('getAltDataHistory appends query params when provided', async () => {
    await getAltDataHistory({ category: 'people', timeframe: '7d', limit: 20 });
    const url: string = get.mock.calls[0][0] as string;
    expect(url).toContain('category=people');
    expect(url).toContain('timeframe=7d');
    expect(url).toContain('limit=20');
  });
});

describe('crossMarket api', () => {
  beforeEach(() => {
    get.mockClear();
  });

  it('getCrossMarketTemplates GETs /cross-market/templates', async () => {
    await getCrossMarketTemplates();
    expect(get.mock.calls[0][0]).toBe('/cross-market/templates');
  });
});

describe('research api', () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it('getResearchTasks GETs /research-workbench/tasks', async () => {
    await getResearchTasks({});
    expect(get.mock.calls[0][0]).toContain('/research-workbench/tasks');
  });

  it('getResearchTasks({limit:60}) includes limit=60 in query', async () => {
    await getResearchTasks({ limit: 60 });
    expect(get.mock.calls[0][0]).toContain('limit=60');
  });

  it('getResearchTasks with no params produces clean path without ?', async () => {
    await getResearchTasks({});
    expect(get.mock.calls[0][0]).toBe('/research-workbench/tasks');
  });
});
