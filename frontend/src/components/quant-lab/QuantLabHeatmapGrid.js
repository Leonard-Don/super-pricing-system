import React from 'react';
import { Empty } from 'antd';

const QuantLabHeatmapGrid = ({ heatmap }) => {
  const cells = Array.isArray(heatmap?.cells) ? heatmap.cells : [];
  if (!cells.length) {
    return <Empty description="暂无参数热力图数据" />;
  }

  const values = cells
    .map((item) => Number(item.value))
    .filter((item) => Number.isFinite(item));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  const colorForValue = (value) => {
    if (!Number.isFinite(Number(value))) {
      return 'rgba(148, 163, 184, 0.12)';
    }
    const ratio = max === min ? 0.5 : (Number(value) - min) / (max - min);
    const alpha = 0.18 + (ratio * 0.55);
    return ratio >= 0.5 ? `rgba(34, 197, 94, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
  };

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
      {cells.map((item) => (
        <div
          key={`${item.x}-${item.y ?? 'single'}`}
          style={{
            borderRadius: 12,
            padding: 12,
            border: '1px solid rgba(148, 163, 184, 0.16)',
            background: colorForValue(item.value),
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {heatmap?.y_key ? `${heatmap.x_key}=${item.x} · ${heatmap.y_key}=${item.y}` : `${heatmap?.metric || 'metric'} @ ${item.x}`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
            {Number.isFinite(Number(item.value)) ? Number(item.value).toFixed(3) : '--'}
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuantLabHeatmapGrid;
