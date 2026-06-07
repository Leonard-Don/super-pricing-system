// ---------------------------------------------------------------------------
// PolicyTimelineBar — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/PolicyTimelineBar.js (94)
// Props: timelineItems (from buildTimelineModel). No API calls.
// Navigation CTAs use navigateDashboardAction (URL routing).
// P3 coupling: workbench-save CTA left as TODO (P3).
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { navigateDashboardAction } from '@/features/godeye/lib/navigationHelpers';
import type { TimelineItem } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const directionVariant = (direction: string): 'outline' | 'destructive' | 'secondary' => {
  switch (direction) {
    case 'stimulus':
      return 'outline';   // green-ish in shadcn default
    case 'tightening':
      return 'destructive';
    default:
      return 'secondary';
  }
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PolicyTimelineBarProps {
  timelineItems?: TimelineItem[];
  onNavigate?: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PolicyTimelineBar({ timelineItems = [], onNavigate }: PolicyTimelineBarProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const activeItem = useMemo<TimelineItem | undefined>(
    () => timelineItems.find((item) => item.key === activeKey) ?? timelineItems[0],
    [timelineItems, activeKey],
  );

  const handleNavigate = (action: unknown) => {
    if (onNavigate) {
      onNavigate(action);
    } else {
      navigateDashboardAction(action as Parameters<typeof navigateDashboardAction>[0]);
    }
  };

  const formatTimestamp = (ts: unknown): string => {
    if (!ts) return '';
    try {
      return new Date(ts as string).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">政策时间轴</CardTitle>
      </CardHeader>

      <CardContent>
        {timelineItems.length ? (
          <div className="flex flex-col gap-4">
            {/* Scrollable list of up to 8 items */}
            <div className="max-h-60 overflow-y-auto pr-1">
              <ol className="relative border-l border-border ml-2">
                {timelineItems.slice(0, 8).map((item, i) => {
                  const isActive = activeItem?.key === item.key;
                  return (
                    <li
                      // Backend timeline ids are not guaranteed unique — append the
                      // index so React keys stay unique even when two events share
                      // the same `item.key` hash. Selection still keys off item.key.
                      key={`${item.key}-${i}`}
                      className="mb-3 ml-4 last:mb-0"
                    >
                      {/* Timeline dot */}
                      <span
                        className={[
                          'absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-border',
                          item.direction === 'stimulus'
                            ? 'bg-green-500'
                            : item.direction === 'tightening'
                              ? 'bg-destructive'
                              : 'bg-muted-foreground',
                        ].join(' ')}
                      />

                      <button
                        type="button"
                        onClick={() => setActiveKey(item.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setActiveKey(item.key);
                        }}
                        className={[
                          'w-full text-left rounded-lg px-2 py-1.5 transition-colors',
                          isActive
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : 'hover:bg-muted/40',
                        ].join(' ')}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant={directionVariant(item.direction)}>
                            {item.directionLabel}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(item.timestamp)}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-foreground">{item.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Detail panel for active item */}
            {activeItem ? (
              <div className="rounded-xl p-4 bg-card border border-border flex flex-col gap-3">
                {/* Meta badges row */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant={directionVariant(activeItem.direction)}>
                    {activeItem.directionLabel}
                  </Badge>
                  <Badge variant="secondary">{activeItem.source}</Badge>
                  <Badge variant="secondary">评分 {activeItem.score.toFixed(2)}</Badge>
                </div>

                {/* Title */}
                <p className="text-sm text-foreground">{activeItem.title}</p>

                {/* Industry tags */}
                <div className="flex flex-wrap gap-1">
                  {activeItem.tags.length ? (
                    activeItem.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">暂无产业标签</span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {activeItem.primaryAction ? (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleNavigate(activeItem.primaryAction)}
                    >
                      {(activeItem.primaryAction as { label?: string }).label}
                    </Button>
                  ) : null}
                  {activeItem.secondaryAction ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleNavigate(activeItem.secondaryAction)}
                    >
                      {(activeItem.secondaryAction as { label?: string }).label}
                    </Button>
                  ) : null}
                  {/* TODO (P3): workbench save CTA — coupled to research-workbench */}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">暂无政策时间轴</div>
        )}
      </CardContent>
    </Card>
  );
}

export default PolicyTimelineBar;
