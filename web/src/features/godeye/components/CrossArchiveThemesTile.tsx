// ---------------------------------------------------------------------------
// CrossArchiveThemesTile — self-fetching cross-archive long-term thematic signals
// Rebuilt from frontend/src/components/GodEyeDashboard/CrossArchiveThemesTile.jsx (322)
// Self-fetches getAltDataCrossArchiveThemes(); manages own loading/error/data state.
// No antd — shadcn/Tailwind only. Types: no `any`.
// ---------------------------------------------------------------------------

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAltDataCrossArchiveThemes } from '@/services/api/altDataAndMacro';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThemeRow {
  industry?: string;
  conviction?: string;
  trend_direction?: string;
  days_in_narrative?: number;
  days_in_composite?: number;
  days_in_macro_briefing?: number;
  supporting_archives?: string[];
  supporting_archives_zh?: string[];
}

interface TierSummary {
  high?: number;
  medium?: number;
  low?: number;
}

interface CrossArchivePayload {
  themes?: ThemeRow[];
  tier_summary?: TierSummary;
  generated_at?: string;
  audit_doc_url?: string;
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

const DIRECTION_CLASS: Record<string, string> = {
  bullish: 'border-green-500 text-green-400 bg-green-500/10',
  bearish: 'border-destructive text-destructive bg-destructive/10',
  mixed: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  neutral: 'border-border text-muted-foreground',
};

const DIRECTION_LABEL: Record<string, string> = {
  bullish: '看多',
  bearish: '看空',
  mixed: '多空互现',
  neutral: '方向中性',
};

const ARCHIVE_LABEL: Record<string, string> = {
  narrative: '叙事归档',
  composite: '复合信号归档',
  composite_signal: '复合信号归档',
  macro_briefing: '宏观日报归档',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ThemeRowItemProps {
  theme: ThemeRow;
  index: number;
}

function ThemeRowItem({ theme, index }: ThemeRowItemProps) {
  const conviction = theme.conviction ?? 'low';
  const direction = theme.trend_direction ?? 'neutral';

  // Prefer supporting_archives_zh if provided, else raw with ARCHIVE_LABEL lookup
  const archives: string[] = Array.isArray(theme.supporting_archives_zh)
    ? theme.supporting_archives_zh
    : Array.isArray(theme.supporting_archives)
      ? theme.supporting_archives.map((a) => ARCHIVE_LABEL[a] ?? a)
      : [];

  const totalDays =
    Number(theme.days_in_narrative ?? 0) +
    Number(theme.days_in_composite ?? 0) +
    Number(theme.days_in_macro_briefing ?? 0);

  const convictionCls = CONVICTION_CLASS[conviction] ?? 'border-border text-foreground';
  const directionCls = DIRECTION_CLASS[direction] ?? 'border-border text-foreground';

  return (
    <div
      data-testid={`cross-archive-theme-row-${index}`}
      className="py-2.5 border-b border-border/30 last:border-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground text-base">
          {theme.industry ?? '—'}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${convictionCls}`}
          data-testid={`cross-archive-conviction-${conviction}`}
        >
          {CONVICTION_STARS[conviction] ?? '★'} {String(conviction).toUpperCase()}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${directionCls}`}
        >
          {DIRECTION_LABEL[direction] ?? direction}
        </span>
        <span className="text-xs text-muted-foreground">综合可见 {totalDays} 天</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          data-testid={`cross-archive-days-narrative-${index}`}
        >
          叙事 {theme.days_in_narrative ?? 0} 天
        </span>
        <span
          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          data-testid={`cross-archive-days-composite-${index}`}
        >
          复合 {theme.days_in_composite ?? 0} 天
        </span>
        <span
          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          data-testid={`cross-archive-days-macro-${index}`}
        >
          日报 {theme.days_in_macro_briefing ?? 0} 天
        </span>
      </div>

      {archives.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          来源：{archives.join(' · ')}
        </div>
      )}
    </div>
  );
}

