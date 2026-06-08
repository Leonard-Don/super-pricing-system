/**
 * CredibilityPanel — per-horizon metrics display.
 *
 * For each horizon in the credibility response it renders:
 *   - Hit-rate (MicroBar + %)
 *   - IC (MicroBar, diverging)
 *   - Directional long / short avg returns (MicroBars)
 *   - Sample-size disclosure
 *
 * Honest states:
 *   - status !== 'ok' → shows accumulating badge, never exposes null metrics
 *   - data undefined → shows Skeleton placeholders
 */
import { GlassPanel, SectionFrame, MicroBar, Skeleton, DataNumber } from '@/components/command';
import { CredibilityBadge } from './CredibilityBadge';
import type { CredibilityResponse, HorizonResult } from '../types';

function HorizonRow({ h }: { h: HorizonResult }) {
  if (h.status !== 'ok') {
    return (
      <div className="py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--cmd-ink3)]">
            {h.horizon}日
          </span>
          <CredibilityBadge
            status={h.status}
            sampleSize={h.sample_size}
            sinceDate={null}
          />
        </div>
      </div>
    );
  }

  const hitRatePct = h.hit_rate.value != null ? Math.round(h.hit_rate.value * 100) : null;
  const hitRateTone =
    hitRatePct != null && hitRatePct >= 55 ? 'pos' : hitRatePct != null && hitRatePct < 45 ? 'neg' : 'amber';

  const icVal = h.ic.value ?? 0;
  const icTone = icVal > 0 ? 'pos' : 'neg';

  return (
    <div className="py-2.5 border-b border-white/[0.06] last:border-0">
      {/* Horizon header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cmd-ink2)]">
          {h.horizon}日窗口
        </span>
        <span className="text-[10px] text-[var(--cmd-ink3)]">
          样本 <DataNumber value={h.sample_size} className="text-[10px]" />
        </span>
      </div>

      {/* Hit rate */}
      <div className="mb-1.5">
        <div className="mb-0.5 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
          <span>胜率</span>
          {hitRatePct != null && (
            <DataNumber value={`${hitRatePct}%`} tone={hitRateTone} className="text-[10px]" />
          )}
        </div>
        <MicroBar
          value={h.hit_rate.value ?? 0}
          max={1}
          tone={hitRateTone}
        />
      </div>

      {/* IC */}
      <div className="mb-1.5">
        <div className="mb-0.5 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
          <span>IC</span>
          {h.ic.value != null && (
            <DataNumber
              value={h.ic.value.toFixed(3)}
              tone={icTone}
              className="text-[10px]"
            />
          )}
        </div>
        <MicroBar
          value={h.ic.value ?? 0}
          max={0.5}
          diverging
          tone={icTone}
        />
      </div>

      {/* Directional — long */}
      {h.directional.long != null && (
        <div className="mb-1.5">
          <div className="mb-0.5 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
            <span>多头均回报</span>
            <DataNumber
              value={`${(h.directional.long * 100).toFixed(2)}%`}
              tone={h.directional.long >= 0 ? 'pos' : 'neg'}
              className="text-[10px]"
            />
          </div>
          <MicroBar
            value={h.directional.long}
            max={0.05}
            diverging
            tone={h.directional.long >= 0 ? 'pos' : 'neg'}
          />
        </div>
      )}

      {/* Directional — short */}
      {h.directional.short != null && (
        <div className="mb-1.5">
          <div className="mb-0.5 flex items-center justify-between text-[10px] text-[var(--cmd-ink3)]">
            <span>空头均回报</span>
            <DataNumber
              value={`${(h.directional.short * 100).toFixed(2)}%`}
              tone={h.directional.short <= 0 ? 'pos' : 'neg'}
              className="text-[10px]"
            />
          </div>
          <MicroBar
            value={Math.abs(h.directional.short)}
            max={0.05}
            tone={h.directional.short <= 0 ? 'pos' : 'neg'}
          />
        </div>
      )}
    </div>
  );
}

export interface CredibilityPanelProps {
  data: CredibilityResponse | undefined;
  title?: string;
  className?: string;
}

export function CredibilityPanel({
  data,
  title = '信号可信度',
  className,
}: CredibilityPanelProps) {
  if (data === undefined) {
    return (
      <GlassPanel className={className}>
        <div className="p-4">
          <Skeleton w="60%" h={12} className="mb-3" />
          <Skeleton w="100%" h={8} className="mb-2" />
          <Skeleton w="100%" h={8} className="mb-2" />
          <Skeleton w="80%" h={8} />
        </div>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className={className}>
      <div className="p-4">
        <SectionFrame title={title} latin="Credibility" />

        {data.horizons.length === 0 ? (
          <div className="py-3 text-[11px] text-[var(--cmd-ink3)]">
            暂无可信度数据
          </div>
        ) : (
          data.horizons.map((h) => <HorizonRow key={h.horizon} h={h} />)
        )}

        {data.since_date && (
          <div className="mt-2 text-[10px] text-[var(--cmd-ink3)]">
            自 {data.since_date} 起累积 · 最低样本要求 {data.min_sample}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
