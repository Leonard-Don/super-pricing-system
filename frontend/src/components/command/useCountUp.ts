import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate a number from 0 to `target` over `durationMs` (ease-out).
 * Returns `target` immediately when the user prefers reduced motion or rAF is unavailable.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== 'function') return;
    startRef.current = null;
    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  // When the user prefers reduced motion (or rAF is unavailable), skip the
  // animation entirely and return the target directly — no state needed.
  return reduced || typeof requestAnimationFrame !== 'function' ? target : value;
}
