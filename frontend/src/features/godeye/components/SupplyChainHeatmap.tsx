// ---------------------------------------------------------------------------
// SupplyChainHeatmap — shadcn/Tailwind presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/SupplyChainHeatmap.js (86)
// Props in, no API calls.
// ---------------------------------------------------------------------------

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getGodEyeAnomalyTypeLabel } from '@/features/godeye/lib/displayLabels';
import type { HeatmapModel, HeatmapCell, HeatmapAnomaly } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupplyChainHeatmapProps {
  heatmapModel: HeatmapModel;
}

// ---------------------------------------------------------------------------
// Tone → gradient map (mirrors old JS toneStyle)
// ---------------------------------------------------------------------------

const TONE_CLASSES: Record<string, string> = {
  hot: 'bg-gradient-to-br from-[rgba(207,19,34,0.9)] to-[rgba(250,140,22,0.7)]',
  cold: 'bg-gradient-to-br from-[rgba(8,93,153,0.85)] to-[rgba(19,194,194,0.65)]',
  neutral: 'bg-gradient-to-br from-[rgba(37,46,58,0.95)] to-[rgba(69,85,96,0.82)]',
};

// ---------------------------------------------------------------------------
// Sub-component: HeatCell
// ---------------------------------------------------------------------------

interface HeatCellProps {
  cell: HeatmapCell;
}

function HeatCell({ cell }: HeatCellProps) {
  const toneClass = TONE_CLASSES[cell.tone] ?? TONE_CLASSES.neutral;
  const momentumLabel =
    cell.momentum === 'strengthening'
      ? '趋势增强'
      : cell.momentum === 'weakening'
        ? '趋势走弱'
        : '趋势稳定';

  const deltaSigned =
    cell.trendDelta >= 0
      ? `Δ+${cell.trendDelta.toFixed(2)}`
      : `Δ${cell.trendDelta.toFixed(2)}`;

  return (
    <div
      className={`min-h-[132px] rounded-2xl p-4 text-[#f6fbff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] ${toneClass}`}
    >
      {/* Header row: group label + count */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <Badge variant={cell.group === 'Supply Chain' ? 'default' : 'secondary'}>
          {cell.groupLabel}
        </Badge>
        <span className="text-xs text-[rgba(246,251,255,0.75)]">{cell.count} 条</span>
      </div>

      {/* Dimension label */}
      <div className="text-lg font-semibold mb-2">{cell.label}</div>

      {/* Display value */}
      <div className="text-[28px] font-bold leading-tight mb-2">{cell.displayValue}</div>

      {/* Display hint */}
      <div className="text-xs text-[rgba(246,251,255,0.72)] mb-3">{cell.displayHint}</div>

      {/* Momentum chips */}
      <div className="flex flex-wrap gap-2 mb-2.5">
        <Badge
          variant={
            cell.momentum === 'strengthening'
              ? 'destructive'
              : cell.momentum === 'weakening'
                ? 'secondary'
                : 'outline'
          }
        >
          {momentumLabel}
        </Badge>
        <Badge variant="outline">{deltaSigned}</Badge>
      </div>

      {/* Summary */}
      <div className="text-xs text-[rgba(246,251,255,0.78)]">{cell.summary}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: AnomalyItem
// ---------------------------------------------------------------------------

interface AnomalyItemProps {
  anomaly: HeatmapAnomaly;
}

function AnomalyItem({ anomaly }: AnomalyItemProps) {
  const typeLabel = getGodEyeAnomalyTypeLabel(anomaly.type);
  const isHot = anomaly.type === 'alert' || anomaly.type === 'hot';
  const isCold = anomaly.type === 'cold';

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold truncate">{anomaly.title}</span>
        <span className="text-xs text-muted-foreground">{anomaly.description}</span>
      </div>
      <Badge
        variant={isHot ? 'destructive' : isCold ? 'secondary' : 'outline'}
        className="shrink-0"
      >
        {typeLabel}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SupplyChainHeatmap({ heatmapModel }: SupplyChainHeatmapProps) {
  const { cells, anomalies } = heatmapModel;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>实体链路热区</CardTitle>
        <Badge variant="secondary">{cells.length} 个热区</Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* 2×3 heat cell grid */}
        {cells.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {cells.map((cell) => (
              <HeatCell key={cell.key} cell={cell} />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm text-center py-6">暂无可用热区</div>
        )}

        {/* Anomaly list */}
        <div>
          <div className="text-sm font-semibold mb-2.5">最近异常点</div>
          {anomalies.length > 0 ? (
            <div className="flex flex-col">
              {anomalies.map((anomaly) => (
                <AnomalyItem key={anomaly.key} anomaly={anomaly} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center py-3">暂无显著异常</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SupplyChainHeatmap;
