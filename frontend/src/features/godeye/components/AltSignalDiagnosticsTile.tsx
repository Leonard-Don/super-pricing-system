// ---------------------------------------------------------------------------
// AltSignalDiagnosticsTile — self-fetching alt-signal diagnostics + half-life decay viz
// Rebuilt from frontend/src/components/GodEyeDashboard/AltSignalDiagnosticsTile.jsx (307)
// Self-fetches getAltSignalDiagnostics(); manages own loading/error/data state.
// No antd — shadcn/Tailwind + Recharts. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAltSignalDiagnostics } from '@/services/api/altDataAndMacro';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_PRIMARY_COLOR,
  CHART_POS_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverallStats {
  hit_rate?: number;
  hit_rate_type?: string;
  avg_confidence?: number;
  avg_strength?: number;
}

interface ProviderRow {
  provider?: string;
  count?: number;
  hit_rate?: number;
  hit_rate_type?: string;
  avg_strength?: number;
  avg_confidence?: number;
}

interface CategoryRow {
  category?: string;
  count?: number;
  hit_rate?: number;
  hit_rate_type?: string;
  avg_strength?: number;
  avg_confidence?: number;
}

interface DecayCurvePoint {
  age_days?: number;
  decay_weight?: number;
  avg_decayed_signal?: number;
}

interface RecentRecord {
  record_id?: string;
  source?: string;
  category?: string;
  age_days?: number;
  decayed_strength?: number;
}

