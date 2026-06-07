// ---------------------------------------------------------------------------
// CompositeSignalTile — self-fetching high-conviction composite signals tile
// Rebuilt from frontend/src/components/GodEyeDashboard/CompositeSignalTile.jsx (396)
// Self-fetches getCompositeSignals() + getCompositeSignalsClusterAware() + getCompositeSignalHistory().
// No antd — shadcn/Tailwind + Recharts. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { RefreshCw, AlertCircle, History } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getCompositeSignals,
  getCompositeSignalsClusterAware,
  getCompositeSignalHistory,
} from '@/services/api/altDataAndMacro';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';
import {
  CHART_GRID_COLOR,
  CHART_TICK_COLOR,
  CHART_POS_COLOR,
  CHART_NEG_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SupportingComponent {
  component?: string;
}

interface CompositeSignal {
  target?: string;
  direction?: string;
  conviction?: string;
  aggregate_strength?: number;
  supporting_components?: SupportingComponent[];
}

interface TierSummary {
  high?: number;
  medium?: number;
  low?: number;
}

interface CompositeSignalsPayload {
  composite_signals?: CompositeSignal[];
  tier_summary?: TierSummary;
  generated_at?: string;
  audit_doc_url?: string;
}

interface ClusterSignal {
  cluster_label?: string;
  direction?: string;
  conviction?: string;
  cluster_size?: number;
  avg_strength?: number;
}

interface ClusterAwarePayload {
  // Backend /alt-data/composite-signals-cluster-aware returns `composite_signals`
  // (same field as the advanced-diagnostics tile), NOT `cluster_signals`.
  composite_signals?: ClusterSignal[];
  generated_at?: string;
}

interface HistoryArchive {
  target?: string;
  direction?: string;
  conviction?: string;
  archived_at?: string;
  original_emit_at?: string;
  supporting_components_count?: number;
  supporting_components?: SupportingComponent[];
}

interface CompositeHistoryPayload {
  archives?: HistoryArchive[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONVICTION_CLASS: Record<string, string> = {
  high: 'border-green-500 text-green-400 bg-green-500/10',
  medium: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  low: 'border-border text-muted-foreground bg-muted/10',
};

const CONVICTION_STARS: Record<string, string> = {
  high: '★★★',
  medium: '★★',
  low: '★',
};

const CONVICTION_LABEL: Record<string, string> = {
  high: '高置信',
  medium: '中置信',
  low: '低置信',
};

const DIRECTION_CLASS: Record<string, string> = {
  bullish: 'border-green-500 text-green-400 bg-green-500/10',
  bearish: 'border-destructive text-destructive bg-destructive/10',
};

const DIRECTION_LABEL: Record<string, string> = {
  bullish: '看多',
  bearish: '看空',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStrength(v: number | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function formatTimestamp(v: string | undefined): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return v;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface BadgeProps {
  cls: string;
  children: React.ReactNode;
  testId?: string;
}

function Badge({ cls, children, testId }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

interface ComponentListProps {
  components: SupportingComponent[];
}

function ComponentList({ components }: ComponentListProps) {
  if (components.length === 0) {
    return <span className="text-muted-foreground text-xs">无支撑组件</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {components.map((entry, i) => (
        <span
          key={`${entry.component ?? 'c'}-${i}`}
          className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {localizeGodEyeText(entry.component ?? '')}
        </span>
      ))}
    </div>
  );
}

interface CompositeRowProps {
  signal: CompositeSignal;
  index: number;
  side: 'bullish' | 'bearish';
}

function CompositeRow({ signal, index, side }: CompositeRowProps) {
  const conviction = signal.conviction ?? 'low';
  const direction = signal.direction ?? 'bullish';
  const components = Array.isArray(signal.supporting_components)
    ? signal.supporting_components
    : [];

  return (
    <div
      data-testid={`composite-signal-row-${side}-${index}`}
      className="py-2 border-b border-border/40 last:border-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground text-sm">
          {signal.target ?? '—'}
        </span>
        <Badge cls={DIRECTION_CLASS[direction] ?? 'border-border text-muted-foreground'}>
          {DIRECTION_LABEL[direction] ?? direction}
        </Badge>
        <Badge
          cls={CONVICTION_CLASS[conviction] ?? 'border-border text-muted-foreground'}
          testId={`composite-signal-conviction-${conviction}`}
        >
          {CONVICTION_STARS[conviction] ?? '★'} {CONVICTION_LABEL[conviction] ?? conviction}
        </Badge>
        <span className="text-muted-foreground text-xs">
          强度 {formatStrength(signal.aggregate_strength)}
        </span>
      </div>
      <ComponentList components={components} />
    </div>
  );
}

interface ClusterRowProps {
  cluster: ClusterSignal;
  index: number;
}

function ClusterRow({ cluster, index }: ClusterRowProps) {
  const conviction = cluster.conviction ?? 'low';
  const direction = cluster.direction ?? 'bullish';
  return (
    <div
      data-testid={`composite-cluster-row-${index}`}
      className="py-2 border-b border-border/40 last:border-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground text-sm">
          {cluster.cluster_label ?? '—'}
        </span>
        <Badge cls={DIRECTION_CLASS[direction] ?? 'border-border text-muted-foreground'}>
          {DIRECTION_LABEL[direction] ?? direction}
        </Badge>
        <Badge cls={CONVICTION_CLASS[conviction] ?? 'border-border text-muted-foreground'}>
          {CONVICTION_STARS[conviction] ?? '★'} {CONVICTION_LABEL[conviction] ?? conviction}
        </Badge>
        <span className="text-muted-foreground text-xs">
          簇大小 {cluster.cluster_size ?? 0} · 均强度 {formatStrength(cluster.avg_strength)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History sparkline (bar chart of signal counts by date)
// ---------------------------------------------------------------------------

interface HistorySparklineProps {
  archives: HistoryArchive[];
}

function HistorySparkline({ archives }: HistorySparklineProps) {
  // Aggregate archives by date for sparkline
  const chartData = useMemo(() => {
    const counts: Record<string, { date: string; bullish: number; bearish: number }> = {};
    for (const entry of archives) {
      const date = entry.archived_at
        ? entry.archived_at.slice(0, 10)
        : 'unknown';
      if (!counts[date]) counts[date] = { date, bullish: 0, bearish: 0 };
      const dir = entry.direction ?? 'bullish';
      if (dir === 'bullish') counts[date].bullish += 1;
      else counts[date].bearish += 1;
    }
    return Object.values(counts).sort((a, b) => a.date.localeCompare(b.date));
  }, [archives]);

  if (chartData.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">暂无归档数据</p>
    );
  }

  return (
    <div data-testid="composite-signal-history-sparkline" className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: CHART_TICK_COLOR }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis tick={{ fontSize: 10, fill: CHART_TICK_COLOR }} width={24} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={{ color: CHART_TICK_COLOR }}
          />
          <Bar dataKey="bullish" name="看多" fill={CHART_POS_COLOR} stackId="a" />
          <Bar dataKey="bearish" name="看空" fill={CHART_NEG_COLOR} stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompositeSignalTile() {
  const [data, setData] = useState<CompositeSignalsPayload | null>(null);
  const [clusterData, setClusterData] = useState<ClusterAwarePayload | null>(null);
  const [historyData, setHistoryData] = useState<CompositeHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [signals, cluster] = await Promise.all([
        getCompositeSignals({ min_conviction: 'low', limit: 50 }),
        getCompositeSignalsClusterAware({ min_conviction: 'low', limit: 20 }),
      ]);
      setData((signals as CompositeSignalsPayload) ?? null);
      setClusterData((cluster as ClusterAwarePayload) ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载复合信号失败';
      setError(msg);
      setData(null);
      setClusterData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const payload = await getCompositeSignalHistory({ days: 14 });
      setHistoryData((payload as CompositeHistoryPayload) ?? null);
    } catch {
      // history failure is non-fatal — leave historyData null
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchSignals();
    });
  }, [fetchSignals]);

  // Fetch history lazily when drawer opens
  useEffect(() => {
    if (historyOpen && historyData === null) {
      startTransition(() => {
        void fetchHistory();
      });
    }
  }, [historyOpen, historyData, fetchHistory]);

  const { topBullish, topBearish, tierSummary } = useMemo(() => {
    if (!data) return { topBullish: [], topBearish: [], tierSummary: null };
    const list = Array.isArray(data.composite_signals) ? data.composite_signals : [];
    const bullish = list.filter((s) => s.direction === 'bullish').slice(0, 5);
    const bearish = list.filter((s) => s.direction === 'bearish').slice(0, 5);
    return {
      topBullish: bullish,
      topBearish: bearish,
      tierSummary: data.tier_summary ?? null,
    };
  }, [data]);

  const clusterSignals = useMemo(() => {
    if (!clusterData) return [];
    return Array.isArray(clusterData.composite_signals)
      ? clusterData.composite_signals.slice(0, 10)
      : [];
  }, [clusterData]);

  const archives = useMemo(() => {
    if (!historyData) return [];
    return Array.isArray(historyData.archives) ? historyData.archives : [];
  }, [historyData]);

  const hasContent = topBullish.length > 0 || topBearish.length > 0;

  const auditDocUrl = data?.audit_doc_url ?? 'docs/alt_data_audit.md';

  return (
    <Card className="bg-card border-border" data-testid="composite-signal-tile">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">跨组件复合信号</CardTitle>
            {tierSummary ? (
              <>
                <Badge
                  cls="border-green-500 text-green-400 bg-green-500/10"
                  testId="composite-tier-high"
                >
                  高 {tierSummary.high ?? 0}
                </Badge>
                <Badge
                  cls="border-yellow-500 text-yellow-400 bg-yellow-500/10"
                  testId="composite-tier-medium"
                >
                  中 {tierSummary.medium ?? 0}
                </Badge>
                <Badge
                  cls="border-border text-muted-foreground"
                  testId="composite-tier-low"
                >
                  低 {tierSummary.low ?? 0}
                </Badge>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen((o) => !o)}
              data-testid="composite-signal-history-button"
            >
              <History className="mr-1 size-3" />
              {historyOpen ? '收起历史' : '查看历史'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchSignals()}
              disabled={loading}
              data-testid="composite-signal-refresh"
            >
              <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <a
              href={auditDocUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              审计文档
            </a>
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-[320px]">
        {error ? (
          <Alert variant="destructive" data-testid="composite-signal-error">
            <AlertCircle className="size-4" />
            <AlertTitle>加载复合信号失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading && !data ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <span className="text-muted-foreground text-sm">加载中…</span>
          </div>
        ) : !hasContent ? (
          <div
            className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm"
            data-testid="composite-signal-empty"
          >
            当前 alt-data 层未触发跨组件复合信号
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bullish / Bearish two-column grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Bullish column */}
              <div>
                <p
                  className="mb-2 text-xs text-muted-foreground"
                  data-testid="composite-signal-bullish-header"
                >
                  看多 Top {topBullish.length}
                </p>
                {topBullish.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无看多复合信号</p>
                ) : (
                  topBullish.map((signal, idx) => (
                    <CompositeRow
                      key={`bullish-${signal.target ?? ''}-${idx}`}
                      signal={signal}
                      index={idx}
                      side="bullish"
                    />
                  ))
                )}
              </div>
              {/* Bearish column */}
              <div>
                <p
                  className="mb-2 text-xs text-muted-foreground"
                  data-testid="composite-signal-bearish-header"
                >
                  看空 Top {topBearish.length}
                </p>
                {topBearish.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无看空复合信号</p>
                ) : (
                  topBearish.map((signal, idx) => (
                    <CompositeRow
                      key={`bearish-${signal.target ?? ''}-${idx}`}
                      signal={signal}
                      index={idx}
                      side="bearish"
                    />
                  ))
                )}
              </div>
            </div>

            {/* Cluster-aware section */}
            <div data-testid="composite-signal-cluster-section">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Cluster-Aware 信号
              </p>
              {clusterSignals.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无 cluster-aware 信号</p>
              ) : (
                clusterSignals.map((cluster, idx) => (
                  <ClusterRow
                    key={`cluster-${cluster.cluster_label ?? ''}-${idx}`}
                    cluster={cluster}
                    index={idx}
                  />
                ))
              )}
            </div>

            {/* History section (inline expand) */}
            {historyOpen ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  14 日信号趋势
                </p>
                {archives.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无历史归档</p>
                ) : (
                  <>
                    <HistorySparkline archives={archives} />
                    <div className="mt-2 space-y-1">
                      {archives.slice(0, 5).map((entry, idx) => (
                        <div
                          key={`history-${entry.archived_at ?? ''}-${idx}`}
                          data-testid={`composite-signal-history-entry-${idx}`}
                          className="flex flex-wrap items-center gap-2 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {formatTimestamp(entry.archived_at)}
                          </span>
                          <span className="font-medium text-foreground">
                            {entry.target ?? '—'}
                          </span>
                          <Badge
                            cls={DIRECTION_CLASS[entry.direction ?? 'bullish'] ?? 'border-border text-muted-foreground'}
                          >
                            {DIRECTION_LABEL[entry.direction ?? 'bullish'] ?? entry.direction}
                          </Badge>
                          <span className="text-muted-foreground">
                            支撑{' '}
                            {typeof entry.supporting_components_count === 'number'
                              ? entry.supporting_components_count
                              : Array.isArray(entry.supporting_components)
                                ? entry.supporting_components.length
                                : 0}{' '}
                            个组件
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
