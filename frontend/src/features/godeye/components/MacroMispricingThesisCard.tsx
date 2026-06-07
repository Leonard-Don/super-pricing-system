// ---------------------------------------------------------------------------
// MacroMispricingThesisCard — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/pricing/PricingInsightCards.js (MacroMispricingThesisCard export)
// Props: data, onOpenDraft — nested paths follow the old component exactly.
// onOpenDraft CTA couples to cross-market draft (P3) — button renders, handler is TODO (P3).
// No API calls. No `any`.
// ---------------------------------------------------------------------------

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types — narrow; all fields optional
// ---------------------------------------------------------------------------

interface TradeLeg {
  symbol?: string;
  side?: string;
  role?: string;
  weight?: number | string | null;
  thesis?: string;
}

interface PrimaryLeg {
  symbol?: string;
  side?: string;
  rationale?: string;
}

interface HedgeLeg {
  symbol?: string;
  side?: string;
  rationale?: string;
}

export interface MacroMispricingThesisData {
  stance?: string;
  thesis_type?: string;
  horizon?: string;
  people_risk?: string;
  summary?: string;
  primary_leg?: PrimaryLeg;
  hedge_leg?: HedgeLeg | null;
  trade_legs?: TradeLeg[];
  target_price?: number | string | null;
  risk_boundary?: number | string | null;
  risk_reward?: number | string | null;
  kill_conditions?: string[];
  execution_notes?: string[];
}

export interface MacroMispricingThesisCardProps {
  data: MacroMispricingThesisData;
  /** Opens cross-market draft — P3 feature. Button renders; if not wired, no-op. */
  onOpenDraft?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Side badge variant */
const sideVariant = (side: string): 'destructive' | 'default' | 'outline' => {
  switch (side) {
    case 'short':
      return 'destructive';
    case 'long':
      return 'default';
    default:
      return 'outline';
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MacroMispricingThesisCard({
  data,
  onOpenDraft,
}: MacroMispricingThesisCardProps) {
  if (!data || !Object.keys(data).length) return null;

  const tradeLegs = data.trade_legs ?? [];
  const killConditions = data.kill_conditions ?? [];
  const executionNotes = data.execution_notes ?? [];

  const hasTradeBoundary =
    data.target_price !== undefined ||
    data.risk_boundary !== undefined ||
    data.risk_reward !== undefined;

  return (
    <Card
      data-testid="pricing-macro-mispricing-thesis-card"
      className="bg-card border-border"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-foreground">Macro Mispricing Thesis</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Top tags: stance / thesis_type / horizon / people_risk */}
        <div className="flex flex-wrap gap-1.5">
          {data.stance && (
            <Badge variant="destructive">{data.stance}</Badge>
          )}
          {data.thesis_type && (
            <Badge variant="outline">{data.thesis_type}</Badge>
          )}
          {data.horizon && (
            <Badge variant="outline">观察期 {data.horizon}</Badge>
          )}
          {data.people_risk && (
            <Badge variant="outline">人的维度 {data.people_risk}</Badge>
          )}
        </div>

        {/* Summary */}
        {data.summary && (
          <p className="text-sm text-muted-foreground leading-snug">{data.summary}</p>
        )}

        {/* Open draft CTA — P3 deferred; button always renders */}
        <Button
          size="sm"
          variant="default"
          onClick={() => {
            // TODO (P3): wire to cross-market draft
            onOpenDraft?.();
          }}
        >
          打开跨市场草案
        </Button>

        {/* Primary leg + Hedge leg grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Primary leg */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">主腿</p>
            <p className="mt-2 text-xs text-foreground">
              {data.primary_leg?.symbol ?? '—'}
              {data.primary_leg?.side
                ? ` · ${data.primary_leg.side}`
                : ' · watch'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {data.primary_leg?.rationale ?? '暂无主腿说明'}
            </p>
          </div>

          {/* Hedge leg */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">对冲腿</p>
            <p className="mt-2 text-xs text-foreground">
              {data.hedge_leg?.symbol ?? '—'}
              {data.hedge_leg?.side ? ` · ${data.hedge_leg.side}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {data.hedge_leg?.rationale ?? '当前更适合作为观察或单腿表达'}
            </p>
          </div>
        </div>

        {/* Trade legs grid */}
        {tradeLegs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">组合腿</span>
            <div className="flex flex-col gap-2">
              {tradeLegs.map((leg, index) => {
                const weightPct =
                  leg.weight !== undefined && leg.weight !== null
                    ? `${(Number(leg.weight) * 100).toFixed(0)}%`
                    : null;
                return (
                  <div
                    key={`${leg.symbol ?? ''}-${leg.side ?? ''}-${index}`}
                    className="rounded-lg border border-border bg-card/50 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground">
                        {leg.symbol ?? '—'}
                      </span>
                      {leg.side && (
                        <Badge variant={sideVariant(leg.side)} className="text-xs">
                          {leg.side}
                        </Badge>
                      )}
                      {leg.role && (
                        <Badge variant="outline" className="text-xs">
                          {leg.role}
                        </Badge>
                      )}
                      {weightPct && (
                        <Badge variant="outline" className="text-xs">
                          权重 {weightPct}
                        </Badge>
                      )}
                    </div>
                    {leg.thesis && (
                      <p className="mt-1 text-xs text-muted-foreground leading-snug">
                        {leg.thesis}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trade boundary */}
        {hasTradeBoundary && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">交易边界</span>
            <div className="flex flex-wrap gap-1.5">
              {data.target_price !== undefined && data.target_price !== null && (
                <Badge variant="outline" className="text-xs">
                  目标价 ${Number(data.target_price).toFixed(2)}
                </Badge>
              )}
              {data.risk_boundary !== undefined && data.risk_boundary !== null && (
                <Badge variant="outline" className="text-xs">
                  风险边界 ${Number(data.risk_boundary).toFixed(2)}
                </Badge>
              )}
              {data.risk_reward !== undefined && data.risk_reward !== null && (
                <Badge variant="outline" className="text-xs">
                  盈亏比 {Number(data.risk_reward).toFixed(2)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Kill conditions */}
        {killConditions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Kill Conditions</span>
            <div className="flex flex-col gap-1">
              {killConditions.slice(0, 3).map((item) => (
                <p key={item} className="text-xs text-muted-foreground leading-snug">
                  {item}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Execution notes */}
        {executionNotes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">执行备注</span>
            <div className="flex flex-col gap-1">
              {executionNotes.slice(0, 3).map((item) => (
                <p key={item} className="text-xs text-muted-foreground leading-snug">
                  {item}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MacroMispricingThesisCard;