interface AltSignalDiagnosticsPayload {
  record_count?: number;
  half_life_days?: number;
  timeframe?: string;
  snapshot_timestamp?: string;
  realized_outcome_count?: number;
  hit_rate_note?: string | null;
  overall?: OverallStats;
  providers?: ProviderRow[];
  categories?: CategoryRow[];
  decay_curve?: DecayCurvePoint[];
  recent_records?: RecentRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS = { timeframe: '90d', limit: 300, half_life_days: 14 } as const;

const HIT_RATE_TYPE_LABELS: Record<string, string> = {
  realized: '真实命中',
  proxy: 'proxy',
  none: '无样本',
};

// Maps provider/category keys to Chinese labels
const DIAGNOSTIC_LABELS_ZH: Record<string, string> = {
  narrative: '叙事分析',
  composite_signal: '复合信号',
  composite: '复合信号',
  macro_briefing: '宏观日报',
  people: '人的维度',
  people_layer: '人的维度',
  policy: '政策',
  lme_inventory: 'LME 库存',
  shfe_inventory: '上期所库存',
  policy_execution: '政策执行',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerLabel(value: string | undefined): string {
  const raw = (value ?? '').trim();
  return DIAGNOSTIC_LABELS_ZH[raw] ?? (raw || '—');
}

function formatPercent(value: number | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function formatNumber(value: number | undefined, digits = 3): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  testId?: string;
}

function StatCard({ label, value, testId }: StatCardProps) {
  return (
    <div
      className="rounded-lg border border-border bg-muted/20 p-3"
      data-testid={testId}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

interface ProviderTableProps {
  rows: Array<(ProviderRow | CategoryRow) & { key: string; label: string }>;
}

function ProviderTable({ rows }: ProviderTableProps) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">暂无来源/类别分组</p>;
  }
  return (
    <div className="overflow-x-auto" data-testid="alt-signal-diagnostics-provider-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-4 text-left font-medium">来源/类别</th>
            <th className="py-2 pr-4 text-right font-medium">样本</th>
            <th className="py-2 pr-4 text-right font-medium">命中率</th>
            <th className="py-2 pr-4 text-right font-medium">平均强度</th>
            <th className="py-2 text-right font-medium">平均置信</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hitRateLabel =
              HIT_RATE_TYPE_LABELS[row.hit_rate_type ?? 'none'] ?? row.hit_rate_type ?? '—';
            return (
              <tr key={row.key} className="border-b border-border/40 hover:bg-muted/30">
                <td className="py-2 pr-4 font-medium text-foreground">{row.label}</td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {row.count ?? '—'}
                </td>
                <td className="py-2 pr-4 text-right">
                  <span className="text-foreground">{formatPercent(row.hit_rate)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{hitRateLabel}</span>
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {formatNumber(row.avg_strength)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {formatNumber(row.avg_confidence)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DecayChartProps {
  curve: DecayCurvePoint[];
}

function DecayChart({ curve }: DecayChartProps) {
  const data = curve.map((p) => ({
    age: p.age_days ?? 0,
    weight: typeof p.decay_weight === 'number' ? p.decay_weight : 0,
    signal: typeof p.avg_decayed_signal === 'number' ? p.avg_decayed_signal : 0,
  }));

  return (
    <div data-testid="alt-signal-diagnostics-decay-chart">
      <p className="mb-2 text-xs font-medium text-muted-foreground">半衰期衰减曲线</p>
      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 10, fill: CHART_TICK_COLOR }}
              tickFormatter={(v: number) => `${v}d`}
              label={{ value: '信号年龄(天)', position: 'insideBottom', fontSize: 10, fill: CHART_TICK_COLOR, dy: 4 }}
            />
            <YAxis tick={{ fontSize: 10, fill: CHART_TICK_COLOR }} width={30} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={{ color: CHART_TICK_COLOR }}
              formatter={(value: unknown, name: unknown) => [
                typeof value === 'number' ? value.toFixed(3) : String(value ?? ''),
                name === 'weight' ? '衰减权重' : '均衰减信号',
              ]}
            />
            <Line
              type="monotone"
              dataKey="weight"
              name="weight"
              stroke={CHART_PRIMARY_COLOR}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="signal"
              name="signal"
              stroke={CHART_POS_COLOR}
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface RecentTableProps {
  rows: Array<RecentRecord & { key: string }>;
}

function RecentTable({ rows }: RecentTableProps) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">暂无最近记录</p>;
  }
  return (
    <div className="overflow-x-auto" data-testid="alt-signal-diagnostics-recent-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-4 text-left font-medium">记录</th>
            <th className="py-2 pr-4 text-left font-medium">来源</th>
            <th className="py-2 pr-4 text-left font-medium">类别</th>
            <th className="py-2 pr-4 text-right font-medium">年龄</th>
            <th className="py-2 text-right font-medium">衰减后强度</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/40 hover:bg-muted/30">
              <td className="py-2 pr-4 font-mono text-xs text-foreground">
                {row.record_id ?? '—'}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {providerLabel(row.source)}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{row.category ?? '—'}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground">
                {formatNumber(row.age_days, 1)} 天
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {formatNumber(row.decayed_strength, 3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AltSignalDiagnosticsTile() {
  const [data, setData] = useState<AltSignalDiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltSignalDiagnostics(DEFAULT_PARAMS);
      setData((payload as AltSignalDiagnosticsPayload) ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载另类数据信号诊断失败';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchDiagnostics();
    });
  }, [fetchDiagnostics]);

  const providerRows = useMemo(() => {
    const providers: Array<ProviderRow & { key: string; label: string }> = (
      Array.isArray(data?.providers) ? data.providers : []
    ).map((row, index) => ({
      ...row,
      key: `provider-${row.provider ?? 'unknown'}-${index}`,
      label: providerLabel(row.provider),
    }));

    const categories: Array<CategoryRow & { key: string; label: string }> = (
      Array.isArray(data?.categories) ? data.categories : []
    ).map((row, index) => ({
      ...row,
      key: `category-${row.category ?? 'unknown'}-${index}`,
      label: providerLabel(row.category),
    }));

    return [...providers, ...categories];
  }, [data]);

  const decayRows = useMemo(
    () =>
      (Array.isArray(data?.decay_curve) ? data.decay_curve : []),
    [data],
  );

  const recentRows = useMemo<Array<RecentRecord & { key: string }>>(
    () =>
      (Array.isArray(data?.recent_records) ? data.recent_records : []).map((row, index) => ({
        ...row,
        key: `${row.record_id ?? 'record'}-${index}`,
      })),
    [data],
  );

  const overall = data?.overall ?? {};
  const hitRateType = overall.hit_rate_type ?? 'none';
  const hitRateLabel = HIT_RATE_TYPE_LABELS[hitRateType] ?? hitRateType;

  return (
    <Card className="bg-card border-border" data-testid="alt-signal-diagnostics-tile">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">信号命中率与衰减诊断</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDiagnostics()}
            disabled={loading}
            data-testid="alt-signal-diagnostics-refresh"
          >
            <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>

      <CardContent className="min-h-[320px]">
        {error ? (
          <Alert variant="destructive" data-testid="alt-signal-diagnostics-error">
            <AlertCircle className="size-4" />
            <AlertTitle>无法加载信号诊断</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading && !data ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <span className="text-muted-foreground text-sm">加载中…</span>
          </div>
        ) : !data ? (
          <div
            className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm"
            data-testid="alt-signal-diagnostics-empty"
          >
            暂无信号诊断
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overview stats */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="样本数"
                value={String(Number(data.record_count ?? 0))}
                testId="alt-signal-diagnostics-record-count"
              />
              <StatCard
                label="总体命中率"
                value={formatPercent(overall.hit_rate)}
              />
              <StatCard
                label="平均置信"
                value={formatNumber(overall.avg_confidence)}
              />
              <StatCard
                label="半衰期"
                value={`${formatNumber(data.half_life_days, 0)} 天`}
              />
            </div>

            {/* Meta tags */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${
                  hitRateType === 'realized'
                    ? 'border-green-500 text-green-400 bg-green-500/10'
                    : 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
                }`}
              >
                {hitRateLabel}
              </span>
              <span className="text-muted-foreground">
                {Number(data.realized_outcome_count ?? 0)} 条真实 outcome
              </span>
              <span className="text-muted-foreground">
                窗口 {data.timeframe ?? DEFAULT_PARAMS.timeframe}
              </span>
              {data.snapshot_timestamp ? (
                <span className="text-muted-foreground">
                  快照 {data.snapshot_timestamp}
                </span>
              ) : null}
            </div>

            {/* Hit-rate note */}
            {data.hit_rate_note ? (
              <Alert>
                <AlertTitle>口径说明</AlertTitle>
                <AlertDescription>{data.hit_rate_note}</AlertDescription>
              </Alert>
            ) : null}

            {/* Provider / category table */}
            <ProviderTable rows={providerRows} />

            {/* Decay chart + recent records */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <DecayChart curve={decayRows} />
              <RecentTable rows={recentRows} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
