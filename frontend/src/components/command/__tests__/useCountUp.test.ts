import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCountUp } from '@/components/command/useCountUp';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn(),
  }));
}

describe('useCountUp', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the target immediately when reduced motion is preferred', () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(0.1686));
    expect(result.current).toBe(0.1686);
  });

  it('returns a finite number not exceeding the target on first frame', () => {
    mockReducedMotion(false);
    const { result } = renderHook(() => useCountUp(100));
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
