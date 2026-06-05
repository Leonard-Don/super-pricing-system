import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import {
  SCREENING_PRESETS,
  parsePricingUniverseInput,
  type ScreeningRow,
} from '@/features/pricing/lib/pricingResearch';
import { DISPLAY_EMPTY, ALIGNMENT_TAG_COLORS } from '@/features/pricing/lib/constants';

// ── filter/sector option lists ────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: 'all', label: '全部结果' },
  { value: 'undervalued', label: '只看低估' },
  { value: 'high-confidence', label: '只看高置信度' },
  { value: 'aligned', label: '只看证据同向' },
  { value: 'governance-risk', label: '只看治理风险高' },
  { value: 'governance-support', label: '只看执行支撑强' },
] as const;

// ── column helpers ─────────────────────────────────────────────────────────────

function formatGapPct(value: unknown): string {
  if (value === null || value === undefined) return DISPLAY_EMPTY;
  const num = Number(value);
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
}

function getViewBadgeVariant(view: unknown): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (view === '低估') return 'default';
  if (view === '高估') return 'destructive';
  return 'outline';
}

function getAlignmentColor(status: unknown): string {
  return ALIGNMENT_TAG_COLORS[String(status || '')] ?? '';
}

function getGovernanceBadgeVariant(numeric: number): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (numeric >= 6) return 'destructive';
  if (numeric > 0) return 'secondary';
  if (numeric <= -3) return 'default';
  return 'outline';
}

// ── columns definition ─────────────────────────────────────────────────────────

