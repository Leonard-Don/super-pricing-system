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
import { DataTable } from '@/components/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { DataNumber } from '@/components/command';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';
import { DISPLAY_EMPTY } from '@/features/pricing/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerItem {
  symbol: string;
  company_name?: string;
  is_target?: boolean;
  current_price?: number | string | null;
  fair_value?: number | string | null;
  premium_discount?: number | string | null;
  pe_ratio?: number | string | null;
  price_to_sales?: number | string | null;
  enterprise_to_ebitda?: number | string | null;
}

interface PeerSummary {
  peer_count?: number;
  same_industry_count?: number;
  median_peer_pe?: number | string | null;
  median_peer_ps?: number | string | null;
}

export interface PeerComparisonData {
  target?: PeerItem | null;
  peers?: PeerItem[];
  sector?: string;
  industry?: string;
  summary?: PeerSummary;
  candidate_count?: number;
}

interface PeerComparisonCardProps {
  loading?: boolean;
  error?: string | null;
  peerComparison?: PeerComparisonData | null;
  onInspect?: (peer: PeerItem) => void;
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

const fmtMultiple = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return DISPLAY_EMPTY;
  const n = Number(value);
  return Number.isFinite(n) && n ? n.toFixed(1) : DISPLAY_EMPTY;
};

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function PeerComparisonCard({
  loading = false,
  error,
  peerComparison,
  onInspect,
}: PeerComparisonCardProps): React.JSX.Element {
  const target = peerComparison?.target ?? null;
  const peers = peerComparison?.peers ?? [];
  const rows = [target, ...peers].filter(Boolean) as PeerItem[];
  const summary = peerComparison?.summary ?? {};

  const chartData = rows.map((item) => ({
    symbol: item.symbol,
    premium_discount: toFin(item.premium_discount),
    is_target: item.is_target,
  }));

  const columns: ColumnDef<PeerItem>[] = [
    {
      id: 'symbol',
      header: '标的',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              <span className="font-mono font-semibold">{r.symbol}</span>
              {r.is_target && (
                <span className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1 py-0 text-xs text-primary">
                  当前标的
                </span>
              )}
            </div>
            {r.company_name && (
              <span className="text-xs text-muted-foreground">{r.company_name}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'valuation',
      header: '现价 / 公允',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="font-mono tabular-nums text-sm">
            <DataNumber value={fmtCurrency(r.current_price)} />{' '}
            /{' '}
            <DataNumber value={fmtCurrency(r.fair_value)} tone="amber" />
          </span>
        );
      },
    },
    {
      accessorKey: 'premium_discount',
      header: '溢折价',
      cell: ({ getValue }) => {
        const v = getValue() as number | string | null | undefined;
        if (v === null || v === undefined) return DISPLAY_EMPTY;
        const n = Number(v);
        return (
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${n > 0 ? 'border-red-500/40' : 'border-green-500/40'}`}
          >
            <DataNumber
              value={`${n > 0 ? '+' : ''}${n.toFixed(1)}%`}
              tone={n > 0 ? 'neg' : 'pos'}
            />
          </span>
        );
      },
    },
    {
      accessorKey: 'pe_ratio',
      header: 'P/E',
      cell: ({ getValue }) => {
        const v = fmtMultiple(getValue());
        return v === DISPLAY_EMPTY ? DISPLAY_EMPTY : <DataNumber value={v} />;
      },
    },
    {
      accessorKey: 'price_to_sales',
      header: 'P/S',
      cell: ({ getValue }) => {
        const v = fmtMultiple(getValue());
        return v === DISPLAY_EMPTY ? DISPLAY_EMPTY : <DataNumber value={v} />;
      },
    },
    {
      accessorKey: 'enterprise_to_ebitda',
      header: 'EV/EBITDA',
      cell: ({ getValue }) => {
        const v = fmtMultiple(getValue());
        return v === DISPLAY_EMPTY ? DISPLAY_EMPTY : <DataNumber value={v} />;
      },
    },
    {
      id: 'action',
      header: '操作',
      cell: ({ row }) => {
        const r = row.original;
        if (r.is_target) {
          return <span className="text-xs text-muted-foreground">当前</span>;
        }
        return (
          <button
            data-testid={`pricing-peer-inspect-${r.symbol}`}
            className="text-xs text-primary hover:underline"
            onClick={() => onInspect?.(r)}
            type="button"
          >
            深入分析
          </button>
        );
      },
    },
  ];

  return (
    <Card data-testid="pricing-peer-comparison-card">
      <CardHeader>
        <CardTitle>同行估值对比</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          结合同行市值和核心倍数，快速判断当前标的是"自己贵"还是"整个板块一起贵"。
        </p>

        {/* Loading */}
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
        {!loading && !error && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无同行对比数据</p>
        )}

        {rows.length > 0 && (
          <>
            {/* Summary badges */}
            <div className="flex flex-wrap gap-1">
              {peerComparison?.sector && (
                <span className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs text-primary font-mono">
                  {peerComparison.sector}
                </span>
              )}
              {peerComparison?.industry && (
                <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                  {peerComparison.industry}
                </span>
              )}
              <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                同行 {summary.peer_count ?? 0} 家
              </span>
              {summary.same_industry_count != null && (
                <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                  同细分行业 {summary.same_industry_count} 家
                </span>
              )}
              {summary.median_peer_pe != null && (
                <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                  Peer P/E 中位数 {summary.median_peer_pe}
                </span>
              )}
              {summary.median_peer_ps != null && (
                <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                  Peer P/S 中位数 {summary.median_peer_ps}
                </span>
              )}
            </div>

            {/* Premium/discount bar chart */}
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis
                    dataKey="symbol"
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
                  />
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: unknown) => [
                      `${toFin(v).toFixed(1)}%`,
                      '相对公允价值溢折价',
                    ]}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="rgba(148,163,184,0.7)"
                    strokeDasharray="4 4"
                  />
                  <Bar
                    dataKey="premium_discount"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={`${entry.symbol}-${idx}`}
                        fill={
                          entry.is_target
                            ? '#1677ff'
                            : entry.premium_discount > 0
                            ? '#ff7875'
                            : '#73d13d'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Peer table */}
            <div className="overflow-x-auto">
              <DataTable columns={columns} data={rows} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
