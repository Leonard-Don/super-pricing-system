/**
 * FactorLabPage — /pricing/factors
 *
 * QuantLab 自定义因子表达式面板. Form → run sync factor eval → show:
 *   - Safety-notice Alert listing whitelisted functions
 *   - 3 stat cards (latest_value / non_null_factor_points / rows)
 *   - Factor-preview table (date / factor value, 6 decimals)
 *
 * Async queue (TODO P2): queueQuantFactorExpressionTask is not wired —
 * sync-only path is sufficient for P1.
 */

import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';
import { DataTable } from '@/components/DataTable';
import {
  StatPanel,
  DataNumber,
  GlassPanel,
  SectionFrame,
  Reveal,
} from '@/components/command';
import useFactorLab, {
  DEFAULT_FACTOR_EXPRESSION,
  type FactorPreviewRow,
} from '@/features/pricing/hooks/useFactorLab';

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
// Whitelisted functions description (matches QuantLabFactorPanel.js Alert text)
// ---------------------------------------------------------------------------
const WHITELIST_DESCRIPTION =
  '支持 close/open/high/low/volume 字段，以及 rank、zscore、sma、ema、rolling_std、pct_change、delay、clip 等函数。表达式只解析数学和白名单函数，不执行任意代码。';

// ---------------------------------------------------------------------------
// Table column definitions
// ---------------------------------------------------------------------------

const PREVIEW_COLUMNS: ColumnDef<FactorPreviewRow>[] = [
  {
    accessorKey: 'date',
    header: '日期',
  },
  {
    accessorKey: 'factor',
    header: '因子值',
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null || v === undefined) return '--';
      return <DataNumber value={Number(v).toFixed(6)} />;
    },
  },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FactorLabPage(): React.JSX.Element {
  const { form, setForm, loading, error, result, handleSubmit } =
    useFactorLab();

  const previewRows: FactorPreviewRow[] = React.useMemo(
    () =>
      Array.isArray(result?.preview)
        ? result.preview!.map((item) => ({ ...item }))
        : [],
    [result],
  );

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSubmit();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page heading */}
      <Reveal delay={0}>
      <div>
        <h2 className="text-xl font-bold text-foreground">自定义因子</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          QuantLab 因子表达式面板
        </p>
      </div>
      </Reveal>

      {/* Form — GlassPanel treatment */}
      <Reveal delay={60}>
      <GlassPanel className="p-5">
        <form onSubmit={handleRun} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {/* Symbol */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="factor-symbol">标的代码</Label>
              <Input
                id="factor-symbol"
                value={form.symbol}
                onChange={(e) =>
                  setForm((f) => ({ ...f, symbol: e.target.value }))
                }
                placeholder="如 AAPL"
              />
            </div>

            {/* Period */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="factor-period">历史区间</Label>
              <select
                id="factor-period"
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

            {/* Preview rows */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="factor-preview-rows">预览行数</Label>
              <Input
                id="factor-preview-rows"
                type="number"
                min={5}
                max={120}
                value={form.preview_rows}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    preview_rows: Math.max(
                      5,
                      Math.min(120, parseInt(e.target.value, 10) || 30),
                    ),
                  }))
                }
              />
            </div>
          </div>

          {/* Expression textarea — full row */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="factor-expression">因子表达式</Label>
            <Textarea
              id="factor-expression"
              rows={3}
              value={form.expression}
              onChange={(e) =>
                setForm((f) => ({ ...f, expression: e.target.value }))
              }
              placeholder={DEFAULT_FACTOR_EXPRESSION}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || !form.symbol.trim()}
            >
              {loading ? '运行中…' : '运行'}
            </Button>
            {/* TODO (P2): wire queueQuantFactorExpressionTask for async queue */}
          </div>
        </form>
      </GlassPanel>
      </Reveal>

      {/* Safety-notice Alert — whitelisted functions */}
      <Reveal delay={120}>
      <Alert>
        <AlertTitle>表达式使用安全白名单解析</AlertTitle>
        <AlertDescription>{WHITELIST_DESCRIPTION}</AlertDescription>
      </Alert>
      </Reveal>

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
          {/* Stat row — focus hero: 最新因子值; secondary glass stats: 有效点数 + 样本行数 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* 最新因子值 — focus hero */}
            <Reveal delay={0}>
              <StatPanel
                label="最新因子值"
                value={
                  result.latest_value === null || result.latest_value === undefined
                    ? '--'
                    : Number(result.latest_value).toFixed(4)
                }
                focus
                decimals={4}
                meta={<span className="text-[var(--cmd-ink3)]">LATEST VALUE</span>}
              />
            </Reveal>

            {/* 有效点数 — secondary glass */}
            <Reveal delay={60}>
              <div className="flex flex-col gap-0.5 rounded-2xl border border-[var(--cmd-glass-border)] bg-[var(--cmd-glass)] p-4 backdrop-blur-md">
                <span className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">有效点数</span>
                <DataNumber
                  value={result.diagnostics?.non_null_factor_points ?? 0}
                  className="text-2xl"
                />
              </div>
            </Reveal>

            {/* 样本行数 — secondary glass */}
            <Reveal delay={120}>
              <div className="flex flex-col gap-0.5 rounded-2xl border border-[var(--cmd-glass-border)] bg-[var(--cmd-glass)] p-4 backdrop-blur-md">
                <span className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">样本行数</span>
                <DataNumber
                  value={result.diagnostics?.rows ?? 0}
                  className="text-2xl"
                />
              </div>
            </Reveal>
          </div>

          {/* Factor-preview table */}
          {previewRows.length > 0 && (
            <Reveal delay={180}>
              <div>
                <SectionFrame title="因子预览" latin="PREVIEW" />
                <GlassPanel className="p-4">
                  <DataTable columns={PREVIEW_COLUMNS} data={previewRows} />
                </GlassPanel>
              </div>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}
