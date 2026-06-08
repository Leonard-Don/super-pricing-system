import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartFrame } from '@/features/pricing/components/ChartFrame';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Reveal, GlassTooltip } from '@/components/command';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_PRIMARY_COLOR,
} from '@/features/pricing/lib/chartTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GapHistoryPoint {
  date?: string;
  gap_pct?: number | string;
  price?: number | string;
}

interface GapHistorySummary {
  latest_gap_pct?: number | string | null;
  max_gap_pct?: number | string | null;
  min_gap_pct?: number | string | null;
}

export interface GapHistoryData {
  history?: GapHistoryPoint[];
  summary?: GapHistorySummary;
}

interface GapHistoryCardProps {
  loading?: boolean;
  error?: string | null;
  historyData?: GapHistoryData | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toFin = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function GapHistoryCard({
  loading = false,
  error,
  historyData,
}: GapHistoryCardProps): React.JSX.Element {
  const history = historyData?.history ?? [];
  const summary = historyData?.summary ?? {};

  return (
    <Card data-testid="pricing-gap-history-card">
      <CardHeader>
        <CardTitle>偏差历史时间序列</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          用当前公允价值锚点回看过去一段时间的价格偏离轨迹，辅助判断均值回归和情绪扩张是否已经发生。
        </p>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-muted" />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && history.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无历史偏差数据</p>
        )}

        {/* Content */}
        {history.length > 0 && (
          <Reveal delay={0}>
            {/* Summary badges */}
            <div className="flex flex-wrap gap-1">
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                最新偏差{' '}
                {toFin(summary.latest_gap_pct) > 0 ? '+' : ''}
                {toFin(summary.latest_gap_pct).toFixed(1)}%
              </span>
              <span className="inline-flex items-center rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-xs font-mono text-red-400">
                最高溢价 {toFin(summary.max_gap_pct).toFixed(1)}%
              </span>
              <span className="inline-flex items-center rounded border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-xs font-mono text-green-400">
                最低折价 {toFin(summary.min_gap_pct).toFixed(1)}%
              </span>
            </div>

            {/* Chart via ChartFrame */}
            <ChartFrame title="偏差历史" height={260}>
              <LineChart
                data={history}
                margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                <XAxis
                  dataKey="date"
                  minTickGap={28}
                  tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                />
                <RechartsTooltip
                  content={<GlassTooltip />}
                  formatter={(value: unknown, name: unknown) => [
                    name === 'gap_pct'
                      ? `${toFin(value).toFixed(2)}%`
                      : `$${toFin(value).toFixed(2)}`,
                    name === 'gap_pct' ? '偏差' : '价格',
                  ]}
                />
                <ReferenceLine y={0} stroke="rgba(148,163,184,0.7)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="gap_pct"
                  stroke={CHART_PRIMARY_COLOR}
                  strokeWidth={2}
                  dot={false}
                  name="gap_pct"
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartFrame>
          </Reveal>
        )}
      </CardContent>
    </Card>
  );
}
