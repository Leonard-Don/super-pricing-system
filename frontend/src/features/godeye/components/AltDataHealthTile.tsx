// ---------------------------------------------------------------------------
// AltDataHealthTile — self-fetching alt-data provider health audit tile
// Rebuilt from frontend/src/components/GodEyeDashboard/AltDataHealthTile.jsx (252)
// Self-fetches getAltDataHealth(); manages own loading/error/data state.
// No antd — shadcn/Tailwind only. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAltDataHealth } from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthManifestRow {
  name?: string;
  name_zh?: string;
  sub_package?: string;
  sub_package_zh?: string;
  verdict?: string;
  last_refresh_at?: string | null;
  audit_section_ref?: string | null;
}

interface HealthPayload {
  total_components?: number;
  production_count?: number;
  working_prototype_count?: number;
  scaffolding_only_count?: number;
  dead_count?: number;
  generated_at?: string;
  audit_doc_url?: string;
  manifest?: HealthManifestRow[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  PRODUCTION: '生产可用',
  'WORKING-PROTOTYPE': '可用原型',
  'SCAFFOLDING-ONLY': '仅脚手架',
  DEAD: '停用',
  UNKNOWN: '未知',
};

// Maps verdict → Tailwind class tokens (text-pos / text-neg / semantic)
const VERDICT_CLASS: Record<string, string> = {
  PRODUCTION: 'border-green-500 text-green-400 bg-green-500/10',
  'WORKING-PROTOTYPE': 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  'SCAFFOLDING-ONLY': 'border-orange-500 text-orange-400 bg-orange-500/10',
  DEAD: 'border-destructive text-destructive bg-destructive/10',
};

const SUMMARY_STATS: {
  key: keyof HealthPayload;
  label: string;
  cls: string;
}[] = [
  {
    key: 'production_count',
    label: VERDICT_LABEL.PRODUCTION,
    cls: 'border-l-4 border-green-500 bg-green-500/10',
  },
  {
    key: 'working_prototype_count',
    label: VERDICT_LABEL['WORKING-PROTOTYPE'],
    cls: 'border-l-4 border-yellow-500 bg-yellow-500/10',
  },
  {
    key: 'scaffolding_only_count',
    label: VERDICT_LABEL['SCAFFOLDING-ONLY'],
    cls: 'border-l-4 border-orange-500 bg-orange-500/10',
  },
  {
    key: 'dead_count',
    label: VERDICT_LABEL.DEAD,
    cls: 'border-l-4 border-destructive bg-destructive/10',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COMPONENT_LABELS: Record<string, string> = {
  narrative: '叙事分析',
  composite_signal: '复合信号',
  composite: '复合信号',
  macro_briefing: '宏观日报',
  people: '人的维度',
  people_layer: '人的维度',
  lme_inventory: 'LME 库存',
  shfe_inventory: '上期所库存',
  policy_execution: '政策执行',
};

function formatToken(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '—';
  return raw
    .split('/')
    .map((part) => {
      const token = part.trim();
      return COMPONENT_LABELS[token] ?? token.replace(/_/g, ' ');
    })
    .join(' / ');
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface VerdictBadgeProps {
  verdict: string | undefined;
}

function VerdictBadge({ verdict }: VerdictBadgeProps) {
  const v = verdict ?? 'UNKNOWN';
  const cls = VERDICT_CLASS[v] ?? 'border-border text-foreground';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      data-testid={`alt-data-health-verdict-${v}`}
    >
      {VERDICT_LABEL[v] ?? v}
    </span>
  );
}

interface ManifestTableProps {
  rows: (HealthManifestRow & { key: string })[];
}

function ManifestTable({ rows }: ManifestTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-4 text-left font-medium">组件</th>
            <th className="py-2 pr-4 text-left font-medium">子模块</th>
            <th className="py-2 pr-4 text-left font-medium">判定</th>
            <th className="py-2 pr-4 text-left font-medium">最近刷新</th>
            <th className="py-2 text-left font-medium">审计章节</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/40 hover:bg-muted/30">
              <td className="py-2 pr-4 font-medium text-foreground">
                {row.name_zh ?? formatToken(row.name)}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {row.sub_package_zh ?? formatToken(row.sub_package)}
              </td>
              <td className="py-2 pr-4">
                <VerdictBadge verdict={row.verdict} />
              </td>
              <td
                className="py-2 pr-4 text-muted-foreground"
                data-testid={`alt-data-health-refresh-${row.last_refresh_at ? 'fresh' : 'placeholder'}`}
              >
                {formatTimestamp(row.last_refresh_at)}
              </td>
              <td className="py-2">
                {row.audit_section_ref ? (
                  <a
                    href={row.audit_section_ref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    查看
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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

export default function AltDataHealthTile() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataHealth();
      setData((payload as HealthPayload) ?? null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : '加载另类数据健康清单失败';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchHealth();
    });
  }, [fetchHealth]);

  const rows = useMemo<(HealthManifestRow & { key: string })[]>(
    () =>
      (data?.manifest ?? []).map((row, idx) => ({
        key: row.name ?? `row-${idx}`,
        ...row,
      })),
    [data],
  );

  const auditDocUrl = data?.audit_doc_url ?? 'docs/alt_data_audit.md';
  const hasContent = rows.length > 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2" data-testid="alt-data-health-tile">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">另类数据健康</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchHealth()}
            disabled={loading}
            data-testid="alt-data-health-refresh"
          >
            <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </CardHeader>

      <CardContent className="min-h-[320px]">
        {error ? (
          <Alert variant="destructive" data-testid="alt-data-health-error">
            <AlertCircle className="size-4" />
            <AlertTitle>无法加载另类数据健康清单</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading && !data ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <span className="text-muted-foreground text-sm">加载中…</span>
          </div>
        ) : !hasContent ? (
          <div
            className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm"
            data-testid="alt-data-health-empty"
          >
            暂无另类数据健康清单
          </div>
        ) : (
          <>
            {/* Summary stats row */}
            <div
              className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"
              data-testid="alt-data-health-summary"
            >
              {SUMMARY_STATS.map((stat) => (
                <div
                  key={stat.key}
                  className={`rounded-lg p-3 ${stat.cls}`}
                  data-testid={`alt-data-health-stat-${stat.key}`}
                >
                  <div className="text-muted-foreground text-xs">{stat.label}</div>
                  <div className="text-xl font-semibold text-foreground">
                    {Number(data?.[stat.key] ?? 0)}
                  </div>
                </div>
              ))}
            </div>

            {/* Manifest table */}
            <div data-testid="alt-data-health-table">
              <ManifestTable rows={rows} />
            </div>

            {/* Footer */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                共{' '}
                {Number(data?.total_components ?? rows.length)}{' '}
                个组件；快照生成于{' '}
                {formatTimestamp(data?.generated_at)}
              </span>
              <span>
                完整审计见{' '}
                <a
                  href={auditDocUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {auditDocUrl}
                </a>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
