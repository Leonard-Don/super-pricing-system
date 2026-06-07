// ---------------------------------------------------------------------------
// MacroBriefingTile — self-fetching macro daily briefing (5 sections + delta + history)
// Rebuilt from frontend/src/components/GodEyeDashboard/MacroBriefingTile.jsx (628)
// Self-fetches: getAltDataMacroBriefing() + getAltDataMacroBriefingDelta() +
//               getAltDataMacroBriefingHistory() (lazy on history toggle).
// No antd — shadcn/Tailwind only. Types: no `any`.
// History uses inline slide-in panel (same pattern as AltDataNarrativeTile / CompositeSignalTile).
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, History, AlertCircle, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getAltDataMacroBriefing,
  getAltDataMacroBriefingDelta,
  getAltDataMacroBriefingHistory,
} from '@/services/api/altDataAndMacro';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceLink {
  component?: string;
  stale?: boolean;
  section?: string;
}

interface BriefingPayload {
  summary_paragraph?: string;
  policy_section?: string[];
  capital_flow_section?: string[];
  commodity_section?: string[];
  governance_section?: string[];
  composite_section?: string[];
  evidence_links?: EvidenceLink[];
  generated_at?: string;
  time_window_days?: number;
  audit_doc_url?: string;
}

interface DeltaItem {
  direction?: string;
  headline?: string;
}

interface DeltaPayload {
  summary_delta?: string;
  has_baseline?: boolean;
  policy_deltas?: DeltaItem[];
  capital_flow_deltas?: DeltaItem[];
  commodity_deltas?: DeltaItem[];
  governance_deltas?: DeltaItem[];
  composite_deltas?: DeltaItem[];
}

interface HistoryArchive {
  archived_at?: string;
  original_generated_at?: string;
  summary_paragraph?: string;
  time_window_days?: number;
  evidence_links_count?: number;
  evidence_links?: EvidenceLink[];
}

