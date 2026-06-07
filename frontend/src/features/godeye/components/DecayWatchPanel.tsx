// ---------------------------------------------------------------------------
// DecayWatchPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/DecayWatchPanel.js (109)
// Props: items = DecayWatchItem[] from buildDecayWatchModel. No API calls.
// NOTE: "保存到工作台" CTA is DEFERRED to P3 — button renders but handler is a no-op.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DecayWatchItem } from '@/features/godeye/lib/taskIntelligenceViewModels';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map actionLabel to badge variant */
const actionVariant = (
  actionLabel: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (actionLabel) {
    case 'structural_short':
      return 'destructive';
    case 'structural_avoid':
      return 'destructive';
    case 'watch':
      return 'secondary';
    case 'stable':
      return 'default';
    default:
      return 'outline';
  }
};

/** Progress bar color class based on score */
const barColorClass = (score: number): string => {
  if (score >= 0.72) return 'bg-destructive';
  if (score >= 0.5) return 'bg-yellow-500';
  return 'bg-primary';
};

/** Badge variant for refreshLabel based on score */
const refreshVariant = (
  score: number,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  if (score >= 0.72) return 'destructive';
  if (score >= 0.5) return 'secondary';
  return 'outline';
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

export interface DecayWatchPanelProps {
  items: DecayWatchItem[];
  onNavigate: (action: unknown) => void;
  /** Opens the cross-market draft dialog (passed through, no-op if not wired) */
  onOpenDraft: (item: DecayWatchItem) => void;
  /** Saves item to workbench — DEFERRED to P3, no-op in this release */
  onSaveTask: (item: DecayWatchItem) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DecayWatchPanel({
  items,
  onNavigate,
  onOpenDraft,
}: DecayWatchPanelProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground">结构衰败观察</CardTitle>
      </CardHeader>

      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            当前还没有进入结构性衰败观察名单的标的
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const scorePercent = Math.round(Number(item.score ?? 0) * 100);
              const thesis = item.macroMispricingThesis as Record<string, unknown>;
              const primaryLeg = thesis?.primary_leg as Record<string, unknown> | undefined;
              const hedgeLeg = thesis?.hedge_leg as Record<string, unknown> | undefined;
              const tradeLegs = (thesis?.trade_legs as Array<Record<string, unknown>>) ?? [];

              return (
                <div
                  key={item.key}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3"
                >
                  {/* Header row: symbol + tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground text-sm">
                      {item.symbol || item.title}
                    </span>
                    <Badge variant={actionVariant(item.actionLabel)}>{item.label}</Badge>
                    {item.peopleRisk && (
                      <Badge variant="outline" className="text-xs">
                        人事风险 {item.peopleRisk}
                      </Badge>
                    )}
                    {item.primaryView && (
                      <Badge variant="outline" className="text-xs">
                        定价结论 {item.primaryView}
                      </Badge>
                    )}
                    {thesis?.stance ? (
                      <Badge variant="outline" className="text-xs">
                        {thesis.stance as string}
                      </Badge>
                    ) : null}
                    <Badge variant={refreshVariant(item.score)} className="text-xs">
                      {item.refreshLabel}
                    </Badge>
                  </div>

                  {/* Score gauge */}
                  <div className="flex flex-col gap-1">
                    <ProgressBar value={scorePercent} colorClass={barColorClass(item.score)} />
                    <span className="text-xs text-muted-foreground text-right">{scorePercent}%</span>
                  </div>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-muted-foreground text-xs leading-snug">{item.summary}</p>
                  )}

                  {/* Dominant failure mode */}
                  {item.dominantFailureLabel && (
                    <p className="text-muted-foreground text-xs leading-snug">
                      主导失效模式：{item.dominantFailureLabel}
                    </p>
                  )}

                  {/* Trade expression */}
                  {primaryLeg?.symbol ? (
                    <p className="text-muted-foreground text-xs leading-snug">
                      交易表达：{primaryLeg.symbol as string} {primaryLeg.side as string}
                      {hedgeLeg?.symbol
                        ? ` / ${hedgeLeg.symbol as string} ${hedgeLeg.side as string}`
                        : ''}
                    </p>
                  ) : null}

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

                  {/* Evidence tags */}
                  {(item.evidence ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(item.evidence as string[]).slice(0, 3).map((ev) => (
                        <Badge key={ev} variant="outline" className="text-xs">
                          {ev}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {item.action != null && (
                      <Button
                        size="sm"
                        variant="link"
                        className="px-0 h-auto text-xs"
                        onClick={() => onNavigate(item.action)}
                      >
                        {String((item.action as Record<string, unknown>).label ?? '打开任务')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenDraft(item)}
                    >
                      打开跨市场草案
                    </Button>
                    {!item.macroTaskId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // TODO (P3): wire to createResearchTask
                        }}
                      >
                        保存到工作台
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DecayWatchPanel;
