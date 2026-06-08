import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  CardAction,
} from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_AREA_GRADIENT,
  CHART_GLOW,
} from '@/features/pricing/lib/chartTheme';
import { RANGE_BASIS_LABELS, DISPLAY_EMPTY } from '@/features/pricing/lib/constants';
import { Reveal, GlassTooltip } from '@/components/command';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DCFAssumptions {
  wacc?: number | string;
  initial_growth?: number | string;
}

interface ProjectedFCF {
  year?: number | string;
  fcf?: number | string;
  pv?: number | string;
}

interface DCFScenario {
  label?: string;
  intrinsic_value?: number | string;
  premium_discount?: number | string | null;
  assumptions?: DCFAssumptions;
}

interface DCFModel {
  error?: string;
  intrinsic_value?: number | string;
  premium_discount?: number | string;
  terminal_pct?: number | string;
  assumptions?: DCFAssumptions;
  scenarios?: DCFScenario[];
  projected_fcfs?: ProjectedFCF[];
}

interface MonteCarloDistributionItem {
  bucket?: number | string;
  count?: number | string;
}

interface MonteCarloModel {
  p10?: number | string;
  p50?: number | string;
  p90?: number | string;
  sample_count?: number;
  distribution?: MonteCarloDistributionItem[];
}

interface ComparableMethod {
  method?: string;
  current_multiple?: number | null;
  benchmark_multiple?: number | null;
  fair_value?: number | null;
}

interface ComparableModel {
  error?: string;
  methods?: ComparableMethod[];
  warnings?: string[];
  benchmark_source?: string;
  benchmark_peer_count?: number;
  benchmark_peer_symbols?: string[];
}

interface FairValue {
  mid?: number | string;
  low?: number | string;
  high?: number | string;
  method?: string;
  range_basis?: string;
  dcf_weight?: number | string;
  comparable_weight?: number | string;
}

export interface ValuationData {
  dcf?: DCFModel;
  monte_carlo?: MonteCarloModel;
  comparable?: ComparableModel;
  fair_value?: FairValue;
  sector?: string;
}

