/**
 * ValuationLabPage — /pricing/valuation
 *
 * QuantLab 估值历史面板. Form → run sync valuation → show:
 *   - 3 stat cards (fair_value / gap_pct / current_price)
 *   - model-weights table
 *   - valuation-history table
 *   - peer-matrix table
 *
 * Async queue (TODO P2): queueQuantValuationLab is not wired — sync-only.
 */

import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import useValuationLab, {
  type ValuationModel,
  type ValuationHistoryRow,
  type PeerRow,
} from '@/features/pricing/hooks/useValuationLab';
import { formatCurrency, formatPercentage } from '@/utils/formatting';

// ---------------------------------------------------------------------------
// Period options
// ---------------------------------------------------------------------------
const PERIOD_OPTIONS = [
  { value: '6mo', label: '近6个月' },
  { value: '1y', label: '近1年' },
  { value: '2y', label: '近2年' },
  { value: '3y', label: '近3年' },
] as const;

// ---------------------------------------------------------------------------
// Signed-percentage format helper
// ---------------------------------------------------------------------------
function formatSignedPct(v: number): string {
  const pct = (v * 100).toFixed(1);
  return v > 0 ? `+${pct}%` : `${pct}%`;
}

// ---------------------------------------------------------------------------
// Table column definitions
// ---------------------------------------------------------------------------

const MODEL_COLUMNS: ColumnDef<ValuationModel>[] = [
  { accessorKey: 'model', header: '模型' },
  {
    accessorKey: 'value',
    header: '估值',
    cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)),
  },
  {
    accessorKey: 'weight',
    header: '权重',
    cell: ({ getValue }) => formatPercentage(Number(getValue() ?? 0)),
  },
];

const HISTORY_COLUMNS: ColumnDef<ValuationHistoryRow>[] = [
  {
    accessorKey: 'timestamp',
    header: '时间',
    cell: ({ getValue }) =>
      String(getValue() ?? '').slice(0, 19).replace('T', ' '),
  },
  {
    accessorKey: 'fair_value',
    header: '综合公允价值',
    cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)),
  },
  {
    accessorKey: 'market_price',
    header: '现价',
    cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)),
  },
  {
    accessorKey: 'gap_pct',
    header: '偏离',
    cell: ({ getValue }) => {
      const v = Number(getValue() ?? 0);
      const label = formatSignedPct(v);
      return (
        <span className={v > 0 ? 'text-pos' : v < 0 ? 'text-neg' : ''}>
          {label}
        </span>
      );
    },
  },
];

