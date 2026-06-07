/** Shared Recharts "command center" theme tokens (dark, hairline, glow series). */
export const commandChartTheme = {
  grid: 'rgba(255,255,255,0.06)',
  axis: '#5f6776',
  axisFont: '10px "JetBrains Mono", ui-monospace, monospace',
  series: {
    amber: '#f3b85a',
    blue: '#6ea8ff',
    pos: '#46c890',
    neg: '#ff6f6f',
  },
  tooltip: {
    background: '#0e1626',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    color: '#eef0f4',
  },
} as const;
