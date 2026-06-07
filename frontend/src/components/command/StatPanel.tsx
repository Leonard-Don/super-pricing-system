import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { GlassPanel } from './GlassPanel';
import { DataNumber, type NumberTone } from './DataNumber';
import { useCountUp } from './useCountUp';

export function StatPanel({
  label,
  value,
  meta,
  focus = false,
  tone = 'default',
  animate = false,
  decimals = 2,
}: {
  label: string;
  value: string | number;
  meta?: ReactNode;
  focus?: boolean;
  tone?: NumberTone;
  /** When true and value is numeric, count-up animate it on mount. */
  animate?: boolean;
  decimals?: number;
}) {
  // Hook is always called (rules-of-hooks); result is ignored unless animating a number.
  const animated = useCountUp(typeof value === 'number' ? value : 0);
  const display =
    animate && typeof value === 'number' ? animated.toFixed(decimals) : value;
  // Focus adds glow/border, but must NOT override an explicit caller tone (e.g. a
  // pos/neg gap sign cue). Only the default tone falls back to amber when focused.
  const resolvedTone: NumberTone = tone !== 'default' ? tone : focus ? 'amber' : 'default';
  return (
    <GlassPanel
      className={cn(
        'p-4',
        focus &&
          'border-primary/30 bg-gradient-to-b from-primary/[0.07] to-primary/[0.015] shadow-[0_14px_40px_-16px_var(--cmd-glow-amber)]',
      )}
    >
      <div data-focus={focus} className="flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">{label}</div>
        <div className="text-[38px] leading-none">
          <DataNumber value={display} tone={resolvedTone} glow={focus} />
        </div>
        {meta != null && <div className="text-[11.5px] text-[var(--cmd-ink2)]">{meta}</div>}
      </div>
    </GlassPanel>
  );
}
