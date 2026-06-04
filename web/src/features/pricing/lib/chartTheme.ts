/** Dark-theme Recharts constants for the pricing feature. */

/** Chart grid line colour. */
export const CHART_GRID_COLOR = '#2A2A33';

/** Axis tick label colour. */
export const CHART_TICK_COLOR = '#8E8E98';

/** Primary series colour (amber). */
export const CHART_PRIMARY_COLOR = '#E2B23C';

/** Positive / up-move series colour. */
export const CHART_POS_COLOR = '#5FBF7E';

/** Negative / down-move series colour. */
export const CHART_NEG_COLOR = '#E5685A';

/** Recharts-compatible tooltip style object. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#17171C',
  border: `1px solid ${CHART_GRID_COLOR}`,
  color: '#ECECEE',
} as const;
