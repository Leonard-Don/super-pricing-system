/**
 * CredibilityBadge — one-line verdict strip.
 *
 * When status !== 'ok': shows "累积中 · 样本 N · 自 DATE"
 * When status === 'ok': shows the hit-rate percentage + sample-size disclosure
 *
 * Honest rule: never renders a precise metric when status !== 'ok'.
 */
import { DataNumber } from '@/components/command';

export interface CredibilityBadgeProps {
  status: 'ok' | 'insufficient_data' | string;
  sampleSize: number;
  sinceDate: string | null;
  /** Required when status === 'ok' */
  hitRate?: number;
  className?: string;
}

export function CredibilityBadge({
  status,
  sampleSize,
  sinceDate,
  hitRate,
  className,
}: CredibilityBadgeProps) {
  const isOk = status === 'ok';

  if (!isOk) {
    return (
      <span
        className={
          className ??
          'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--cmd-ink3)]'
        }
      >
        <span className="text-[var(--cmd-amber-bright,#f3b85a)]">●</span>
        <span>累积中</span>
        <span className="text-white/30">·</span>
        <span>
          样本{' '}
          <DataNumber value={sampleSize} className="text-[11px]" />
        </span>
        {sinceDate && (
          <>
            <span className="text-white/30">·</span>
            <span>自 {sinceDate}</span>
          </>
        )}
      </span>
    );
  }

  const pct = hitRate != null ? Math.round(hitRate * 100) : null;
  const tone = pct != null && pct >= 55 ? 'pos' : pct != null && pct < 45 ? 'neg' : 'amber';

  return (
    <span
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[var(--cmd-ink2)]'
      }
    >
      <span className="text-[var(--pos,#4ade80)]">✓</span>
      {pct != null ? (
        <>
          <span>胜率</span>
          <DataNumber value={`${pct}%`} tone={tone} className="text-[11px]" />
        </>
      ) : (
        <span>—</span>
      )}
      <span className="text-white/30">·</span>
      <span>
        样本{' '}
        <DataNumber value={sampleSize} className="text-[11px]" />
      </span>
    </span>
  );
}
