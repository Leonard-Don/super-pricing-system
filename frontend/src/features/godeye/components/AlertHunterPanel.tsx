// ---------------------------------------------------------------------------
// AlertHunterPanel — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/AlertHunterPanel.js (59)
// Props: hunterAlerts (from buildHunterModel). No API calls.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';
import type { HunterAlert } from '@/features/godeye/lib/taskIntelligenceViewModels';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SEVERITY_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** Map severity string to shadcn Badge variant */
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

/** Determine whether the action has a navigable target (i.e., not 'observe'). */
const isNavigable = (action: unknown): boolean => {
  if (!action) return false;
  if (typeof action === 'object') {
    const target = (action as Record<string, unknown>).target;
    return typeof target === 'string' && target !== 'observe';
  }
  return false;
};

/** Extract the action button label from the action payload. */
const getActionLabel = (action: unknown): string => {
  if (!action || typeof action !== 'object') return '查看';
  const label = (action as Record<string, unknown>).label;
  return typeof label === 'string' && label ? label : '查看';
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AlertHunterPanelProps {
  hunterAlerts: HunterAlert[];
  onNavigate: (action: unknown) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertHunterPanel({ hunterAlerts, onNavigate }: AlertHunterPanelProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-foreground">异常猎手</CardTitle>
        <Badge variant="secondary">{hunterAlerts.length} 条候选</Badge>
      </CardHeader>

      <CardContent className="min-h-[320px]">
        {hunterAlerts.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">暂无需要猎杀的异常</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {hunterAlerts.map((item) => (
              <li key={item.key} className="flex items-start justify-between gap-3 py-3">
                {/* Left: title + severity badge + description */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">
                      {localizeGodEyeText(item.title)}
                    </span>
                    <Badge variant={severityVariant(item.severity)}>
                      {SEVERITY_LABEL[item.severity] ?? item.severity}
                    </Badge>
                  </div>
                  {item.description ? (
                    <p className="text-muted-foreground text-xs leading-snug">
                      {localizeGodEyeText(item.description)}
                    </p>
                  ) : null}
                </div>

                {/* Right: action */}
                <div className="shrink-0 pt-0.5">
                  {isNavigable(item.action) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onNavigate(item.action)}
                    >
                      {getActionLabel(item.action)}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">继续观察</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default AlertHunterPanel;
