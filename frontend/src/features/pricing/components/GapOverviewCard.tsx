import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';
import { DISPLAY_EMPTY } from '@/features/pricing/lib/constants';
import { getPriceSourceLabel } from '@/features/pricing/lib/pricingResearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GapAnalysis {
  current_price?: number | string | null;
  fair_value_mid?: number | string | null;
  fair_value_low?: number | string | null;
  fair_value_high?: number | string | null;
  gap_pct?: number | null;
  severity?: string;
  severity_label?: string;
  direction?: string;
  in_fair_range?: boolean;
}

interface ValuationMeta {
  company_name?: string;
  current_price_source?: string;
}

export interface GapOverviewData {
  symbol?: string;
  gap_analysis?: GapAnalysis;
  valuation?: ValuationMeta;
}

interface GapOverviewCardProps {
  data: GapOverviewData | null | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toFin = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtCurrency = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return DISPLAY_EMPTY;
  return `$${toFin(value).toFixed(2)}`;
};

const fmtAbsPct = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return DISPLAY_EMPTY;
  return `${Math.abs(toFin(value)).toFixed(1)}%`;
};

const SEVERITY_COLORS: Record<string, string> = {
  extreme: 'border-red-500/40 bg-red-500/10 text-red-400',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  moderate: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  mild: 'border-green-500/40 bg-green-500/10 text-green-400',
  negligible: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  unknown: 'border-border text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function GapOverviewCard({ data }: GapOverviewCardProps): React.JSX.Element | null {
  if (!data) return null;

  const gap = data.gap_analysis ?? {};
  const valuation = data.valuation ?? {};
  const gapPct = gap.gap_pct ?? null;
  const severity = gap.severity ?? 'unknown';
  const priceSourceLabel = getPriceSourceLabel(valuation.current_price_source ?? '');

  const rangeChartData =
    gap.fair_value_low != null && gap.fair_value_high != null
      ? [
          { label: '下沿', value: toFin(gap.fair_value_low) },
          { label: '公允', value: toFin(gap.fair_value_mid) },
          { label: '上沿', value: toFin(gap.fair_value_high) },
        ]
      : [];

  const thermometerPct =
    gapPct === null ? 0 : Math.min(100, Math.round((Math.abs(gapPct) / 30) * 100));
  const thermometerLabel = gapPct == null ? '中性' : gapPct > 0 ? '偏热' : gapPct < 0 ? '偏冷' : '中性';
  const thermometerColor = gapPct == null ? '#1677ff' : gapPct > 0 ? '#E5685A' : '#5FBF7E';

  return (
    <Card data-testid="pricing-gap-overview">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2 flex-wrap">
            <span>定价差异概览</span>
            {data.symbol && (
              <span className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs text-primary font-mono">
                {data.symbol}
              </span>
            )}
            {valuation.company_name && (
              <span className="text-xs text-muted-foreground font-normal">
                {valuation.company_name}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Current price */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">当前市价</span>
            <span className="font-mono text-sm font-semibold">
              {fmtCurrency(gap.current_price)}
            </span>
            {gap.current_price != null && (
              <span className="text-xs text-muted-foreground">
                来源：{priceSourceLabel}
              </span>
            )}
          </div>

          {/* Fair value */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">公允价值</span>
            <span className="font-mono text-sm font-semibold text-primary">
              {fmtCurrency(gap.fair_value_mid)}
            </span>
          </div>

          {/* Gap % */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">偏差幅度</span>
            <span
              className={`font-mono text-sm font-semibold ${gapPct == null ? '' : gapPct > 0 ? 'text-neg' : 'text-pos'}`}
            >
              {fmtAbsPct(gapPct)}
            </span>
          </div>

          {/* Severity */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">估值状态</span>
            <span
              className={`inline-flex items-center self-start rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.unknown}`}
            >
              {gap.severity_label ?? '未知'}
            </span>
            {gap.direction && (
              <span className="inline-flex items-center self-start rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground mt-0.5">
                {gap.direction}
              </span>
            )}
          </div>
        </div>

        {/* Thermometer + range chart */}
        {rangeChartData.length > 0 && (
          <div className="space-y-2">
            {/* Thermometer bar */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">定价温度计</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${thermometerPct}%`,
                      backgroundColor: thermometerColor,
                    }}
                  />
                </div>
                <span
                  className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono"
                  style={{
                    borderColor: `${thermometerColor}40`,
                    color: thermometerColor,
                  }}
                >
                  {thermometerLabel}
                </span>
              </div>
            </div>

            {/* Fair range info */}
            <p className="text-xs text-muted-foreground">
              公允价值区间: ${toFin(gap.fair_value_low).toFixed(2)} ~{' '}
              ${toFin(gap.fair_value_high).toFixed(2)}
              <span
                className={`ml-2 inline-flex items-center rounded border px-1.5 py-0.5 ${gap.in_fair_range ? 'border-green-500/40 text-green-400' : 'border-amber-500/40 text-amber-400'}`}
              >
                {gap.in_fair_range ? '在合理区间内' : '偏离合理区间'}
              </span>
            </p>

            {/* Range bar chart */}
            <div style={{ width: '100%', height: 110 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rangeChartData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                  />
                  <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: unknown) => [`$${toFin(v).toFixed(2)}`, '估值']}
                  />
                  <ReferenceLine
                    y={toFin(gap.current_price)}
                    stroke="#E5685A"
                    strokeDasharray="4 4"
                    label={{ value: '当前价', fill: CHART_TICK_COLOR, fontSize: 10 }}
                  />
                  <Bar
                    dataKey="value"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  >
                    {rangeChartData.map((entry) => (
                      <Cell
                        key={entry.label}
                        fill={entry.label === '公允' ? '#1677ff' : '#91caff'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
