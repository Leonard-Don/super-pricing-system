import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { resolveAnalysisSymbol } from '@/features/pricing/lib/pricingResearch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SensitivityControls {
  wacc: number;
  initialGrowth: number;
  terminalGrowth: number;
  fcfMargin: number;
}

interface SensitivityCase {
  wacc?: number | string;
  fair_value?: number | string | null;
}

interface SensitivityRow {
  growth?: number | string;
  cases?: SensitivityCase[];
}

interface SensitivityResult {
  sensitivity_matrix?: SensitivityRow[];
}

interface SensitivityCardProps {
  symbol?: string;
  loading?: boolean;
  error?: string | null;
  sensitivity?: SensitivityResult | null;
  controls?: SensitivityControls;
  onControlChange?: (updater: (prev: SensitivityControls) => SensitivityControls) => void;
  onRun?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toFin = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

interface HeatmapRow {
  key: string;
  growth: number | string;
  wacc: number | string;
  fair_value: number | string | null | undefined;
}

// ---------------------------------------------------------------------------
// Slider row sub-component
// ---------------------------------------------------------------------------

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full bg-muted accent-primary cursor-pointer"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

const DEFAULT_CONTROLS: SensitivityControls = {
  wacc: 9,
  initialGrowth: 10,
  terminalGrowth: 2.5,
  fcfMargin: 75,
};

export function SensitivityCard({
  symbol,
  loading = false,
  error,
  sensitivity,
  controls = DEFAULT_CONTROLS,
  onControlChange,
  onRun,
}: SensitivityCardProps): React.JSX.Element {
  const matrix = sensitivity?.sensitivity_matrix ?? [];
  const heatmapRows: HeatmapRow[] = matrix.flatMap((row) =>
    (row.cases ?? []).map((item) => ({
      key: `${row.growth}-${item.wacc}`,
      growth: row.growth ?? 0,
      wacc: item.wacc ?? 0,
      fair_value: item.fair_value,
    })),
  );

  const columns: ColumnDef<HeatmapRow>[] = [
    {
      accessorKey: 'growth',
      header: '增长率',
      cell: ({ getValue }) => `${toFin(getValue()).toFixed(1)}%`,
    },
    {
      accessorKey: 'wacc',
      header: 'WACC',
      cell: ({ getValue }) => `${toFin(getValue()).toFixed(1)}%`,
    },
    {
      accessorKey: 'fair_value',
      header: '公允价值',
      cell: ({ getValue }) => `$${toFin(getValue()).toFixed(2)}`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>敏感性分析 / What-If</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          调整折现率、增长率和现金流转化率，观察公允价值如何变化。当前标的：
          {resolveAnalysisSymbol(symbol) || '未选择'}。
        </p>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SliderRow
            label="WACC"
            min={5}
            max={15}
            step={0.1}
            value={controls.wacc}
            onChange={(v) =>
              onControlChange?.((prev) => ({ ...prev, wacc: v }))
            }
          />
          <SliderRow
            label="初始增长率"
            min={2}
            max={25}
            step={0.5}
            value={controls.initialGrowth}
            onChange={(v) =>
              onControlChange?.((prev) => ({ ...prev, initialGrowth: v }))
            }
          />
          <SliderRow
            label="终值增长率"
            min={1}
            max={5}
            step={0.1}
            value={controls.terminalGrowth}
            onChange={(v) =>
              onControlChange?.((prev) => ({ ...prev, terminalGrowth: v }))
            }
          />
          <SliderRow
            label="FCF 转化率"
            min={50}
            max={95}
            step={1}
            value={controls.fcfMargin}
            onChange={(v) =>
              onControlChange?.((prev) => ({ ...prev, fcfMargin: v }))
            }
          />
        </div>

        {/* Run button + current values */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? '运行中…' : '刷新敏感性分析'}
          </button>
          <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            WACC {controls.wacc}%
          </span>
          <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            增长 {controls.initialGrowth}%
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !heatmapRows.length && (
          <p className="text-xs text-muted-foreground">
            运行敏感性分析后查看不同假设下的公允价值变化
          </p>
        )}

        {/* Heatmap table */}
        {heatmapRows.length > 0 && (
          <DataTable columns={columns} data={heatmapRows} />
        )}
      </CardContent>
    </Card>
  );
}
