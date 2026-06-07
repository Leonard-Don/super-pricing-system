// ---------------------------------------------------------------------------
// AltDataAdvancedDiagnosticsTile — self-fetching advanced diagnostics tile
// Rebuilt from frontend/src/components/GodEyeDashboard/AltDataAdvancedDiagnosticsTile.jsx (437)
// Self-fetches 4 APIs: provider-correlation, themes-with-diversity,
//   composite-signals-cluster-aware, composite-signal-comparison.
// No antd — shadcn/Tailwind + DataTable + ChartFrame. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import {
  getAltDataThemesWithDiversity,
  getAltDataProviderCorrelation,
  getCompositeSignalsClusterAware,
  getCompositeSignalComparison,
} from '@/services/api/altDataAndMacro';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClusterDiversity {
  diversity_tier?: string;
  providers_count?: number;
  clusters_count?: number;
}

interface ThemeRow {
  industry?: string;
  conviction?: string;
  cluster_diversity?: ClusterDiversity;
  supporting_archives?: string[];
}

interface ThemesPayload {
  themes?: ThemeRow[];
  audit_doc_url?: string;
}

interface PublicSummary {
  effective_provider_count?: number;
  redundant_cluster_count?: number;
  average_pairwise_correlation?: number;
  most_redundant_pair?: unknown[];
  most_independent_pair?: unknown[];
  redundancy_clusters?: unknown[][];
}

interface CorrelationPayload {
  public_summary?: PublicSummary;
  most_redundant_pair?: unknown[];
  most_independent_pair?: unknown[];
  average_pairwise_correlation?: number;
  redundancy_clusters?: unknown[][];
  audit_doc_url?: string;
}

interface ClusterAwareSignal {
  target?: string;
  direction?: string;
  conviction?: string;
  supporting_clusters_count?: number;
  supporting_clusters?: unknown[];
  aggregate_strength?: number;
}

interface ClusterAwarePayload {
  composite_signals?: ClusterAwareSignal[];
}

interface ComparisonRow {
  industry?: string;
  direction?: string;
  legacy_conviction?: string;
  cluster_aware_conviction?: string;
  legacy_supporting_components_count?: number;
  cluster_aware_supporting_clusters_count?: number;
}

interface ComparisonSummary {
  tier_changes_count?: number;
  downgrades?: number;
  upgrades?: number;
  total_comparisons?: number;
}

interface ComparisonPayload {
  tier_changes?: ComparisonRow[];
  summary?: ComparisonSummary;
}

