// ---------------------------------------------------------------------------
// StructuralDecayRadarPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/StructuralDecayRadarPanel.js (111)
// Props: model from overview.structural_decay_radar shape. No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DecayAxis {
  key: string;
  label: string;
  score: number | string;
  status: string;
  summary?: string;
}

interface TopSignal {
  key: string;
  label: string;
  score: number | string;
}

interface StructuralDecayRadarModel {
  score?: number | string;
  label?: string;
  display_label?: string;
  action_hint?: string;
  axes?: DecayAxis[];
  top_signals?: TopSignal[];
}

export interface StructuralDecayRadarPanelProps {
  model?: StructuralDecayRadarModel;
  onNavigate?: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map label string to shadcn Badge variant */
const labelVariant = (label: string): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (label) {
    case 'decay_alert':
      return 'destructive';
    case 'decay_watch':
      return 'secondary';
    case 'stable':
      return 'default';
    default:
      return 'outline';
  }
};

/** Bar track color class based on score */
const barColorClass = (score: number): string => {
  if (score >= 0.68) return 'bg-destructive';
  if (score >= 0.44) return 'bg-yellow-500';
  return 'bg-primary';
};

/** Per-axis bar color class */
const axisBarColorClass = (status: string): string => {
  switch (status) {
    case 'critical':
      return 'bg-destructive';
    case 'watch':
      return 'bg-yellow-500';
    default:
      return 'bg-primary';
  }
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
// Component
// ---------------------------------------------------------------------------

export function StructuralDecayRadarPanel({ model = {}, onNavigate }: StructuralDecayRadarPanelProps) {
  const axes = model?.axes ?? [];

  if (!axes.length) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground">结构衰败雷达</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm py-8 text-center">暂缺结构衰败雷达数据</p>
        </CardContent>
      </Card>
    );
  }

  const score = Number(model.score ?? 0);
  const scorePercent = Math.round(score * 100);
  const actionNote = model.action_hint ?? '来自结构衰败雷达的系统级观察。';
  const actionHintLabel = localizeGodEyeText(model.action_hint ?? '');
  const displayLabel = model.display_label ?? model.label ?? '';
  const label = model.label ?? '';

  const handleDefensive = () => {
    onNavigate?.({
      target: 'cross-market',
      template: 'defensive_beta_hedge',
      source: 'decay_radar',
      note: actionNote,
    });
  };

  const handleDecayTasks = () => {
    onNavigate?.({
      target: 'workbench',
      refresh: 'high',
      type: 'macro_mispricing',
      reason: 'structural_decay',
      source: 'decay_radar',
      note: actionNote,
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-foreground">结构衰败雷达</CardTitle>
        {displayLabel && (
          <Badge variant={labelVariant(label)}>{displayLabel}</Badge>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* Overall score gauge */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">综合衰败分</span>
            <span className="text-sm font-semibold text-foreground">{scorePercent}%</span>
          </div>
          <ProgressBar value={scorePercent} colorClass={barColorClass(score)} />
        </div>

        {/* Action hint */}
        {actionHintLabel && (
          <p className="text-muted-foreground text-xs leading-snug">{actionHintLabel}</p>
        )}

        {/* Per-axis breakdown */}
        <div className="flex flex-col gap-3">
          {axes.map((axis) => {
            const axisPercent = Math.round(Number(axis.score ?? 0) * 100);
            return (
              <div key={axis.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{axis.label}</span>
                  <span className="text-xs text-muted-foreground">{axisPercent}%</span>
                </div>
                <ProgressBar value={axisPercent} colorClass={axisBarColorClass(axis.status)} />
                {axis.status !== 'stable' && axis.summary ? (
                  <p className="text-xs text-muted-foreground leading-snug">
                    {localizeGodEyeText(axis.summary)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Top signals */}
        {(model.top_signals?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(model.top_signals ?? []).slice(0, 3).map((signal) => (
              <Badge key={signal.key} variant="outline" className="text-xs">
                {signal.label} {Math.round(Number(signal.score ?? 0) * 100)}%
              </Badge>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant={label === 'decay_alert' ? 'default' : 'secondary'}
            onClick={handleDefensive}
          >
            查看防御方案
          </Button>
          <Button size="sm" variant="secondary" onClick={handleDecayTasks}>
            查看衰败任务
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default StructuralDecayRadarPanel;
