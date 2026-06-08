// ---------------------------------------------------------------------------
// GodEyeHeader — command-center hero strip
// Rebuilt from frontend/src/components/GodEyeDashboard/GodEyeHeader.js (76)
// Props in, callbacks out. No API calls.
// ---------------------------------------------------------------------------

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LiveStatus, TacticalBackdrop } from '@/components/command';
import { getSignalLabel } from '@/features/godeye/lib/overviewViewModels';
import { signalColor } from '@/features/godeye/lib/macroFactorColors';

// Map the old antd color names to Tailwind class tokens
const SIGNAL_BADGE_CLASSES: Record<string, string> = {
  red: 'border-destructive text-destructive',
  gold: 'border-yellow-500 text-yellow-500',
  green: 'border-green-500 text-green-500',
};

function getSignalBadgeClass(macroSignal: number | undefined): string {
  const key = String(macroSignal ?? 0);
  const color = signalColor[key] ?? 'gold';
  return SIGNAL_BADGE_CLASSES[color] ?? 'border-border text-foreground';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GodEyeHeaderProps {
  /** Raw macro signal value: 1 = bullish, 0 = neutral, -1 = bearish */
  macroSignal: number | undefined;
  /** Whether the dashboard is currently refreshing */
  refreshing?: boolean;
  /** Callback fired when the user clicks the manual-refresh button */
  onRefresh: () => void;
  /** Navigation callback — receives a target string key */
  navigateTo: (target: string) => void;
  /** LiveStatus: healthy provider count */
  online?: number;
  /** LiveStatus: total provider count */
  total?: number;
  /** LiveStatus: snapshot timestamp string */
  ts?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GodEyeHeader({
  macroSignal,
  refreshing = false,
  onRefresh,
  navigateTo,
  online = 0,
  total = 0,
  ts = '--:--',
}: GodEyeHeaderProps) {
  const signalLabel = getSignalLabel(macroSignal ?? 0);
  const badgeClass = getSignalBadgeClass(macroSignal);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-primary/15 p-7"
      style={{ background: 'var(--cmd-grad)' }}
    >
      <TacticalBackdrop grid radar />
      {/* Top row: kick label + LiveStatus */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cmd-ink2)]">
          <span className="text-primary">◢</span> 宏观错价指挥台 · GODEYE V2
        </span>
        <LiveStatus online={online} total={total} ts={ts} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: copy block */}
        <div className="flex flex-col gap-2 min-w-0">
          <h2 className="text-lg font-semibold leading-snug text-white">
            GodEye V2 作战大屏
          </h2>
          <p className="text-sm text-white/80 max-w-[760px]">
            把当前主线索、结构风险、政策节奏和猎杀信号收拢到同一张战情页里，先判断哪里值得立刻下钻。
          </p>
          {/* Nav shortcuts */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => navigateTo('pricing')}
            >
              进入定价研究
            </Button>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={onRefresh}
            className="border-white/30 text-white hover:bg-white/10"
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            强制刷新
          </Button>
          <Badge
            variant="outline"
            className={`px-2.5 py-1 text-sm font-semibold ${badgeClass}`}
          >
            {signalLabel}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default GodEyeHeader;
