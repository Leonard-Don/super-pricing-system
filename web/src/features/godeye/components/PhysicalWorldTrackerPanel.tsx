// ---------------------------------------------------------------------------
// PhysicalWorldTrackerPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/PhysicalWorldTrackerPanel.js (114)
// Props: snapshot (from hook's snapshot, contains signals.macro_hf). No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ReadingEntry {
  freshness?: string;
  source_mode?: string;
  source_mode_zh?: string;
  fallback_reason?: string;
}

interface DimensionEntry {
  score?: number;
  summary?: string;
}

interface MacroHfSignal {
  dimensions?: {
    trade?: DimensionEntry;
    inventory?: DimensionEntry;
    logistics?: DimensionEntry;
  };
  latest_readings?: {
    customs_data?: ReadingEntry;
    trade?: ReadingEntry;
    lme_inventory?: ReadingEntry;
    inventory?: ReadingEntry;
    port_congestion?: ReadingEntry;
    logistics?: ReadingEntry;
  };
  summary?: string;
}

interface SnapshotSignals {
  macro_hf?: MacroHfSignal;
}

interface PhysicalSnapshot {
  signals?: SnapshotSignals;
}

export interface PhysicalWorldTrackerPanelProps {
  snapshot?: PhysicalSnapshot;
}

// ---------------------------------------------------------------------------
// Helpers (ported from reference)
// ---------------------------------------------------------------------------

// Tile-local labels take precedence; shared SOURCE_MODE_LABELS_ZH serves as fallback.
const MODE_LABELS: Record<string, string> = {
  official: '官方',
  market: '市场',
  proxy: '代理',
  curated: '人工回退',
  derived: '派生',
};

// SOURCE_MODE_LABELS_ZH fallback (ported from frontend/src/utils/altDataLabels.js)
const SOURCE_MODE_LABELS_ZH: Record<string, string> = {
  public_disclosure: '公开披露',
  regulated_data: '授权数据',
  scraped: '抓取数据',
  curated: '策展数据',
  live: '实时数据',
  proxy: '代理数据',
  official: '官方',
  market: '市场',
  derived: '派生',
};

interface PhysicalCard {
  key: string;
  title: string;
  score: number;
  freshness: string;
  sourceMode: string;
  source_mode_zh?: string;
  fallbackReason: string;
  summary: string;
}

function resolveSourceMode(item: PhysicalCard): string {
  // Prefer source_mode_zh if already resolved
  if (item.source_mode_zh) return item.source_mode_zh;
  const raw = item.sourceMode;
  if (!raw) return '';
  return MODE_LABELS[raw] ?? SOURCE_MODE_LABELS_ZH[raw] ?? raw;
}

function buildPhysicalCards(snapshot: PhysicalSnapshot = {}): PhysicalCard[] {
  const macro = snapshot?.signals?.macro_hf ?? {};
  const dimensions = macro?.dimensions ?? {};
  const latest = macro?.latest_readings ?? {};

  return [
    {
      key: 'trade',
      title: '海关 / 贸易脉冲',
      score: Number(dimensions?.trade?.score ?? 0),
      freshness: latest?.customs_data?.freshness ?? latest?.trade?.freshness ?? '',
      sourceMode: latest?.customs_data?.source_mode ?? latest?.trade?.source_mode ?? '',
      source_mode_zh: latest?.customs_data?.source_mode_zh ?? latest?.trade?.source_mode_zh,
      fallbackReason:
        latest?.customs_data?.fallback_reason ?? latest?.trade?.fallback_reason ?? '',
      summary: dimensions?.trade?.summary ?? macro?.summary ?? '',
    },
    {
      key: 'inventory',
      title: 'LME / 库存压力',
      score: Number(dimensions?.inventory?.score ?? 0),
      freshness: latest?.lme_inventory?.freshness ?? latest?.inventory?.freshness ?? '',
      sourceMode: latest?.lme_inventory?.source_mode ?? latest?.inventory?.source_mode ?? '',
      source_mode_zh:
        latest?.lme_inventory?.source_mode_zh ?? latest?.inventory?.source_mode_zh,
      fallbackReason:
        latest?.lme_inventory?.fallback_reason ?? latest?.inventory?.fallback_reason ?? '',
      summary: dimensions?.inventory?.summary ?? macro?.summary ?? '',
    },
    {
      key: 'logistics',
      title: '港口 / 物流摩擦',
      score: Number(dimensions?.logistics?.score ?? 0),
      freshness: latest?.port_congestion?.freshness ?? latest?.logistics?.freshness ?? '',
      sourceMode:
        latest?.port_congestion?.source_mode ?? latest?.logistics?.source_mode ?? '',
      source_mode_zh:
        latest?.port_congestion?.source_mode_zh ?? latest?.logistics?.source_mode_zh,
      fallbackReason:
        latest?.port_congestion?.fallback_reason ?? latest?.logistics?.fallback_reason ?? '',
      summary: dimensions?.logistics?.summary ?? macro?.summary ?? '',
    },
  ];
}

/** Map numeric score to shadcn badge variant */
const scoreVariant = (score: number): 'destructive' | 'secondary' | 'outline' => {
  if (score >= 0.55) return 'destructive';
  if (score >= 0.25) return 'secondary';
  return 'outline';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhysicalWorldTrackerPanel({ snapshot = {} }: PhysicalWorldTrackerPanelProps) {
  const cards = buildPhysicalCards(snapshot);
  const hasSignal = cards.some((item) => item.score || item.summary || item.sourceMode);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground">实体世界追踪</CardTitle>
      </CardHeader>

      <CardContent className="min-h-[280px]">
        {!hasSignal ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            暂无物理世界高频数据
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-border bg-card p-3"
              >
                {/* Header: title + score + source + freshness */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-semibold text-foreground text-sm">{item.title}</span>
                  <Badge variant={scoreVariant(item.score)}>
                    评分 {item.score.toFixed(2)}
                  </Badge>
                  {item.sourceMode ? (
                    <Badge variant="outline">{resolveSourceMode(item)}</Badge>
                  ) : null}
                  {item.freshness ? (
                    <Badge variant="outline">{item.freshness}</Badge>
                  ) : null}
                </div>

                {item.summary ? (
                  <p className="text-foreground text-sm mb-1">{item.summary}</p>
                ) : null}

                {item.fallbackReason ? (
                  <p className="text-muted-foreground text-xs">
                    回退原因：{item.fallbackReason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PhysicalWorldTrackerPanel;
