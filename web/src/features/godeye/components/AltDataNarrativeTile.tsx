// ---------------------------------------------------------------------------
// AltDataNarrativeTile — self-fetching narrative summary + bullet list + history
// Rebuilt from frontend/src/components/GodEyeDashboard/AltDataNarrativeTile.jsx (337)
// Self-fetches getAltDataNarrative() + getAltDataNarrativeHistory().
// History is lazy-loaded (only when the user opens the panel).
// No antd — shadcn/Tailwind only. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, History, AlertCircle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getAltDataNarrative,
  getAltDataNarrativeHistory,
} from '@/services/api/altDataAndMacro';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceLink {
  component?: string;
  verdict?: string;
  stale?: boolean;
  snapshot_path?: string;
}

interface NarrativePayload {
  summary?: string;
  bullets?: string[];
  evidence_links?: EvidenceLink[];
  generated_at?: string;
  audit_doc_url?: string;
}

interface HistoryEntry {
  archived_at?: string;
  original_generated_at?: string;
  industry?: string;
  summary?: string;
}

interface NarrativeHistoryPayload {
  archives?: HistoryEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VERDICT_LABEL: Record<string, string> = {
  PRODUCTION: '生产可用',
  'WORKING-PROTOTYPE': '可用原型',
  'SCAFFOLDING-ONLY': '仅脚手架',
  DEAD: '停用',
  DERIVED: '派生结论',
  UNKNOWN: '未知',
};

// verdict → badge class
const VERDICT_CLASS: Record<string, string> = {
  PRODUCTION: 'border-green-500 text-green-400 bg-green-500/10',
  'WORKING-PROTOTYPE': 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  'SCAFFOLDING-ONLY': 'border-orange-500 text-orange-400 bg-orange-500/10',
  DEAD: 'border-destructive text-destructive bg-destructive/10',
  DERIVED: 'border-blue-500 text-blue-400 bg-blue-500/10',
};

const PROVIDER_LABELS: Record<string, string> = {
  narrative: '叙事分析',
  composite_signal: '复合信号',
  macro_briefing: '宏观日报',
  people: '人的维度',
  people_layer: '人的维度',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function formatGeneratedAt(value: string | undefined): string {
  if (!value) return '—';
  try {
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} 小时前`;
    const diffD = Math.round(diffH / 24);
    return `${diffD} 天前`;
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
    >
      {VERDICT_LABEL[v] ?? v}
    </span>
  );
}

interface StaleBadgeProps {
  stale: boolean | undefined;
}

function StaleBadge({ stale }: StaleBadgeProps) {
  return stale ? (
    <span
      className="inline-flex items-center rounded-full border border-destructive bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
      data-testid="alt-data-narrative-stale-stale"
    >
      已过期
    </span>
  ) : (
    <span
      className="inline-flex items-center rounded-full border border-green-500 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400"
      data-testid="alt-data-narrative-stale-fresh"
    >
      新鲜
    </span>
  );
}

interface BulletItem {
  key: string;
  text: string;
  evidence: EvidenceLink | null;
}

interface BulletListProps {
  bullets: BulletItem[];
}

function BulletList({ bullets }: BulletListProps) {
  return (
    <ul
      className="mt-3 space-y-3"
      data-testid="alt-data-narrative-bullets"
    >
      {bullets.map((item) => {
        const evidence = item.evidence ?? {};
        const stale = !!evidence.stale;
        const verdict = evidence.verdict ?? 'UNKNOWN';
        const providerLabel =
          PROVIDER_LABELS[evidence.component ?? ''] ?? evidence.component ?? '';

        return (
          <li
            key={item.key}
            className="border-b border-border/30 pb-3 last:border-0"
            data-testid={`alt-data-narrative-bullet-${verdict}`}
          >
            <p className="text-sm text-foreground leading-relaxed">
              {localizeGodEyeText(item.text)}
            </p>
            {evidence.component && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <VerdictBadge verdict={verdict} />
                <StaleBadge stale={stale} />
                {evidence.snapshot_path && (
                  <a
                    href={evidence.snapshot_path}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    data-testid={`alt-data-narrative-link-${evidence.component}`}
                  >
                    {providerLabel} 证据链路
                  </a>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// History panel (slide-in overlay)
// ---------------------------------------------------------------------------

interface HistoryEntry2 {
  key: string;
  stamp: string;
  industry: string;
  summary: string;
}

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  entries: HistoryEntry2[];
}

function HistoryPanel({ open, onClose, loading, error, entries }: HistoryPanelProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="alt-data-narrative-history-drawer"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="presentation"
      />
      {/* Panel */}
      <div className="relative z-10 flex h-full w-[520px] max-w-full flex-col bg-card shadow-xl border-l border-border overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold">另类数据要点摘要 · 14 日趋势</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 p-4">
          {error ? (
            <Alert variant="destructive" data-testid="alt-data-narrative-history-error">
              <AlertCircle className="size-4" />
              <AlertTitle>无法加载历史归档</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
              加载中…
            </div>
          ) : entries.length === 0 ? (
            <div
              className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm"
              data-testid="alt-data-narrative-history-empty"
            >
              尚无历史归档
            </div>
          ) : (
            <ol
              className="space-y-4"
              data-testid="alt-data-narrative-history-timeline"
            >
              {entries.map((entry, idx) => (
                <li
                  key={entry.key}
                  className="border-l-2 border-border pl-4"
                  data-testid={`alt-data-narrative-history-entry-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{entry.stamp}</span>
                    <Badge variant="outline" className="text-xs">
                      {entry.industry}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {localizeGodEyeText(entry.summary)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AltDataNarrativeTile() {
  const [data, setData] = useState<NarrativePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<NarrativeHistoryPayload | null>(null);

  const fetchNarrative = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataNarrative();
      setData((payload as NarrativePayload) ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载另类数据要点摘要失败';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await getAltDataNarrativeHistory({ days: 14 });
      setHistoryData((payload as NarrativeHistoryPayload) ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载另类数据要点摘要历史失败';
      setHistoryError(msg);
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = useCallback(() => {
    setHistoryOpen(true);
    void fetchHistory();
  }, [fetchHistory]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchNarrative();
    });
  }, [fetchNarrative]);

  const bullets = useMemo<BulletItem[]>(() => {
    if (!data) return [];
    const list = Array.isArray(data.bullets) ? data.bullets : [];
    const links = Array.isArray(data.evidence_links) ? data.evidence_links : [];
    return list.map((text, idx) => ({
      key: `bullet-${idx}`,
      text,
      evidence: links[idx] ?? null,
    }));
  }, [data]);

  const hasContent = !!data && bullets.length > 0;

  const historyEntries = useMemo<HistoryEntry2[]>(() => {
    if (!historyData) return [];
    const archives = Array.isArray(historyData.archives) ? historyData.archives : [];
    return archives.map((entry, idx) => {
      let stamp = '—';
      if (entry.archived_at) {
        try {
          stamp = new Date(entry.archived_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          stamp = entry.archived_at;
        }
      }
      return {
        key: `history-${idx}-${entry.archived_at ?? idx}`,
        stamp,
        industry: entry.industry ?? '全局',
        summary: entry.summary ?? '',
      };
    });
  }, [historyData]);

  const auditDocUrl = data?.audit_doc_url ?? 'docs/alt_data_audit.md';
  const generatedAtLabel = useMemo(
    () => formatGeneratedAt(data?.generated_at),
    [data?.generated_at],
  );

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-2" data-testid="alt-data-narrative-tile">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">今日另类数据要点</CardTitle>
            <div className="flex items-center gap-2">
              {data?.generated_at && (
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="alt-data-narrative-generated"
                >
                  生成于 {generatedAtLabel}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={openHistory}
                data-testid="alt-data-narrative-history-button"
              >
                <History className="mr-1 size-3" />
                查看历史
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchNarrative()}
                disabled={loading}
                data-testid="alt-data-narrative-refresh"
              >
                <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-[200px]">
          {error ? (
            <Alert variant="destructive" data-testid="alt-data-narrative-error">
              <AlertCircle className="size-4" />
              <AlertTitle>无法加载另类数据要点摘要</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading && !data ? (
            <div className="flex min-h-[160px] items-center justify-center text-muted-foreground text-sm">
              加载中…
            </div>
          ) : !hasContent ? (
            <div
              className="flex min-h-[160px] items-center justify-center text-muted-foreground text-sm"
              data-testid="alt-data-narrative-empty"
            >
              alt-data 暂无信号
            </div>
          ) : (
            <>
              <p
                className="text-sm leading-relaxed text-foreground mb-4"
                data-testid="alt-data-narrative-summary"
              >
                {localizeGodEyeText(data?.summary ?? '')}
              </p>

              {bullets.length > 0 && <BulletList bullets={bullets} />}

              <div className="mt-3 flex justify-end text-xs text-muted-foreground">
                完整审计见{' '}
                <a
                  href={auditDocUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ml-1 text-primary underline-offset-2 hover:underline"
                >
                  {auditDocUrl}
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <HistoryPanel
        open={historyOpen}
        onClose={closeHistory}
        loading={historyLoading}
        error={historyError}
        entries={historyEntries}
      />
    </>
  );
}