const PEER_COLUMNS: ColumnDef<PeerRow>[] = [
  {
    accessorKey: 'symbol',
    header: '标的',
    cell: ({ row }) => {
      const { symbol, is_target, peer_source } = row.original;
      return (
        <span className="flex items-center gap-1.5 font-medium">
          {symbol}
          {is_target ? (
            <span className="rounded px-1 py-0.5 text-xs bg-primary/10 text-primary">
              当前
            </span>
          ) : (
            <span className="rounded px-1 py-0.5 text-xs bg-muted text-muted-foreground">
              {peer_source === 'custom' ? '自定义' : '自动'}
            </span>
          )}
        </span>
      );
    },
  },
  {
    id: 'price_fair',
    header: '现价 / 公允',
    cell: ({ row }) => {
      const { current_price, fair_value } = row.original;
      return `${formatCurrency(current_price ?? 0)} / ${formatCurrency(fair_value ?? 0)}`;
    },
  },
  {
    accessorKey: 'premium_discount',
    header: '溢折价',
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null || v === undefined) return '--';
      const num = Number(v);
      const label = `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
      return (
        <span className={num > 0 ? 'text-pos' : num < 0 ? 'text-neg' : ''}>
          {label}
        </span>
      );
    },
  },
  {
    accessorKey: 'pe_ratio',
    header: 'P/E',
    cell: ({ getValue }) => {
      const v = getValue();
      return v ? Number(v).toFixed(1) : '--';
    },
  },
  {
    accessorKey: 'price_to_sales',
    header: 'P/S',
    cell: ({ getValue }) => {
      const v = getValue();
      return v ? Number(v).toFixed(1) : '--';
    },
  },
  {
    accessorKey: 'revenue_growth',
    header: '收入增速',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : formatPercentage(Number(v));
    },
  },
  {
    accessorKey: 'earnings_growth',
    header: '盈利增速',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : formatPercentage(Number(v));
    },
  },
  {
    accessorKey: 'return_on_equity',
    header: 'ROE',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : formatPercentage(Number(v));
    },
  },
  {
    accessorKey: 'profit_margin',
    header: '利润率',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : formatPercentage(Number(v));
    },
  },
  {
    accessorKey: 'value_score',
    header: '价值分',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : Number(v).toFixed(3);
    },
  },
  {
    accessorKey: 'growth_score',
    header: '成长分',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : Number(v).toFixed(3);
    },
  },
  {
    accessorKey: 'quality_score',
    header: '质量分',
    cell: ({ getValue }) => {
      const v = getValue();
      return v === null || v === undefined ? '--' : Number(v).toFixed(3);
    },
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ValuationLabPage(): React.JSX.Element {
  const { form, setForm, loading, error, result, handleSubmit } =
    useValuationLab();

  const peerRows: PeerRow[] = React.useMemo(
    () =>
      Array.isArray(result?.peer_matrix?.rows)
        ? (result.peer_matrix!.rows as PeerRow[])
        : [],
    [result],
  );

  const modelRows: ValuationModel[] = React.useMemo(
    () => result?.ensemble_valuation?.models ?? [],
    [result],
  );

  const historyRows: ValuationHistoryRow[] = React.useMemo(
    () => result?.valuation_history ?? [],
    [result],
  );

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page heading */}
      <div>
        <h2 className="text-xl font-bold text-foreground">估值历史</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          QuantLab 多模型集成估值实验
        </p>
      </div>

      {/* Form card */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleRun} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {/* Symbol */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="val-symbol">股票代码</Label>
                <Input
                  id="val-symbol"
                  value={form.symbol}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, symbol: e.target.value }))
                  }
                  placeholder="如 AAPL"
                />
              </div>

              {/* Period */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="val-period">因子周期</Label>
                <select
                  id="val-period"
                  value={form.period}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, period: e.target.value }))
                  }
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Peer limit */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="val-peer-limit">同行数量</Label>
                <Input
                  id="val-peer-limit"
                  type="number"
                  min={2}
                  max={12}
                  value={form.peer_limit}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      peer_limit: Math.max(
                        2,
                        Math.min(12, parseInt(e.target.value, 10) || 6),
                      ),
                    }))
                  }
                />
              </div>

              {/* Peer symbols */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="val-peers">自定义 Peer 组</Label>
                <Input
                  id="val-peers"
                  value={form.peer_symbols}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, peer_symbols: e.target.value }))
                  }
                  placeholder="可选，如 MSFT, NVDA, GOOGL"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || !form.symbol.trim()}
              >
                {loading ? '运行中…' : '运行估值'}
              </Button>
              {/* TODO (P2): wire queueQuantValuationLab for long-running async queue */}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-40" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-6">
          {/* 3 Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 综合公允价值 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  综合公允价值
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatCurrency(
                    result.ensemble_valuation?.fair_value ?? 0,
                  )}
                </p>
              </CardContent>
            </Card>

            {/* 市场偏离 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  市场偏离
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const v = result.ensemble_valuation?.gap_pct ?? 0;
                  return (
                    <p
                      className={`text-2xl font-semibold tabular-nums ${
                        v > 0
                          ? 'text-pos'
                          : v < 0
                            ? 'text-neg'
                            : 'text-foreground'
                      }`}
                    >
                      {formatSignedPct(v)}
                    </p>
                  );
                })()}
              </CardContent>
            </Card>

            {/* 现价 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  现价
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatCurrency(
                    result.analysis?.valuation?.current_price ?? 0,
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Model weights table */}
          {modelRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>模型集成权重</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable columns={MODEL_COLUMNS} data={modelRows} />
              </CardContent>
            </Card>
          )}

          {/* Valuation history table */}
          {historyRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>估值历史追踪</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable columns={HISTORY_COLUMNS} data={historyRows} />
              </CardContent>
            </Card>
          )}

          {/* Peer matrix table */}
          {peerRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>同行对比矩阵</CardTitle>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {result.peer_matrix?.sector && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      {result.peer_matrix.sector}
                    </span>
                  )}
                  {result.peer_matrix?.industry && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {result.peer_matrix.industry}
                    </span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {`同行 ${result.peer_matrix?.summary?.peer_count ?? 0} 家`}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {`自定义 Peer ${result.peer_matrix?.summary?.custom_peer_count ?? 0} 家`}
                  </span>
                  {result.peer_matrix?.summary?.median_peer_premium_discount !==
                    null &&
                    result.peer_matrix?.summary
                      ?.median_peer_premium_discount !== undefined && (
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {`同行溢折价中位数 ${Number(
                          result.peer_matrix.summary
                            .median_peer_premium_discount,
                        ).toFixed(1)}%`}
                      </span>
                    )}
                </div>
              </CardHeader>
              <CardContent>
                <DataTable columns={PEER_COLUMNS} data={peerRows} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
