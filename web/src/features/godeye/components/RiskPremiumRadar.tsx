// ---------------------------------------------------------------------------
// RiskPremiumRadar — shadcn/Recharts presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/RiskPremiumRadar.js (74)
// Props in, no API calls.
// ---------------------------------------------------------------------------

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
} from 'recharts';
import { ChartFrame } from '@/features/pricing/components/ChartFrame';
import { Badge } from '@/components/ui/badge';
import {
  CHART_GRID_COLOR,
  CHART_PRIMARY_COLOR,
  CHART_TICK_COLOR,
  CHART_TOOLTIP_STYLE,
} from '@/features/pricing/lib/chartTheme';
import { getSignalLabel } from '@/features/godeye/lib/overviewViewModels';
import type { RadarItem } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskPremiumRadarProps {
  radarData: RadarItem[];
  macroScore: number;
  confidence: number;
  macroSignal: number;
  /** Optional navigation action — rendered as a button. */
  primaryAction?: { label: string; target: string } | null;
  onNavigate?: (action: { label: string; target: string }) => void;
}

// ---------------------------------------------------------------------------
// Signal → badge variant
// ---------------------------------------------------------------------------

function signalVariant(signal: number): 'destructive' | 'default' | 'secondary' {
  if (signal === 1) return 'destructive';
  if (signal === -1) return 'secondary';
  return 'default';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RiskPremiumRadar — Recharts RadarChart wrapped in ChartFrame.
 *
 * The badge row (signal / confidence) and footer (score / factor count) are
 * rendered outside of ChartFrame because ResponsiveContainer requires a single
 * Recharts child element.  The entire block is composed as a flex column.
 */
export function RiskPremiumRadar({
  radarData,
  macroScore,
  confidence,
  macroSignal,
  primaryAction = null,
  onNavigate,
}: RiskPremiumRadarProps) {
  const signalLabel = getSignalLabel(macroSignal);
  const confidenceDisplay = Number(confidence ?? 0).toFixed(2);
  const scoreDisplay = Number(macroScore ?? 0).toFixed(4);

  return (
    <div className="flex flex-col gap-0">
      {/* Badge row — signal & confidence */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Badge variant={signalVariant(macroSignal)}>{signalLabel}</Badge>
        <Badge variant="secondary">置信度 {confidenceDisplay}</Badge>
      </div>

      {/* Chart wrapped in ChartFrame (dark-amber axis/grid per chartTheme) */}
      <ChartFrame title="风险溢价雷达" height={280}>
        {radarData.length > 0 ? (
          <RadarChart data={radarData}>
            <PolarGrid stroke={CHART_GRID_COLOR} />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fill: CHART_TICK_COLOR, fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="强度"
              dataKey="intensity"
              stroke={CHART_PRIMARY_COLOR}
              fill={CHART_PRIMARY_COLOR}
              fillOpacity={0.36}
            />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          </RadarChart>
        ) : (
          /* Empty RadarChart keeps ResponsiveContainer happy */
          <RadarChart data={[]}>
            <PolarGrid stroke={CHART_GRID_COLOR} />
          </RadarChart>
        )}
      </ChartFrame>

      {/* Footer row — score / factor count / optional navigate action */}
      <div className="flex items-center justify-between gap-3 mt-3 px-1">
        <span className="text-sm text-muted-foreground">
          综合错价分数 {scoreDisplay}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">因子数量 {radarData.length}</span>
          {primaryAction ? (
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => onNavigate?.(primaryAction)}
            >
              {primaryAction.label}
            </button>
          ) : null}
        </div>
      </div>

      {/* Empty state overlay */}
      {radarData.length === 0 && (
        <div className="text-muted-foreground text-sm text-center py-4">暂无雷达数据</div>
      )}
    </div>
  );
}

export default RiskPremiumRadar;
