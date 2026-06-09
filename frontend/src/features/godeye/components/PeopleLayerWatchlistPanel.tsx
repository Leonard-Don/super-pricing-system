// ---------------------------------------------------------------------------
// PeopleLayerWatchlistPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/PeopleLayerWatchlistPanel.js (102)
// Props: overview (from hook's overview, contains people_layer_summary). No API calls.
// NOTE: distinct from PeopleLayerPanel in MacroSummaryPanels.tsx (the macro-summary variant).
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getGodEyeStatusLabel,
  localizeGodEyeText,
} from '@/features/godeye/lib/displayLabels';
import { peopleLayerColor } from '@/features/godeye/lib/macroFactorColors';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PricingAction {
  target: 'pricing';
  symbol: string;
  source: string;
  note: string;
}

interface CrossMarketAction {
  target: 'cross-market';
  template: string;
  source: string;
  note: string;
}

type NavigateAction = PricingAction | CrossMarketAction;

interface WatchlistItem {
  symbol?: string;
  company_name?: string;
  risk_level?: string;
  stance?: string;
  people_fragility_score?: number;
  people_quality_score?: number;
  source_modes?: string[] | string | Record<string, string>;
  summary?: string;
}

interface PeopleLayerSummary {
  label?: string;
  summary?: string;
  watchlist?: WatchlistItem[];
}

interface PeopleLayerOverview {
  people_layer_summary?: PeopleLayerSummary;
}

export interface PeopleLayerWatchlistPanelProps {
  overview?: PeopleLayerOverview;
  onNavigate?: (action: NavigateAction) => void;
}

// ---------------------------------------------------------------------------
// Helpers (ported from reference)
// ---------------------------------------------------------------------------

function normalizeSourceModes(
  value: string[] | string | Record<string, string> | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value).filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
  }
  return [];
}

function buildPricingAction(item: WatchlistItem): PricingAction {
  return {
    target: 'pricing',
    symbol: item?.symbol ?? '',
    source: 'godeye_people_watchlist',
    note: item?.summary ?? '来自 GodEye 人的维度观察名单',
  };
}

function buildCrossMarketAction(item: WatchlistItem): CrossMarketAction {
  return {
    target: 'cross-market',
    template:
      item?.risk_level === 'high'
        ? 'people_decay_short_vs_cashflow_defensive'
        : 'defensive_beta_hedge',
    source: 'godeye_people_watchlist',
    note: item?.summary ?? '来自 GodEye 人的维度观察名单',
  };
}

/** Map antd color-token to shadcn badge variant */
const colorToVariant = (color: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
  switch (color) {
    case 'red':
    case 'volcano':
      return 'destructive';
    case 'green':
      return 'outline';
    default:
      return 'secondary';
  }
};

/** risk_level → badge variant */
const riskVariant = (level?: string): 'destructive' | 'secondary' | 'outline' => {
  if (level === 'high') return 'destructive';
  if (level === 'medium') return 'secondary';
  return 'outline';
};

/** stance → badge variant */
const stanceVariant = (stance?: string): 'destructive' | 'secondary' | 'outline' => {
  if (stance === 'fragile') return 'destructive';
  if (stance === 'supportive') return 'outline';
  return 'secondary';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PeopleLayerWatchlistPanel({
  overview = {},
  onNavigate,
}: PeopleLayerWatchlistPanelProps) {
  const summary = overview?.people_layer_summary ?? {};
  const watchlist = summary?.watchlist ?? [];
  const overallLabel = summary?.label ?? '';
  const overallColor = peopleLayerColor[overallLabel] ?? 'blue';

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-foreground">人的维度观察名单</CardTitle>
          {/* Bug B fix: prominent curated honesty badge on watchlist panel */}
          <Badge
            variant="secondary"
            className="text-xs font-semibold border border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            data-testid="people-watchlist-curated-badge"
          >
            示意数据 · CURATED
          </Badge>
        </div>
        {overallLabel ? (
          <Badge variant={colorToVariant(overallColor)}>
            {getGodEyeStatusLabel('peopleLayer', overallLabel)}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-[280px]">
        {summary?.summary ? (
          <p className="text-muted-foreground text-sm mb-3">
            {localizeGodEyeText(summary.summary)}
          </p>
        ) : null}

        {watchlist.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            暂无人的维度观察名单
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {watchlist.slice(0, 5).map((item, idx) => {
              const sourceModes = normalizeSourceModes(item?.source_modes);
              return (
                <li key={item?.symbol ?? idx} className="py-3 flex flex-col gap-1">
                  {/* Title row: symbol + company + risk + stance */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">
                      {item?.symbol ?? '-'}
                    </span>
                    {item?.company_name ? (
                      <span className="text-muted-foreground text-xs">{item.company_name}</span>
                    ) : null}
                    <Badge variant={riskVariant(item?.risk_level)}>
                      风险 {item?.risk_level ?? 'unknown'}
                    </Badge>
                    <Badge variant={stanceVariant(item?.stance)}>
                      {item?.stance ?? 'balanced'}
                    </Badge>
                  </div>

                  {/* Scores + source */}
                  <div className="text-muted-foreground text-xs">
                    脆弱度 {Number(item?.people_fragility_score ?? 0).toFixed(2)}
                    {' · '}
                    质量 {Number(item?.people_quality_score ?? 0).toFixed(2)}
                  </div>
                  {sourceModes.length ? (
                    <div className="text-muted-foreground text-xs">
                      来源 {sourceModes.join(' / ')}
                    </div>
                  ) : null}
                  {item?.summary ? (
                    <div className="text-foreground text-xs">{item.summary}</div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex gap-2 mt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate?.(buildPricingAction(item))}
                    >
                      定价
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate?.(buildCrossMarketAction(item))}
                    >
                      跨市场
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default PeopleLayerWatchlistPanel;
