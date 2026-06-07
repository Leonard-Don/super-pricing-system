import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the underlying primitive BEFORE importing the shared cache.
// ---------------------------------------------------------------------------

const mockGetResearchBriefingDistribution = vi.fn();

vi.mock('@/services/api/research', () => ({
  getResearchBriefingDistribution: (...args: unknown[]) =>
    mockGetResearchBriefingDistribution(...args),
}));

import {
  getResearchBriefingDistributionShared,
  resetResearchBriefingDistributionCache,
} from '@/services/api/researchBriefingDistributionCache';

const fakeDistribution = {
  success: true,
  data: { distribution: {}, delivery_history: [], schedule: {} },
};

describe('researchBriefingDistributionCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetResearchBriefingDistributionCache();
    mockGetResearchBriefingDistribution.mockResolvedValue(fakeDistribution);
  });

  it('dedupes concurrent callers into a single underlying request', async () => {
    // Simulates StrictMode's synchronous double-invoke of the mount effect:
    // every caller that arrives while the request is in-flight shares it.
    const results = await Promise.all([
      getResearchBriefingDistributionShared(),
      getResearchBriefingDistributionShared(),
      getResearchBriefingDistributionShared(),
      getResearchBriefingDistributionShared(),
    ]);

    expect(mockGetResearchBriefingDistribution).toHaveBeenCalledOnce();
    for (const result of results) {
      expect(result).toBe(fakeDistribution);
    }
  });

  it('refetches once the previous request has settled (no stale caching across mounts)', async () => {
    // Unlike the infra-status cache, distribution config changes (e.g. on save),
    // so a genuine remount must load fresh data rather than serve a stale value.
    await getResearchBriefingDistributionShared();
    await getResearchBriefingDistributionShared();
    expect(mockGetResearchBriefingDistribution).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight cache on failure so the next call retries', async () => {
    mockGetResearchBriefingDistribution.mockRejectedValueOnce(new Error('boom'));
    await expect(getResearchBriefingDistributionShared()).rejects.toThrow('boom');

    const result = await getResearchBriefingDistributionShared();
    expect(result).toBe(fakeDistribution);
    expect(mockGetResearchBriefingDistribution).toHaveBeenCalledTimes(2);
  });

  it('resetResearchBriefingDistributionCache drops the in-flight request', async () => {
    const first = getResearchBriefingDistributionShared();
    resetResearchBriefingDistributionCache();
    const second = getResearchBriefingDistributionShared();

    await Promise.all([first, second]);
    // Reset between the two calls forces a second underlying request.
    expect(mockGetResearchBriefingDistribution).toHaveBeenCalledTimes(2);
  });
});
