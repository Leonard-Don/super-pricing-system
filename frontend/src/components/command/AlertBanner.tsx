import { cn } from '@/lib/utils';
import { DataNumber } from './DataNumber';

export function AlertBanner({
  title,
  text,
  score,
  tone = 'neg',
}: {
  title: string;
  text: string;
  score: string;
  tone?: 'neg' | 'amber';
}) {
  const border = tone === 'neg' ? 'border-neg/30' : 'border-primary/30';
  const wash = tone === 'neg' ? 'from-neg/10' : 'from-primary/10';
  return (
    <div className={cn('mt-3.5 flex items-center gap-3.5 rounded-xl border bg-gradient-to-r to-transparent px-[18px] py-[13px]', border, wash)}>
      <span className={cn('text-sm font-semibold', tone === 'neg' ? 'text-neg' : 'text-primary')}>
        <span>⚠ </span>
        <span>{title}</span>
      </span>
      <span className="text-[13px] text-[var(--cmd-ink2)]">{text}</span>
      <DataNumber value={score} tone={tone === 'neg' ? 'neg' : 'amber'} glow className="ml-auto text-[22px]" />
    </div>
  );
}
