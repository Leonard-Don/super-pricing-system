import { cn } from '@/lib/utils';

export type GlowBar = { h: number; accent?: 'amber' | 'blue' | 'dim' };

const accentClass: Record<NonNullable<GlowBar['accent']>, string> = {
  amber: 'bg-gradient-to-t from-primary/15 to-primary/90 shadow-[0_0_14px_var(--cmd-glow-amber)]',
  blue: 'bg-gradient-to-t from-[var(--cmd-blue)]/10 to-[var(--cmd-blue)]/85 shadow-[0_0_12px_rgba(110,168,255,0.28)]',
  dim: 'bg-gradient-to-t from-white/[0.03] to-white/20',
};

export function GlowBars({ bars, className }: { bars: GlowBar[]; className?: string }) {
  return (
    <div className={cn('flex h-[88px] items-end gap-[7px]', className)}>
      {bars.map((b, i) => (
        <div
          key={i}
          data-bar
          className={cn('flex-1 rounded-t', accentClass[b.accent ?? 'amber'])}
          style={{ height: `${Math.max(2, Math.min(100, b.h))}%` }}
        />
      ))}
    </div>
  );
}
