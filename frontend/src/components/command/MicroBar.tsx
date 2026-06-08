import { cn } from '@/lib/utils';

type Tone = 'pos' | 'neg' | 'amber';
const TONE_BG: Record<Tone, string> = {
  pos: 'linear-gradient(90deg, var(--pos), #9be6b8)',
  neg: 'linear-gradient(90deg, var(--neg), #ffb1a8)',
  amber: 'linear-gradient(90deg, var(--cmd-amber-bright, #f3b85a), #ffd690)',
};

export function MicroBar({
  value,
  max = 1,
  diverging = false,
  tone,
  className,
}: {
  value: number;
  max?: number;
  diverging?: boolean;
  tone?: Tone;
  className?: string;
}) {
  if (diverging) {
    const half = max; // track half-width represents [0, max]
    const pct = Math.min(100, (Math.abs(value) / half) * 50);
    const side = value < 0 ? 'neg' : 'pos';
    const resolved: Tone = tone ?? (side === 'neg' ? 'neg' : 'pos');
    return (
      <div className={cn('relative h-[6px] w-full rounded-full bg-white/[0.06]', className)}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
        <div
          data-fill
          data-side={side}
          className="absolute top-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: TONE_BG[resolved],
            left: side === 'neg' ? `${50 - pct}%` : '50%',
          }}
        />
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const resolved: Tone = tone ?? 'amber';
  return (
    <div className={cn('h-[5px] w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div data-fill className="h-full rounded-full" style={{ width: `${pct}%`, background: TONE_BG[resolved] }} />
    </div>
  );
}
