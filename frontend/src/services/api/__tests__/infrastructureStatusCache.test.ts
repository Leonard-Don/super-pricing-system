import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the underlying primitive BEFORE importing the shared cache.
// ---------------------------------------------------------------------------

const mockGetInfrastructureStatus = vi.fn();

vi.mock('@/services/api/infrastructure', () => ({
  getInfrastructureStatus: (...args: unknown[]) => mockGetInfrastructureStatus(...args),
}));

import {
  getInfrastructureStatusShared,
  resetInfrastructureStatusCache,
} from '@/services/api/infrastructureStatusCache';

const fakeStatus = { success: true, data: { notifications: { channels: [] } } };

describe('infrastructureStatusCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInfrastructureStatusCache();
    mockGetInfrastructureStatus.mockResolvedValue(fakeStatus);
  });

  it('dedupes concurrent callers into a single underlying request', async () => {
    const results = await Promise.all([
      getInfrastructureStatusShared(),
      getInfrastructureStatusShared(),
      getInfrastructureStatusShared(),
      getInfrastructureStatusShared(),
    ]);

    expect(mockGetInfrastructureStatus).toHaveBeenCalledOnce();
    for (const result of results) {
      expect(result).toBe(fakeStatus);
    }
  });

  it('serves the cached result to later callers without refetching', async () => {
    await getInfrastructureStatusShared();
    await getInfrastructureStatusShared();
    expect(mockGetInfrastructureStatus).toHaveBeenCalledOnce();
  });

  it('refetches after the cache is reset', async () => {
    await getInfrastructureStatusShared();
    resetInfrastructureStatusCache();
    await getInfrastructureStatusShared();
    expect(mockGetInfrastructureStatus).toHaveBeenCalledTimes(2);
  });

  it('clears the cache on failure so the next call retries', async () => {
    mockGetInfrastructureStatus.mockRejectedValueOnce(new Error('boom'));
    await expect(getInfrastructureStatusShared()).rejects.toThrow('boom');

    // Cache must have been cleared on rejection — the next call retries.
    const result = await getInfrastructureStatusShared();
    expect(result).toBe(fakeStatus);
    expect(mockGetInfrastructureStatus).toHaveBeenCalledTimes(2);
  });
});
