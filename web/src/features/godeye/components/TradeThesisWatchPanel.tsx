// ---------------------------------------------------------------------------
// TradeThesisWatchPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/TradeThesisWatchPanel.js (98)
// Props: items = TradeThesisWatchItem[] from buildTradeThesisWatchModel. No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TradeThesisWatchItem } from '@/features/godeye/lib/taskIntelligenceViewModels';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map refreshSeverity to badge variant */
const severityVariant = (
  severity: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (severity) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'secondary';
    default:
      return 'outline';
  }
};

/** Progress bar color class based on refreshSeverity */
const barColorClass = (severity: string): string => {
  switch (severity) {
    case 'high':
      return 'bg-destructive';
    case 'medium':
      return 'bg-yellow-500';
    default:
      return 'bg-primary';
  }
};

/** Action label from action payload */
const getActionLabel = (action: unknown): string => {
  if (!action || typeof action !== 'object') return '打开交易假设';
  const label = (action as Record<string, unknown>).label;
  return typeof label === 'string' && label ? label : '打开交易假设';
};

/** Inline progress bar rendered with Tailwind divs */
function ProgressBar({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TradeThesisWatchPanelProps {
  items: TradeThesisWatchItem[];
  onNavigate: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TradeThesisWatchPanel({ items, onNavigate }: TradeThesisWatchPanelProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground">交易假设漂移观察</CardTitle>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            当前还没有进入独立观察区的交易假设
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const scorePercent = Math.round(Number(item.score ?? 0) * 100);
              const tradeLegs = (item.tradeLegs as Array<Record<string, unknown>>) ?? [];

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3"
                >
                  {/* Header row: symbol + stance/horizon/refresh tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground text-sm">
                      {item.symbol || item.title}
                    </span>
                    {item.stance && (
                      <Badge variant="secondary" className="text-xs">
                        {item.stance}
                      </Badge>
                    )}
                    {item.horizon && (
                      <Badge variant="outline" className="text-xs">
                        {item.horizon}
                      </Badge>
                    )}
                    <Badge variant={severityVariant(item.refreshSeverity)} className="text-xs">
                      {item.refreshLabel}
                    </Badge>
                  </div>

                  {/* Score gauge */}
                  <div className="flex flex-col gap-1">
                    <ProgressBar value={scorePercent} colorClass={barColorClass(item.refreshSeverity)} />
                    <span className="text-xs text-muted-foreground text-right">{scorePercent}%</span>
                  </div>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-muted-foreground text-xs leading-snug">{item.summary}</p>
                  )}

                  {/* Lead leg */}
                  {item.leadLeg && (
                    <p className="text-muted-foreground text-xs leading-snug">
                      主表达腿：{item.leadLeg}
                    </p>
                  )}

                  {/* Trade legs */}
                  {tradeLegs.length > 0 && (
                    <p className="text-muted-foreground text-xs leading-snug">
                      组合腿：
                      {tradeLegs
                        .slice(0, 3)
                        .map((leg) => `${leg.symbol as string} ${leg.side as string}`)
                        .join(' / ')}
                    </p>
                  )}

                  {/* Drift lead */}
                  {item.driftLead && (
                    <p className="text-foreground text-xs leading-snug">
                      漂移提示：{item.driftLead}
                    </p>
                  )}

                  {/* Drift evidence */}
                  {item.driftEvidence && (
                    <p className="text-muted-foreground text-xs leading-snug">
                      变化证据：{item.driftEvidence}
                    </p>
                  )}

                  {/* CTA */}
                  <Button
                    size="sm"
                    variant="link"
                    className="px-0 h-auto text-xs self-start"
                    onClick={() => onNavigate(item.action)}
                  >
                    {getActionLabel(item.action)}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TradeThesisWatchPanel;