interface DiagnosticsData {
  correlation: CorrelationPayload;
  themes: ThemesPayload;
  clusterAware: ClusterAwarePayload;
  comparison: ComparisonPayload;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const FETCH_PARAMS_CORRELATION = Object.freeze({ days_window: 45 });
const FETCH_PARAMS_THEMES = Object.freeze({
  days_window: 14,
  min_conviction: 'low' as const,
  min_providers: 2,
  cluster_threshold: 0.9,
});
const FETCH_PARAMS_CLUSTER_AWARE = Object.freeze({
  days_window: 14,
  min_conviction: 'low' as const,
  cluster_threshold: 0.9,
  limit: 12,
});
const FETCH_PARAMS_COMPARISON = Object.freeze({ days_window: 14, cluster_threshold: 0.9 });

const DIRECTION_CLASS: Record<string, string> = {
  bullish: 'border-green-500 text-green-400 bg-green-500/10',
  bearish: 'border-destructive text-destructive bg-destructive/10',
  mixed: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  neutral: 'border-muted-foreground text-muted-foreground bg-muted/20',
};

const CONVICTION_CLASS: Record<string, string> = {
  high: 'border-green-500 text-green-400 bg-green-500/10',
  HIGH: 'border-green-500 text-green-400 bg-green-500/10',
  medium: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  MEDIUM: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  low: 'border-orange-500 text-orange-400 bg-orange-500/10',
  LOW: 'border-orange-500 text-orange-400 bg-orange-500/10',
};

const DIVERSITY_CLASS: Record<string, string> = {
  HIGH: 'border-green-500 text-green-400 bg-green-500/10',
  MEDIUM: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  LOW: 'border-orange-500 text-orange-400 bg-orange-500/10',
};

function formatNum(value: unknown, digits = 2): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function directionLabel(value: unknown): string {
  const d = String(value ?? '').trim();
  if (d === 'bullish') return '看多';
  if (d === 'bearish') return '看空';
  if (d === 'mixed') return '多空互现';
  if (d === 'neutral') return '中性';
  return d || '—';
}

function convictionLabel(value: unknown): string {
  return String(value ?? '—').toUpperCase();
}

function pairLabel(pair: unknown): string {
  if (!Array.isArray(pair) || pair.length < 3) return '—';
  const p0 = String(pair[0] ?? '');
  const p1 = String(pair[1] ?? '');
  const score = formatNum(pair[2], 2);
  return `${p0} ↔ ${p1} ${score}`;
}

function clusterLabel(cluster: unknown): string {
  if (!Array.isArray(cluster) || cluster.length === 0) return '—';
  return cluster.map((item) => String(item ?? '')).join(' + ');
}

function getSupportingClustersCount(signal: ClusterAwareSignal): number {
  if (typeof signal.supporting_clusters_count === 'number') {
    return signal.supporting_clusters_count;
  }
  if (Array.isArray(signal.supporting_clusters)) {
    return signal.supporting_clusters.length;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Sub-component: ProviderCorrelationSection
// ---------------------------------------------------------------------------

interface ProviderCorrelationSectionProps {
  correlation: CorrelationPayload;
}

function ProviderCorrelationSection({ correlation }: ProviderCorrelationSectionProps) {
  const pub = correlation.public_summary ?? {};
  const redundancyClusters = Array.isArray(pub.redundancy_clusters)
    ? pub.redundancy_clusters
    : Array.isArray(correlation.redundancy_clusters)
      ? correlation.redundancy_clusters
      : [];
  const redundantPair = pub.most_redundant_pair ?? correlation.most_redundant_pair;
  const independentPair = pub.most_independent_pair ?? correlation.most_independent_pair;
  const avgCorr = pub.average_pairwise_correlation ?? correlation.average_pairwise_correlation;

  return (
    <div data-testid="advanced-diagnostics-provider-summary">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <Card className="bg-card/60">
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="text-xs text-muted-foreground">来源独立性</p>
            <p
              className="text-sm font-semibold"
              data-testid="advanced-diagnostics-effective-provider-count"
            >
              {`有效来源 ${Number(pub.effective_provider_count ?? 0)}`}
            </p>
            <p
              className="text-xs text-muted-foreground"
              data-testid="advanced-diagnostics-redundant-cluster-count"
            >
              {`冗余簇 ${Number(pub.redundant_cluster_count ?? 0)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {`平均相关 ${formatNum(avgCorr, 2)}`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="text-xs text-muted-foreground">最冗余组合</p>
            <p className="text-sm font-semibold">{pairLabel(redundantPair)}</p>
            <p className="text-xs text-muted-foreground">
              {`最独立 ${pairLabel(independentPair)}`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="text-xs text-muted-foreground">冗余簇数量</p>
            <p className="text-sm font-semibold">
              {`${redundancyClusters.length} 个冗余簇`}
            </p>
          </CardContent>
        </Card>
      </div>
      {redundancyClusters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          <span className="text-xs text-muted-foreground self-center">冗余簇:</span>
          {redundancyClusters.slice(0, 6).map((cluster, idx) => (
            <Badge
              key={`cluster-${idx}`}
              variant="outline"
              className={
                Array.isArray(cluster) && cluster.length > 1
                  ? 'border-orange-500 text-orange-400 bg-orange-500/10 text-xs'
                  : 'text-xs'
              }
            >
              {clusterLabel(cluster)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ClusterAwareSection
// ---------------------------------------------------------------------------

interface ClusterAwareSectionProps {
  rows: (ClusterAwareSignal & { _key: string })[];
}

function ClusterAwareSection({ rows }: ClusterAwareSectionProps) {
  const columns = useMemo<ColumnDef<ClusterAwareSignal & { _key: string }>[]>(
    () => [
      {
        accessorKey: 'target',
        header: '标的/行业',
        cell: ({ row }) => (
          <span className="font-semibold">{String(row.original.target ?? '—')}</span>
        ),
      },
      {
        accessorKey: 'direction',
        header: '方向',
        cell: ({ row }) => {
          const dir = String(row.original.direction ?? '');
          return (
            <Badge
              variant="outline"
              className={`${DIRECTION_CLASS[dir] ?? ''} text-xs`}
            >
              {directionLabel(dir)}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'conviction',
        header: 'cluster-aware 置信',
        cell: ({ row }) => {
          const conv = String(row.original.conviction ?? '');
          return (
            <Badge
              variant="outline"
              className={`${CONVICTION_CLASS[conv] ?? ''} text-xs`}
            >
              {convictionLabel(conv)}
            </Badge>
          );
        },
      },
      {
        id: 'supporting_clusters_count',
        header: '独立支撑簇',
        cell: ({ row }) =>
          `${getSupportingClustersCount(row.original)} 个独立簇`,
      },
      {
        accessorKey: 'aggregate_strength',
        header: '强度',
        cell: ({ row }) => formatNum(row.original.aggregate_strength, 2),
      },
    ],
    [],
  );

  return (
    <div data-testid="advanced-diagnostics-cluster-aware-table">
      <DataTable columns={columns} data={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ComparisonSection
// ---------------------------------------------------------------------------

interface ComparisonSectionProps {
  rows: (ComparisonRow & { _key: string })[];
  summary: ComparisonSummary;
}

function ComparisonSection({ rows, summary }: ComparisonSectionProps) {
  const columns = useMemo<ColumnDef<ComparisonRow & { _key: string }>[]>(
    () => [
      {
        accessorKey: 'industry',
        header: '行业',
        cell: ({ row }) => (
          <span className="font-semibold">{String(row.original.industry ?? '—')}</span>
        ),
      },
      {
        accessorKey: 'direction',
        header: '方向',
        cell: ({ row }) => {
          const dir = String(row.original.direction ?? '');
          return (
            <Badge
              variant="outline"
              className={`${DIRECTION_CLASS[dir] ?? ''} text-xs`}
            >
              {directionLabel(dir)}
            </Badge>
          );
        },
      },
      {
        id: 'tier_shift',
        header: 'Legacy → Cluster-aware',
        cell: ({ row }) => (
          <span className="font-semibold font-mono text-xs">
            {`${convictionLabel(row.original.legacy_conviction)} → ${convictionLabel(row.original.cluster_aware_conviction)}`}
          </span>
        ),
      },
      {
        id: 'support_shift',
        header: '支撑口径变化',
        cell: ({ row }) =>
          `${Number(row.original.legacy_supporting_components_count ?? 0)} 组件 → ${Number(row.original.cluster_aware_supporting_clusters_count ?? 0)} 簇`,
      },
    ],
    [],
  );

  return (
    <div className="space-y-2">
      <div
        data-testid="advanced-diagnostics-comparison-summary"
        className="flex flex-wrap gap-3 text-xs text-muted-foreground"
      >
        <span>
          {localizeGodEyeText('用于识别重复来源导致的置信度虚高。')}
        </span>
        <span>
          {`层级变化 ${Number(summary.tier_changes_count ?? 0)} · 下调 ${Number(summary.downgrades ?? 0)} · 上调 ${Number(summary.upgrades ?? 0)} · 总计 ${Number(summary.total_comparisons ?? 0)}`}
        </span>
      </div>
      <div data-testid="advanced-diagnostics-comparison-table">
        <DataTable columns={columns} data={rows} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ThemeDiversitySection
// ---------------------------------------------------------------------------

interface ThemeDiversitySectionProps {
  rows: (ThemeRow & { _key: string })[];
}

function ThemeDiversitySection({ rows }: ThemeDiversitySectionProps) {
  const columns = useMemo<ColumnDef<ThemeRow & { _key: string }>[]>(
    () => [
      {
        accessorKey: 'industry',
        header: '主题',
        cell: ({ row }) => (
          <span className="font-semibold">{String(row.original.industry ?? '—')}</span>
        ),
      },
      {
        accessorKey: 'conviction',
        header: '归档置信',
        cell: ({ row }) => {
          const conv = String(row.original.conviction ?? '');
          return (
            <Badge
              variant="outline"
              className={`${CONVICTION_CLASS[conv] ?? ''} text-xs`}
            >
              {convictionLabel(conv)}
            </Badge>
          );
        },
      },
      {
        id: 'diversity',
        header: '来源多样性',
        cell: ({ row }) => {
          const tier = String(row.original.cluster_diversity?.diversity_tier ?? '—');
          return (
            <Badge
              variant="outline"
              className={`${DIVERSITY_CLASS[tier] ?? ''} text-xs`}
            >
              {tier}
            </Badge>
          );
        },
      },
      {
        id: 'providers_clusters',
        header: '来源 / 簇',
        cell: ({ row }) => {
          const div = row.original.cluster_diversity ?? {};
          return `${Number(div.providers_count ?? 0)} 来源 / ${Number(div.clusters_count ?? 0)} 簇`;
        },
      },
      {
        id: 'supporting_archives',
        header: '支撑档案',
        cell: ({ row }) => {
          const archives = Array.isArray(row.original.supporting_archives)
            ? row.original.supporting_archives
            : [];
          return (
            <div className="flex flex-wrap gap-1">
              {archives.slice(0, 4).map((archive) => (
                <Badge key={archive} variant="secondary" className="text-xs">
                  {String(archive)}
                </Badge>
              ))}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div data-testid="advanced-diagnostics-theme-table">
      <DataTable columns={columns} data={rows} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AltDataAdvancedDiagnosticsTile() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(() => {
    startTransition(() => {
      setLoading(true);
      setError(null);
    });

    Promise.all([
      getAltDataProviderCorrelation(FETCH_PARAMS_CORRELATION),
      getAltDataThemesWithDiversity(FETCH_PARAMS_THEMES),
      getCompositeSignalsClusterAware(FETCH_PARAMS_CLUSTER_AWARE),
      getCompositeSignalComparison(FETCH_PARAMS_COMPARISON),
    ])
      .then(([correlation, themes, clusterAware, comparison]) => {
        startTransition(() => {
          setData({
            correlation: (correlation as CorrelationPayload) ?? {},
            themes: (themes as ThemesPayload) ?? {},
            clusterAware: (clusterAware as ClusterAwarePayload) ?? {},
            comparison: (comparison as ComparisonPayload) ?? {},
          });
          setLoading(false);
        });
      })
      .catch((err: unknown) => {
        const msg =
          (err as { userMessage?: string; message?: string })?.userMessage ??
          (err as { message?: string })?.message ??
          '加载 alt-data 高级诊断失败';
        startTransition(() => {
          setError(String(msg));
          setData(null);
          setLoading(false);
        });
      });
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  // Derived rows
  const themeRows = useMemo(
    () =>
      Array.isArray(data?.themes?.themes)
        ? data.themes.themes.map((row, idx) => ({
            ...row,
            _key: `${String(row.industry ?? 'theme')}-${idx}`,
          }))
        : [],
    [data],
  );

  const clusterAwareRows = useMemo(
    () =>
      Array.isArray(data?.clusterAware?.composite_signals)
        ? data.clusterAware.composite_signals.slice(0, 8).map((row, idx) => ({
            ...row,
            _key: `${String(row.target ?? 'ca')}-${String(row.direction ?? 'dir')}-${idx}`,
          }))
        : [],
    [data],
  );

  const comparisonRows = useMemo(
    () =>
      Array.isArray(data?.comparison?.tier_changes)
        ? data.comparison.tier_changes.slice(0, 8).map((row, idx) => ({
            ...row,
            _key: `${String(row.industry ?? 'cmp')}-${String(row.direction ?? 'dir')}-${idx}`,
          }))
        : [],
    [data],
  );

  const comparisonSummary: ComparisonSummary = data?.comparison?.summary ?? {};

  const hasAnyContent =
    themeRows.length > 0 ||
    clusterAwareRows.length > 0 ||
    comparisonRows.length > 0;

  const auditDocUrl =
    data?.correlation?.audit_doc_url ??
    data?.themes?.audit_doc_url ??
    'docs/alt_data_audit.md';

  return (
    <Card data-testid="alt-data-advanced-diagnostics-tile">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">冗余与 cluster-aware 诊断</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDiagnostics}
              disabled={loading}
              data-testid="alt-data-advanced-diagnostics-refresh"
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              刷新
            </Button>
            <a
              href={auditDocUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              审计文档
            </a>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error */}
        {error && (
          <Alert variant="destructive" data-testid="alt-data-advanced-diagnostics-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>加载 alt-data 高级诊断失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {loading && !data && (
          <div
            className="flex justify-center py-6"
            data-testid="alt-data-advanced-diagnostics-spinner"
          >
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && !hasAnyContent && (
          <p
            className="text-sm text-muted-foreground py-4 text-center"
            data-testid="alt-data-advanced-diagnostics-empty"
          >
            暂无 provider 冗余、主题多样性或 cluster-aware 诊断结果
          </p>
        )}

        {/* Content */}
        {data && !loading && !error && hasAnyContent && (
          <div className="space-y-5">
            {/* Section 1: Provider correlation summary */}
            <ProviderCorrelationSection correlation={data.correlation} />

            {/* Section 2: Cluster-aware signals table */}
            {clusterAwareRows.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  独立簇复合信号
                </h3>
                <ClusterAwareSection rows={clusterAwareRows} />
              </div>
            )}

            {/* Section 3: Comparison (legacy vs cluster-aware) */}
            {comparisonRows.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Legacy provider-vote 与 cluster-aware 层级变化
                </h3>
                <ComparisonSection rows={comparisonRows} summary={comparisonSummary} />
              </div>
            )}

            {/* Section 4: Theme diversity */}
            {themeRows.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  长期主题来源多样性
                </h3>
                <ThemeDiversitySection rows={themeRows} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