interface ValuationCardProps {
  data: ValuationData | null | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toFin = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const COMPACT_UNITS = [
  { value: 1_000_000_000_000, suffix: 'T' },
  { value: 1_000_000_000, suffix: 'B' },
  { value: 1_000_000, suffix: 'M' },
  { value: 1_000, suffix: 'K' },
] as const;

function fmtCompact(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return DISPLAY_EMPTY;
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const unit = COMPACT_UNITS.find((u) => abs >= u.value);
  if (!unit) {
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return `${n < 0 ? '-' : ''}$${abs.toFixed(digits).replace(/\.0+$/, '')}`;
  }
  const scaled = abs / unit.value;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${n < 0 ? '-' : ''}$${scaled.toFixed(digits).replace(/\.0+$/, '')}${unit.suffix}`;
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function TagBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function ValuationCard({ data }: ValuationCardProps): React.JSX.Element | null {
  if (!data) return null;

  const dcf = data.dcf ?? {};
  const monteCarlo = data.monte_carlo ?? {};
  const comparable = data.comparable ?? {};
  const fairValue = data.fair_value ?? {};

  const hasDCF = !dcf.error;
  const hasComparable = !comparable.error;

  const fairValueBand =
    fairValue.mid != null
      ? [
          { name: '下沿', value: toFin(fairValue.low) },
          { name: '中值', value: toFin(fairValue.mid) },
          { name: '上沿', value: toFin(fairValue.high) },
        ]
      : [];

  const projectedFcfs = dcf.projected_fcfs ?? [];
  const dcfScenarios = dcf.scenarios ?? [];
  const mcDistribution = monteCarlo.distribution ?? [];

  // DataTable columns — DCF Scenarios
  const scenarioColumns: ColumnDef<DCFScenario>[] = [
    { accessorKey: 'label', header: '情景' },
    {
      accessorKey: 'intrinsic_value',
      header: '公允价值',
      cell: ({ getValue }) => `$${toFin(getValue()).toFixed(2)}`,
    },
    {
      id: 'wacc',
      header: 'WACC',
      cell: ({ row }) =>
        `${(toFin(row.original.assumptions?.wacc) * 100).toFixed(1)}%`,
    },
    {
      id: 'initial_growth',
      header: '初始增长',
      cell: ({ row }) =>
        `${(toFin(row.original.assumptions?.initial_growth) * 100).toFixed(1)}%`,
    },
    {
      accessorKey: 'premium_discount',
      header: '溢折价',
      cell: ({ getValue }) => {
        const v = getValue() as number | null | undefined;
        if (v === null || v === undefined) return '—';
        return (
          <span className={v > 0 ? 'text-neg' : 'text-pos'}>
            {v > 0 ? '+' : ''}
            {v}%
          </span>
        );
      },
    },
  ];

  // DataTable columns — Comparable Methods
  const comparableColumns: ColumnDef<ComparableMethod>[] = [
    { accessorKey: 'method', header: '方法' },
    {
      accessorKey: 'current_multiple',
      header: '当前倍数',
      cell: ({ getValue }) => (getValue() as number | null)?.toFixed(1) ?? DISPLAY_EMPTY,
    },
    {
      accessorKey: 'benchmark_multiple',
      header: '行业基准',
      cell: ({ getValue }) => (getValue() as number | null)?.toFixed(1) ?? DISPLAY_EMPTY,
    },
    {
      accessorKey: 'fair_value',
      header: '公允价值',
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v != null ? `$${v.toFixed(2)}` : DISPLAY_EMPTY;
      },
    },
  ];

  return (
    <Card data-testid="pricing-valuation-card">
      <CardHeader>
        <CardTitle>内在价值估值</CardTitle>
        {data.sector && (
          <CardAction>
            <span className="inline-flex items-center rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400 font-mono">
              {data.sector}
            </span>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-1">
        {/* Fair value hero */}
        {fairValue.mid != null && (
          <Reveal delay={0}>
          <div className="rounded-lg border border-border bg-muted/20 text-center py-4 mb-3">
            <p className="text-xs text-muted-foreground mb-1">综合公允价值</p>
            <p className="font-mono text-3xl font-bold text-primary">
              ${toFin(fairValue.mid).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              区间: ${toFin(fairValue.low).toFixed(2)} ~ ${toFin(fairValue.high).toFixed(2)}
            </p>
            {fairValue.method && (
              <p className="text-xs text-muted-foreground mt-0.5">方法: {fairValue.method}</p>
            )}
            {fairValue.range_basis && (
              <p className="text-xs text-muted-foreground mt-0.5">
                区间依据: {RANGE_BASIS_LABELS[fairValue.range_basis] ?? fairValue.range_basis}
              </p>
            )}
            {fairValueBand.length > 0 && (
              <div style={{ width: '100%', height: 100, marginTop: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fairValueBand}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis dataKey="name" tick={{ fill: CHART_TICK_COLOR, fontSize: 10 }} />
                    <YAxis hide />
                    <RechartsTooltip
                      content={<GlassTooltip />}
                      formatter={(v: unknown) => [`$${toFin(v).toFixed(2)}`, '估值']}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#1677ff"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          </Reveal>
        )}

        {/* ── DCF ── */}
        <Reveal delay={60}>
        <SectionDivider label="DCF 现金流折现" />
        {hasDCF ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">DCF 内在价值</span>
                <span className="font-mono text-sm font-semibold">
                  ${toFin(dcf.intrinsic_value).toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">溢价/折价</span>
                <span
                  className={`font-mono text-sm font-semibold ${toFin(dcf.premium_discount) > 0 ? 'text-neg' : 'text-pos'}`}
                >
                  {toFin(dcf.premium_discount) > 0 ? '+' : ''}
                  {dcf.premium_discount}%
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">WACC</span>
                <span className="font-mono text-sm font-semibold">
                  {(toFin(dcf.assumptions?.wacc) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">终值占比</span>
                <span className="font-mono text-sm font-semibold">{dcf.terminal_pct}%</span>
              </div>
            </div>

            {/* Projected FCF chart */}
            {projectedFcfs.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mt-2">
                  预测 FCF / 折现现值 · 坐标按 K/M/B/T 压缩
                </p>
                <div data-testid="dcf-cashflow-chart" style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={projectedFcfs}
                      margin={{ top: 10, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id={CHART_AREA_GRADIENT.id} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_AREA_GRADIENT.from} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={CHART_AREA_GRADIENT.from} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis dataKey="year" tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }} />
                      <YAxis
                        tickFormatter={fmtCompact}
                        width={64}
                        tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                      />
                      <Legend />
                      <RechartsTooltip
                        content={<GlassTooltip />}
                        formatter={(v: unknown, name: unknown) => [fmtCompact(v), name as string]}
                      />
                      <Area
                        type="monotone"
                        dataKey="fcf"
                        name="预测 FCF"
                        stroke={CHART_AREA_GRADIENT.from}
                        fill={`url(#${CHART_AREA_GRADIENT.id})`}
                        fillOpacity={1}
                        style={{ filter: CHART_GLOW }}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="pv"
                        name="折现现值"
                        stroke="#fa8c16"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* DCF Scenarios */}
            {dcfScenarios.length > 0 && (
              <>
                <SectionDivider label="DCF 情景分析" />
                <DataTable columns={scenarioColumns} data={dcfScenarios} />
              </>
            )}

            {/* Monte Carlo */}
            {mcDistribution.length > 0 && (
              <>
                <SectionDivider label="Monte Carlo 估值分布" />
                <div className="flex flex-wrap gap-1 mb-2">
                  <TagBadge>样本 {monteCarlo.sample_count ?? 0}</TagBadge>
                  <TagBadge>P10 ${toFin(monteCarlo.p10).toFixed(2)}</TagBadge>
                  <TagBadge>P50 ${toFin(monteCarlo.p50).toFixed(2)}</TagBadge>
                  <TagBadge>P90 ${toFin(monteCarlo.p90).toFixed(2)}</TagBadge>
                </div>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mcDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis dataKey="bucket" hide />
                      <YAxis tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }} />
                      <RechartsTooltip
                        content={<GlassTooltip />}
                        formatter={(v: unknown) => [toFin(v).toFixed(0), '样本数']}
                      />
                      <Bar
                        dataKey="count"
                        fill="#36cfc9"
                        radius={[6, 6, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{dcf.error}</p>
        )}
        </Reveal>

        {/* ── Comparable ── */}
        <Reveal delay={120}>
        <SectionDivider label="可比公司估值" />
        {hasComparable ? (
          <>
            {comparable.warnings && comparable.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 mb-2">
                <span className="font-medium">可比估值提醒：</span>
                {comparable.warnings.join(' ')}
              </div>
            )}
            <DataTable
              columns={comparableColumns}
              data={comparable.methods ?? []}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              <TagBadge>
                权重 DCF {Math.round(toFin(fairValue.dcf_weight) * 100)}%
              </TagBadge>
              <TagBadge>
                权重 可比 {Math.round(toFin(fairValue.comparable_weight) * 100)}%
              </TagBadge>
              {comparable.benchmark_source && (
                <TagBadge>基准来源 {comparable.benchmark_source}</TagBadge>
              )}
              {comparable.benchmark_peer_count != null && (
                <TagBadge>同行样本 {comparable.benchmark_peer_count}</TagBadge>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{comparable.error}</p>
        )}
        </Reveal>
      </CardContent>
    </Card>
  );
}
