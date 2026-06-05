// ---------------------------------------------------------------------------
// StructuralDecayCard — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/pricing/PricingInsightCards.js (StructuralDecayCard export)
// Props: data — nested paths follow the old component exactly.
// No API calls. No `any`.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types — narrow; all fields optional (data arrives from API, may be partial)
// ---------------------------------------------------------------------------

interface DecayComponent {
  key: string;
  label: string;
  delta: number;
  status: string;
  detail?: string;
}

export interface StructuralDecayData {
  score?: number | string | null;
  label?: string;
  action?: string;
  summary?: string;
  dominant_failure_label?: string;
  evidence?: string[];
  components?: DecayComponent[];
  reversibility?: string;
  horizon?: string;
}

export interface StructuralDecayCardProps {
  data: StructuralDecayData;
}

// ---------------------------------------------------------------------------
// Constants (mirrors the old component)
// ---------------------------------------------------------------------------

const STRUCTURAL_DECAY_ACTION_LABELS: Record<string, string> = {
  structural_short: '结构性做空',
  structural_avoid: '回避观察',
  watch: '重点观察',
  stable: '稳定跟踪',
};

/** Map action to shadcn Badge variant */
const actionVariant = (action: string): 'destructive' | 'secondary' | 'outline' | 'default' => {
  switch (action) {
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

/** Progress bar color class based on action severity */
const barColorClass = (action: string): string => {
  switch (action) {
    case 'structural_short':
    case 'structural_avoid':
      return 'bg-destructive';
    case 'watch':
      return 'bg-yellow-500';
    case 'stable':
      return 'bg-primary';
    default:
      return 'bg-yellow-500';
  }
};

/** Component delta badge variant */
const deltaVariant = (
  status: string,
): 'destructive' | 'secondary' | 'outline' | 'default' => {
  // old: status === 'negative' → green (good), else red (bad)
  return status === 'negative' ? 'default' : 'destructive';
};

/** Inline progress bar */
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

export function StructuralDecayCard({ data }: StructuralDecayCardProps) {
  if (!data || !Object.keys(data).length) return null;

  const action = data.action ?? '';
  const scoreRaw = Number(data.score ?? 0);
  const scorePercent = Math.round(scoreRaw * 100);
  const evidence = data.evidence ?? [];
  const components = data.components ?? [];

  return (
    <Card data-testid="pricing-structural-decay-card" className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground flex flex-wrap items-center gap-2">
          结构衰败雷达
          {data.label && (
            <Badge variant={actionVariant(action)}>{data.label}</Badge>
          )}
          {action && (
            <Badge variant="outline" className="text-xs font-normal">
              行动 {STRUCTURAL_DECAY_ACTION_LABELS[action] ?? action}
            </Badge>
          )}
          {data.reversibility && (
            <Badge variant="outline" className="text-xs font-normal">
              可逆性 {data.reversibility}
            </Badge>
          )}
          {data.horizon && (
            <Badge variant="outline" className="text-xs font-normal">
              时间维度 {data.horizon}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Summary */}
        {data.summary && (
          <p className="text-sm text-muted-foreground leading-snug">{data.summary}</p>
        )}

        {/* Decay certainty progress bar */}
        {data.score !== undefined && data.score !== null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">衰败确定性</span>
              <span className="text-xs font-semibold text-foreground">{scorePercent}%</span>
            </div>
            <ProgressBar value={scorePercent} colorClass={barColorClass(action)} />
          </div>
        )}

        {/* 2-column grid: dominant failure mode + evidence */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Dominant failure mode */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">主导失效模式</p>
            <p className="mt-2 text-xs text-muted-foreground leading-snug">
              {data.dominant_failure_label || '待确认'}
            </p>
          </div>

          {/* Evidence tags */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">关键证据</p>
            {evidence.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {evidence.map((item) => (
                  <Badge key={item} variant="outline" className="text-xs">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                当前暂无足够证据支撑结构性衰败判断
              </p>
            )}
          </div>
        </div>

        {/* Components breakdown grid */}
        {components.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">衰败拆解</span>
            <div className="flex flex-col gap-2">
              {components.map((item) => {
                const deltaNum = Number(item.delta);
                const deltaStr =
                  deltaNum > 0
                    ? `+${deltaNum.toFixed(2)}`
                    : deltaNum.toFixed(2);
                return (
                  <div
                    key={item.key}
                    className="rounded-lg border border-border bg-card/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{item.label}</span>
                      <Badge variant={deltaVariant(item.status)} className="text-xs">
                        {deltaStr}
                      </Badge>
                    </div>
                    {item.detail && (
                      <p className="mt-1 text-xs text-muted-foreground leading-snug">
                        {item.detail}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default StructuralDecayCard;
