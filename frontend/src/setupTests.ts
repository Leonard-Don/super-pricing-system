import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no `matchMedia`. Default to `prefers-reduced-motion: reduce` so motion
// hooks (e.g. useCountUp) resolve to their final value synchronously in tests.
// Individual tests can still override `window.matchMedia` for animation-specific cases.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