function buildColumns(
  onInspect?: (row: ScreeningRow) => void,
): ColumnDef<ScreeningRow>[] {
  const cols: ColumnDef<ScreeningRow>[] = [
    {
      header: '#',
      accessorKey: 'rank',
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.rank ?? '—'}
        </span>
      ),
    },
    {
      header: '标的',
      accessorKey: 'symbol',
      cell: ({ row }) => (
        <div>
          <span className="font-semibold">{row.original.symbol}</span>
          {row.original.company_name ? (
            <div className="text-xs text-muted-foreground">
              {row.original.company_name}
            </div>
          ) : null}
          {row.original.sector ? (
            <div className="text-xs text-muted-foreground/60">
              {row.original.sector}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      header: '机会分',
      accessorKey: 'screening_score',
      cell: ({ row }) => (
        <span className="tabular-nums font-semibold">
          {Number(row.original.screening_score ?? 0).toFixed(1)}
        </span>
      ),
    },
    {
      header: '偏差',
      accessorKey: 'gap_pct',
      cell: ({ row }) => (
        <span className="tabular-nums">{formatGapPct(row.original.gap_pct)}</span>
      ),
    },
    {
      header: '治理折扣',
      accessorKey: 'people_governance_discount_pct',
      cell: ({ row }) => {
        const value = row.original.people_governance_discount_pct;
        if (value === null || value === undefined) return <span>{DISPLAY_EMPTY}</span>;
        const numeric = Number(value ?? 0);
        const variant = getGovernanceBadgeVariant(numeric);
        const label = numeric >= 0
          ? `-${numeric.toFixed(1)}%`
          : `+${Math.abs(numeric).toFixed(1)}%`;
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      header: '观点',
      accessorKey: 'primary_view',
      cell: ({ row }) => {
        const view = row.original.primary_view;
        return (
          <Badge variant={getViewBadgeVariant(view)}>
            {String(view || '合理')}
          </Badge>
        );
      },
    },
    {
      header: '置信度',
      accessorKey: 'confidence',
      cell: ({ row }) => (
        <div>
          <Badge variant="outline">{String(row.original.confidence || 'medium')}</Badge>
          <div className="text-xs text-muted-foreground tabular-nums">
            {Number(row.original.confidence_score ?? 0).toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      header: '证据共振',
      accessorKey: 'factor_alignment_label',
      cell: ({ row }) => {
        const color = getAlignmentColor(row.original.factor_alignment_status);
        return (
          <span
            style={color ? { color } : undefined}
            className="text-xs"
          >
            {String(row.original.factor_alignment_label || '待确认')}
          </span>
        );
      },
    },
    {
      header: '主驱动',
      accessorKey: 'primary_driver',
      cell: ({ row }) => (
        <span>{String(row.original.primary_driver || DISPLAY_EMPTY)}</span>
      ),
    },
  ];

  if (onInspect) {
    cols.push({
      id: 'action',
      header: '操作',
      cell: ({ row }) => (
        <Button
          data-testid={`pricing-screener-inspect-${row.original.symbol}`}
          variant="ghost"
          size="sm"
          onClick={() => onInspect(row.original)}
        >
          深入分析
        </Button>
      ),
    });
  }

  return cols;
}

// ── Props interface ────────────────────────────────────────────────────────────

export interface PricingScreenerCardProps {
  /** Raw universe textarea content. */
  universe: string;
  onUniverseChange: (value: string) => void;
  /** Analysis window period (display only). */
  period: string;
  /** View filter value. */
  filter: string;
  onFilterChange: (value: string) => void;
  /** Sector filter value. */
  sectorFilter: string;
  onSectorFilterChange: (value: string) => void;
  /** Dynamic sector options from results (optional). */
  sectorOptions?: string[];
  /** Minimum opportunity score threshold. */
  minScore: number;
  onMinScoreChange: (value: number) => void;
  /** Screener result rows. */
  results: ScreeningRow[];
  loading: boolean;
  onRun: () => void;
  /** Called with preset symbols when a preset chip is clicked. */
  onApplyPreset: (symbols: string[]) => void;
  /** Optional inspect callback; when provided an action column is shown. */
  onInspect?: (row: ScreeningRow) => void;
  /** Called to export results; button disabled when no results. */
  onExport?: () => void;
  /** Optional error message. */
  error?: string;
  /** Progress info (optional). */
  meta?: { analyzedCount: number; totalInput: number; failureCount: number };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PricingScreenerCard({
  universe,
  onUniverseChange,
  period,
  filter,
  onFilterChange,
  sectorFilter,
  onSectorFilterChange,
  sectorOptions,
  minScore,
  onMinScoreChange,
  results,
  loading,
  onRun,
  onApplyPreset,
  onInspect,
  onExport,
  error,
  meta,
}: PricingScreenerCardProps): React.JSX.Element {
  const candidateCount = parsePricingUniverseInput(universe).length;
  const columns = React.useMemo(() => buildColumns(onInspect), [onInspect]);

  return (
    <Card size="sm" data-testid="pricing-screener-card">
      <CardHeader>
        <CardTitle>错误定价候选池筛选</CardTitle>
        <CardAction>
          <Badge variant="outline">{`窗口 ${period}`}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          一次跑一组候选标的，按偏差幅度、置信度和证据共振综合排序；点"深入分析"会回到单标的研究视图。
        </p>

        {/* Universe textarea */}
        <Textarea
          data-testid="pricing-screener-input"
          rows={4}
          value={universe}
          onChange={(e) => onUniverseChange(e.target.value)}
          placeholder="输入多个股票代码，支持换行、逗号或空格分隔"
          className="mb-3 font-mono text-xs"
        />

        {/* Preset chips */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">预设候选池:</span>
          {SCREENING_PRESETS.map((preset) => (
            <Badge
              key={preset.key}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => onApplyPreset(preset.symbols)}
            >
              {preset.label}
            </Badge>
          ))}
        </div>

        {/* Action row */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Button
            data-testid="pricing-screener-run-button"
            variant="outline"
            onClick={onRun}
            disabled={loading}
          >
            {loading ? '筛选中…' : '批量筛选'}
          </Button>

          {onExport && (
            <Button
              variant="outline"
              onClick={onExport}
              disabled={!results.length}
            >
              导出 CSV
            </Button>
          )}

          <span className="text-xs text-muted-foreground">
            {`候选 ${candidateCount} 个`}
          </span>

          {meta ? (
            <span className="text-xs text-muted-foreground">
              {`已分析 ${meta.analyzedCount}/${meta.totalInput} · 失败 ${meta.failureCount}`}
            </span>
          ) : null}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-xs text-muted-foreground">筛选视图:</span>

          <Select value={filter} onValueChange={(v) => { if (v !== null) onFilterChange(v); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectorFilter} onValueChange={(v) => { if (v !== null) onSectorFilterChange(v); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部板块</SelectItem>
              {(sectorOptions ?? []).map((sector) => (
                <SelectItem key={sector} value={sector}>
                  {sector}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="min-w-56">
            <p className="text-xs text-muted-foreground mb-1">
              {`机会分阈值 >= ${Number(minScore ?? 0).toFixed(0)}`}
            </p>
            <Slider
              min={0}
              max={40}
              value={[minScore]}
              onValueChange={(vals: number | readonly number[]) => {
                const first = Array.isArray(vals) ? vals[0] : vals;
                onMinScoreChange(typeof first === 'number' ? first : 0);
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {/* Results table */}
        {results.length > 0 ? (
          <div data-testid="pricing-screener-results">
            <DataTable columns={columns} data={results} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
