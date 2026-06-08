/**
 * CalibrationChart — plots predicted confidence vs realized hit-rate per bucket.
 *
 * Uses Recharts LineChart with GlassTooltip.
 * Insufficient / empty data → honest empty-state note (no misleading chart).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { GlassTooltip } from '@/components/command';
import type { CalibrationBucket } from '../types';

export interface CalibrationChartProps {
  buckets: CalibrationBucket[];
  className?: string;
}

function formatPct(value: number | string | undefined): string {
  if (value == null) return '—';
  return `${(Number(value) * 100).toFixed(0)}%`;
}

function CustomTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string }[];
}) {
  return (
    <GlassTooltip
      active={props.active}
      label={props.label != null ? `置信度中位 ${formatPct(props.label)}` : undefined}
      payload={props.payload?.map((e) => ({
        name: e.name,
        value: e.value != null ? formatPct(e.value) : '—',
        color: e.color,
      }))}
    />
  );
}

export function CalibrationChart({ buckets, className }: CalibrationChartProps) {
  const hasSufficientData = buckets.some((b) => b.sample_size > 0 && b.realized_hit_rate != null);

  if (!hasSufficientData) {
    return (
      <div
        className={
          className ??
          'flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center'
        }
      >
        <span className="text-[11px] text-[var(--cmd-ink3)]">
          置信度校准数据不足
        </span>
        <span className="mt-1 text-[10px] text-[var(--cmd-ink3)]/60">
          需要带置信度标注的信号样本
        </span>
      </div>
    );
  }

  // Build chart data — only buckets with realized data
  const chartData = buckets
    .filter((b) => b.sample_size > 0)
    .map((b) => ({
      confidence: b.predicted,
      realized: b.realized_hit_rate,
      n: b.sample_size,
    }));

  return (
    <div
      data-testid="calibration-chart"
      className={className ?? 'w-full'}
    >
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          {/* Perfect calibration diagonal */}
          <ReferenceLine
            segment={[
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ]}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="4 4"
          />
          <XAxis
            dataKey="confidence"
            type="number"
            domain={[0, 1]}
            tickCount={3}
            tick={{ fill: 'var(--cmd-ink3)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatPct}
          />
          <YAxis
            domain={[0, 1]}
            tickCount={3}
            tick={{ fill: 'var(--cmd-ink3)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatPct}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            dataKey="realized"
            name="实际胜率"
            type="monotone"
            stroke="var(--cmd-amber-bright, #f3b85a)"
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: 'var(--cmd-amber-bright, #f3b85a)', strokeWidth: 0 }}
            activeDot={{ r: 4, fill: 'var(--cmd-amber-bright, #f3b85a)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