interface ThemeSectionProps {
  title: string;
  themes: ThemeRow[];
  baseIndex: number;
  testId: string;
  titleCls?: string;
}

function ThemeSection({ title, themes, baseIndex, testId, titleCls = '' }: ThemeSectionProps) {
  if (themes.length === 0) return null;
  return (
    <div className="mb-4" data-testid={testId}>
      <p className={`text-sm font-semibold mb-1 ${titleCls}`}>{title}</p>
      {themes.map((theme, idx) => (
        <ThemeRowItem key={theme.industry ?? idx} theme={theme} index={baseIndex + idx} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CrossArchiveThemesTile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CrossArchivePayload | null>(null);

  const fetchThemes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getAltDataCrossArchiveThemes({
        days_window: 14,
        min_conviction: 'low',
      });
      setData((payload as CrossArchivePayload) ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载跨归档主题失败';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void fetchThemes();
    });
  }, [fetchThemes]);

  const auditDocUrl = data?.audit_doc_url ?? 'docs/alt_data_audit.md';
  const tierSummary = data?.tier_summary ?? null;

  const { highThemes, mediumThemes, lowThemes } = useMemo(() => {
    if (!data) return { highThemes: [], mediumThemes: [], lowThemes: [] };
    const list = Array.isArray(data.themes) ? data.themes : [];
    return {
      highThemes: list.filter((t) => t.conviction === 'high').slice(0, 5),
      mediumThemes: list.filter((t) => t.conviction === 'medium').slice(0, 5),
      lowThemes: list.filter((t) => t.conviction === 'low').slice(0, 5),
    };
  }, [data]);

  const hasContent =
    highThemes.length > 0 || mediumThemes.length > 0 || lowThemes.length > 0;

  return (
    <Card className="bg-card border-border" data-testid="cross-archive-themes-tile">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">跨归档高置信叙事</CardTitle>
            {tierSummary && (
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-full border border-green-500 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400"
                  data-testid="cross-archive-tier-high"
                >
                  HIGH {tierSummary.high ?? 0}
                </span>
                <span
                  className="inline-flex items-center rounded-full border border-yellow-500 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400"
                  data-testid="cross-archive-tier-medium"
                >
                  MED {tierSummary.medium ?? 0}
                </span>
                <span
                  className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  data-testid="cross-archive-tier-low"
                >
                  LOW {tierSummary.low ?? 0}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchThemes()}
              disabled={loading}
              data-testid="cross-archive-themes-refresh"
            >
              <RefreshCw className={`mr-1 size-3 ${loading ? 'animate-spin' : ''}`} />
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
      </CardHeader>

      <CardContent className="pt-2">
        {error && (
          <Alert variant="destructive" data-testid="cross-archive-themes-error">
            <AlertCircle className="size-4" />
            <AlertTitle>加载跨归档主题失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !data && (
          <div
            className="flex items-center justify-center py-6 text-muted-foreground text-sm"
            data-testid="cross-archive-themes-spinner"
          >
            加载中…
          </div>
        )}

        {!loading && !error && !hasContent && (
          <div
            className="flex min-h-[120px] items-center justify-center text-muted-foreground text-sm"
            data-testid="cross-archive-themes-empty"
          >
            当前 3 个归档暂未在多档共振出长期叙事
          </div>
        )}

        {hasContent && (
          <>
            <ThemeSection
              title="高置信（HIGH · 3 档共振）"
              themes={highThemes}
              baseIndex={0}
              testId="cross-archive-themes-section-high"
              titleCls="text-green-400"
            />
            <ThemeSection
              title="中等（MEDIUM · 2 档共振）"
              themes={mediumThemes}
              baseIndex={highThemes.length}
              testId="cross-archive-themes-section-medium"
              titleCls="text-yellow-400"
            />
            <ThemeSection
              title="单档持续（LOW · 仅 1 档但 ≥5 天）"
              themes={lowThemes}
              baseIndex={highThemes.length + mediumThemes.length}
              testId="cross-archive-themes-section-low"
              titleCls="text-muted-foreground"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
