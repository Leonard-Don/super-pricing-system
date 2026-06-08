/**
 * Dark "command center" Recharts constants shared across pricing + godeye charts.
 * Single source of truth: re-derived from `commandChartTheme` so every chart shares
 * the same hairline grid / mono axis / glow-amber series look.
 */
import { commandChartTheme } from '@/components/command/chartTheme';

/** Chart grid line colour. */
export const CHART_GRID_COLOR = commandChartTheme.grid;

/** Axis tick label colour. */
export const CHART_TICK_COLOR = commandChartTheme.axis;

/** Primary series colour (amber). */
export const CHART_PRIMARY_COLOR = commandChartTheme.series.amber;

/** Positive / up-move series colour. */
export const CHART_POS_COLOR = commandChartTheme.series.pos;

/** Negative / down-move series colour. */
export const CHART_NEG_COLOR = commandChartTheme.series.neg;

/** Recharts-compatible tooltip style object. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: commandChartTheme.tooltip.background,
  border: commandChartTheme.tooltip.border,
  borderRadius: commandChartTheme.tooltip.borderRadius,
  color: commandChartTheme.tooltip.color,
} as const;

/** Build an SVG <linearGradient> id + stops object for an area fill (series → transparent). */
export const CHART_AREA_GRADIENT = {
  id: 'cmdAreaAmber',
  from: commandChartTheme.series.amber,
} as const;

/** drop-shadow filter string for a glowing active series. */
export const CHART_GLOW = `drop-shadow(0 0 5px ${commandChartTheme.series.amber}aa)`;