interface HistoryPayload {
  archives?: HistoryArchive[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface SectionDefinition {
  key: keyof Pick<
    BriefingPayload,
    'policy_section' | 'capital_flow_section' | 'commodity_section' | 'governance_section' | 'composite_section'
  >;
  title: string;
  evidenceSectionKey: string;
  dataTestid: string;
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: 'policy_section',       title: '政策面',   evidenceSectionKey: 'policy',       dataTestid: 'macro-briefing-section-policy' },
  { key: 'capital_flow_section', title: '资金面',   evidenceSectionKey: 'capital_flow',  dataTestid: 'macro-briefing-section-capital-flow' },
  { key: 'commodity_section',    title: '商品面',   evidenceSectionKey: 'commodity',     dataTestid: 'macro-briefing-section-commodity' },
  { key: 'governance_section',   title: '治理面',   evidenceSectionKey: 'governance',    dataTestid: 'macro-briefing-section-governance' },
  { key: 'composite_section',    title: '综合面',   evidenceSectionKey: 'composite',     dataTestid: 'macro-briefing-section-composite' },
];

interface DeltaSectionDefinition {
  key: keyof Pick<
    DeltaPayload,
    'policy_deltas' | 'capital_flow_deltas' | 'commodity_deltas' | 'governance_deltas' | 'composite_deltas'
  >;
  title: string;
  dataTestid: string;
}

const DELTA_SECTION_DEFINITIONS: DeltaSectionDefinition[] = [
  { key: 'policy_deltas',       title: '政策面变化', dataTestid: 'macro-briefing-delta-section-policy' },
  { key: 'capital_flow_deltas', title: '资金面变化', dataTestid: 'macro-briefing-delta-section-capital-flow' },
  { key: 'commodity_deltas',    title: '商品面变化', dataTestid: 'macro-briefing-delta-section-commodity' },
  { key: 'governance_deltas',   title: '治理面变化', dataTestid: 'macro-briefing-delta-section-governance' },
  { key: 'composite_deltas',    title: '综合面变化', dataTestid: 'macro-briefing-delta-section-composite' },
];

// section-key → display label (for machine-readable hidden span)
const SECTION_LABEL_BY_KEY: Record<string, string> = SECTION_DEFINITIONS.reduce(
  (acc, def) => {
    acc[def.evidenceSectionKey] = def.title;
    return acc;
  },
  {} as Record<string, string>,
);

interface DeltaDirectionPreset {
  colorClass: string;
  Icon: typeof ArrowUp;
  label: string;
}

const DELTA_DIRECTION_PRESETS: Record<string, DeltaDirectionPreset> = {
  intensified_bullish: { colorClass: 'text-pos',              Icon: ArrowUp,   label: '加强看多' },
  intensified_bearish: { colorClass: 'text-neg',              Icon: ArrowDown, label: '加深看空' },
  softened_bullish:    { colorClass: 'text-pos opacity-70',   Icon: ArrowDown, label: '看多减弱' },
  softened_bearish:    { colorClass: 'text-neg opacity-70',   Icon: ArrowUp,   label: '看空缓解' },
  reversed_to_bullish: { colorClass: 'text-yellow-400',       Icon: ArrowUp,   label: '反转看多' },
  reversed_to_bearish: { colorClass: 'text-yellow-400',       Icon: ArrowDown, label: '反转看空' },
  new_today:           { colorClass: 'text-blue-400',         Icon: ArrowUp,   label: '新增今日' },
  dropped_today:       { colorClass: 'text-muted-foreground', Icon: ArrowDown, label: '昨日已退出' },
  stable:              { colorClass: 'text-muted-foreground', Icon: ArrowUp,   label: '稳定' },
};

const PRESET_STABLE = DELTA_DIRECTION_PRESETS.stable;

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

function formatStamp(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionBlockProps {
  definition: SectionDefinition;
  bullets: string[] | undefined;
  evidenceLinks: EvidenceLink[] | undefined;
}

function SectionBlock({ definition, bullets, evidenceLinks }: SectionBlockProps) {
  const hasBullets = Array.isArray(bullets) && bullets.length > 0;
  const sectionLinks = (evidenceLinks ?? []).filter(
    (link) => link.section === definition.evidenceSectionKey,
  );

  return (
    <div data-testid={definition.dataTestid} className="mb-4">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">{definition.title}</span>
        {sectionLinks.map((link) => (
          <span
            key={`${definition.key}-${link.component ?? 'unknown'}`}
            className={[
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              link.stale
                ? 'border-destructive bg-destructive/10 text-destructive'
                : 'border-green-500 bg-green-500/10 text-green-400',
            ].join(' ')}
            data-testid={`macro-briefing-evidence-${link.component ?? 'unknown'}`}
          >
            {link.component ?? ''}
            {link.stale ? ' [已过期]' : ''}
          </span>
        ))}
      </div>
      {hasBullets ? (
        <ul className="space-y-1.5">
          {(bullets as string[]).map((item, idx) => (
            <li
              key={`${definition.key}-bullet-${idx}`}
              className="border-b border-border/20 pb-1.5 text-sm text-muted-foreground last:border-0"
              data-testid={`${definition.dataTestid}-bullet-${idx}`}
            >
              {localizeGodEyeText(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">本节暂无信号</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeltaSectionBlock
// ---------------------------------------------------------------------------

interface DeltaSectionBlockProps {
  definition: DeltaSectionDefinition;
  deltas: DeltaItem[] | undefined;
}

function DeltaSectionBlock({ definition, deltas }: DeltaSectionBlockProps) {
  const hasDeltas = Array.isArray(deltas) && deltas.length > 0;

  return (
    <div data-testid={definition.dataTestid} className="mb-4">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">{definition.title}</span>
        <Badge variant="outline" className="text-xs">
          {hasDeltas ? `${deltas.length} 条变化` : '0 条变化'}
        </Badge>
      </div>
      {hasDeltas ? (
        <ul className="space-y-1.5">
          {(deltas as DeltaItem[]).map((item, idx) => {
            const preset =
              DELTA_DIRECTION_PRESETS[item.direction ?? ''] ?? PRESET_STABLE;
            const { Icon, colorClass, label } = preset;
            return (
              <li
                key={`${definition.key}-delta-${idx}`}
                className="flex items-start gap-1.5 border-b border-border/20 pb-1.5 text-sm text-muted-foreground last:border-0"
                data-testid={`${definition.dataTestid}-delta-${idx}`}
              >
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${colorClass}`} />
                <span>
                  <span
                    className={`mr-1.5 inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${colorClass} border-current bg-transparent`}
                  >
                    {label}
                  </span>
                  {localizeGodEyeText(item.headline ?? '')}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">本节昨日至今日无显著变化</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TodayPane
// ---------------------------------------------------------------------------

interface TodayPaneProps {
  data: BriefingPayload;
}

function TodayPane({ data }: TodayPaneProps) {
  const hasAnyBullet = useMemo(
    () =>
      SECTION_DEFINITIONS.some(
        (def) => Array.isArray(data[def.key]) && (data[def.key] as string[]).length > 0,
      ),
    [data],
  );

  return (
    <>
      <p
        data-testid="macro-briefing-summary"
        className="mb-4 text-sm text-foreground leading-relaxed"
      >
        {localizeGodEyeText(data.summary_paragraph ?? '')}
      </p>
      {!hasAnyBullet ? (
        <div
          className="flex min-h-[80px] items-center justify-center text-sm text-muted-foreground"
          data-testid="macro-briefing-empty"
        >
          所有 section 当前均无内容
        </div>
      ) : (
        <div>
          {SECTION_DEFINITIONS.map((def) => (
            <SectionBlock
              key={def.key}
              definition={def}
              bullets={data[def.key] as string[] | undefined}
              evidenceLinks={data.evidence_links}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DeltaPane
// ---------------------------------------------------------------------------

interface DeltaPaneProps {
  delta: DeltaPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function DeltaPane({ delta, loading, error, onRetry }: DeltaPaneProps) {
  if (error) {
    return (
      <Alert variant="destructive" data-testid="macro-briefing-delta-error">
        <AlertCircle className="size-4" />
        <AlertTitle>加载日报变化失败</AlertTitle>
        <AlertDescription>
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            onClick={onRetry}
          >
            重试
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading && !delta) {
    return (
      <div
        className="flex min-h-[80px] items-center justify-center text-sm text-muted-foreground"
        data-testid="macro-briefing-delta-spinner"
      >
        加载中…
      </div>
    );
  }

  if (!delta) {
    return (
      <div
        className="flex min-h-[80px] items-center justify-center text-sm text-muted-foreground"
        data-testid="macro-briefing-delta-placeholder"
      >
        尚未加载日报变化
      </div>
    );
  }

  if (delta.has_baseline === false) {
    return (
      <Alert data-testid="macro-briefing-delta-cold-start">
        <AlertCircle className="size-4" />
        <AlertTitle>{localizeGodEyeText(delta.summary_delta ?? '无昨日 briefing 可对比')}</AlertTitle>
        <AlertDescription>首日基线或归档缺失时，差分视图将延后启用。</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <p
        data-testid="macro-briefing-delta-summary"
        className="mb-4 text-sm text-foreground leading-relaxed"
      >
        {localizeGodEyeText(delta.summary_delta ?? '')}
      </p>
      <div>
        {DELTA_SECTION_DEFINITIONS.map((def) => (
          <DeltaSectionBlock
            key={def.key}
            definition={def}
            deltas={delta[def.key]}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// HistoryPanel (inline slide-in, same pattern as AltDataNarrativeTile)
// ---------------------------------------------------------------------------

interface HistoryEntryRendered {
  key: string;
  stamp: string;
  window: number;
  evidenceCount: number;
  summary: string;
}

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  entries: HistoryEntryRendered[];
}

function HistoryPanel({ open, onClose, loading, error, entries }: HistoryPanelProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="macro-briefing-history-drawer"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        role="presentation"
      />
      {/* Panel */}
      <div className="relative z-10 flex h-full w-[520px] max-w-full flex-col bg-card border-l border-border shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold">另类数据宏观日报 · 本周历史</h2>
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
            <Alert variant="destructive" data-testid="macro-briefing-history-error">
              <AlertCircle className="size-4" />
              <AlertTitle>无法加载历史归档</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          ) : entries.length === 0 ? (
            <div
              className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground"
              data-testid="macro-briefing-history-empty"
            >
              尚无历史归档
            </div>
          ) : (
            <ol
              className="space-y-4"
              data-testid="macro-briefing-history-timeline"
            >
              {entries.map((entry, idx) => (
                <li
                  key={entry.key}
                  className="border-l-2 border-border pl-4"
                  data-testid={`macro-briefing-history-entry-${idx}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{entry.stamp}</span>
                    <Badge variant="outline" className="text-xs">
                      窗口 {entry.window} 天
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      证据 {entry.evidenceCount} 条
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground leading-relaxed">
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

type ActiveTab = 'today' | 'delta';

export default function MacroBriefingTile() {
  // Primary briefing state
  const [data, setData] = useState<BriefingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state (today / delta)
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');

  // Delta state (lazy-loaded on first tab switch)
  const [delta, setDelta] = useState<DeltaPayload | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError, setDeltaError] = useState<string | null>(null);

  // History state (lazy-loaded on panel open)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPayload | null>(null);

  // ── fetch briefing ─────────────────────────────────────────────────────
  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataMacroBriefing();
      setData((payload as BriefingPayload) ?? null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '加载宏观日报失败';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── fetch delta ────────────────────────────────────────────────────────
  const fetchDelta = useCallback(async () => {
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const payload = await getAltDataMacroBriefingDelta();
      setDelta((payload as DeltaPayload) ?? null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '加载日报变化失败';
      setDeltaError(msg);
      setDelta(null);
    } finally {
      setDeltaLoading(false);
    }
  }, []);

  // ── fetch history ──────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await getAltDataMacroBriefingHistory({ days: 7 });
      setHistoryData((payload as HistoryPayload) ?? null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : '加载宏观日报历史失败';
      setHistoryError(msg);
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Initial briefing fetch
  useEffect(() => {
    startTransition(() => {
      void fetchBriefing();
    });
  }, [fetchBriefing]);

  // Lazy-load delta the first time user opens the delta tab
  useEffect(() => {
    if (activeTab === 'delta' && delta === null && !deltaLoading) {
      startTransition(() => {
        void fetchDelta();
      });
    }
  }, [activeTab, delta, deltaLoading, fetchDelta]);

  // ── handlers ───────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    if (activeTab === 'delta') {
      void fetchDelta();
    } else {
      startTransition(() => {
        void fetchBriefing();
      });
    }
  }, [activeTab, fetchBriefing, fetchDelta]);

  const openHistory = useCallback(() => {
    setHistoryOpen(true);
    void fetchHistory();
  }, [fetchHistory]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  // ── derived ────────────────────────────────────────────────────────────
  const generatedLabel = useMemo(
    () => formatGeneratedAt(data?.generated_at),
    [data?.generated_at],
  );

  const auditDocUrl = data?.audit_doc_url ?? 'docs/alt_data_audit.md';

  // Build rendered history entries
  const historyEntries = useMemo<HistoryEntryRendered[]>(() => {
    if (!historyData) return [];
    const archives = Array.isArray(historyData.archives) ? historyData.archives : [];
    const seenKeys = new Map<string, number>();
    return archives.map((entry) => {
      const archivedAt = entry.archived_at ?? 'no-archived-at';
      const origAt = entry.original_generated_at ?? 'no-original-generated-at';
      const baseKey = `macro-briefing-history|${archivedAt}|${origAt}`;
      const occurrence = seenKeys.get(baseKey) ?? 0;
      seenKeys.set(baseKey, occurrence + 1);
      const uniqueKey = occurrence > 0 ? `${baseKey}|${occurrence}` : baseKey;

      const evidenceCount =
        typeof entry.evidence_links_count === 'number'
          ? entry.evidence_links_count
          : Array.isArray(entry.evidence_links)
          ? entry.evidence_links.length
          : 0;

      return {
        key: uniqueKey,
        stamp: formatStamp(entry.archived_at),
        window: entry.time_window_days ?? 7,
        evidenceCount,
        summary: entry.summary_paragraph ?? '（无摘要）',
      };
    });
  }, [historyData]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Card data-testid="alt-data-macro-briefing-tile">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: title + meta */}
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">另类数据宏观日报</CardTitle>
              <Badge variant="outline" className="text-xs">
                窗口 {data?.time_window_days ?? 7} 天
              </Badge>
              <span className="text-xs text-muted-foreground">生成于 {generatedLabel}</span>
            </div>
            {/* Right: actions */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={openHistory}
                data-testid="macro-briefing-history-button"
              >
                <History className="size-3.5" />
                查看本周历史
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={handleRefresh}
                disabled={loading || deltaLoading}
                data-testid="macro-briefing-refresh"
              >
                <RefreshCw className="size-3.5" />
                刷新
              </Button>
              <a
                href={auditDocUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                审计文档
              </a>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="mt-2 flex gap-1" role="tablist">
            {(['today', 'delta'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  activeTab === tab
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
                data-testid={tab === 'today' ? 'macro-briefing-tab-today' : 'macro-briefing-tab-delta'}
              >
                {tab === 'today' ? '今日' : 'vs 昨日'}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {/* Error banner */}
          {error ? (
            <Alert variant="destructive" className="mb-4" data-testid="macro-briefing-error">
              <AlertCircle className="size-4" />
              <AlertTitle>加载宏观日报失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Loading state */}
          {loading && !data ? (
            <div
              className="flex min-h-[80px] items-center justify-center text-sm text-muted-foreground"
              data-testid="macro-briefing-spinner"
            >
              加载中…
            </div>
          ) : null}

          {/* Content: today or delta */}
          {!loading && data && activeTab === 'today' ? (
            <TodayPane data={data} />
          ) : null}

          {activeTab === 'delta' ? (
            <DeltaPane
              delta={delta}
              loading={deltaLoading}
              error={deltaError}
              onRetry={() => void fetchDelta()}
            />
          ) : null}

          {/* Machine-readable section label map */}
          <span
            hidden
            data-testid="macro-briefing-section-label-map"
          >
            {JSON.stringify(SECTION_LABEL_BY_KEY)}
          </span>
        </CardContent>
      </Card>

      {/* History slide-in panel */}
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
