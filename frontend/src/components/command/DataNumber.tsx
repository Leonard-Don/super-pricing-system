import { cn } from '@/lib/utils';

export type NumberTone = 'default' | 'pos' | 'neg' | 'amber';

const toneClass: Record<NumberTone, string> = {
  default: 'text-foreground',
  pos: 'text-pos',
  neg: 'text-neg',
  amber: 'text-primary',
};

export function DataNumber({
  value,
  tone = 'default',
  glow = false,
  className,
}: {
  value: string | number;
  tone?: NumberTone;
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        toneClass[tone],
        glow && 'drop-shadow-[0_0_12px_var(--cmd-glow-amber)]',
        className,
      )}
    >
      {value}
    </span>
  );
}
