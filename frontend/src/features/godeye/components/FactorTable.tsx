// ---------------------------------------------------------------------------
// FactorTable — shadcn DataTable presentation component
// Rebuilt from frontend/src/components/GodEyeDashboard/FactorTable.js (116)
// Uses @/components/DataTable. Props in. No API calls.
// ---------------------------------------------------------------------------

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { MicroBar } from '@/components/command';
import {
  signalColor,
  conflictColor,
  conflictTrendColor,
  coverageColor,
  stabilityColor,
  lagColor,
  concentrationColor,
  driftColor,
  flowColor,
  confirmationColor,
  dominanceColor,
  consistencyColor,
  reversalColor,
  precursorColor,
} from '@/features/godeye/lib/macroFactorColors';
import { localizeGodEyeText } from '@/features/godeye/lib/displayLabels';
import type { FactorPanelFactor } from '@/features/godeye/lib/overviewViewModels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EvidenceTagSpec {
  key: string;
  colorMap: Record<string, string>;
  hide?: string;
}

const EVIDENCE_TAG_SPECS: EvidenceTagSpec[] = [
  { key: 'coverage_summary.coverage_label', colorMap: coverageColor },
  { key: 'stability_summary.label', colorMap: stabilityColor },
  { key: 'lag_summary.level', colorMap: lagColor, hide: 'none' },
  { key: 'concentration_summary.label', colorMap: concentrationColor, hide: 'low' },
  { key: 'source_drift_summary.label', colorMap: driftColor, hide: 'stable' },
  { key: 'source_gap_summary.label', colorMap: flowColor, hide: 'stable' },
  { key: 'cross_confirmation_summary.label', colorMap: confirmationColor, hide: 'none' },
  { key: 'source_dominance_summary.label', colorMap: dominanceColor, hide: 'stable' },
  { key: 'consistency_summary.label', colorMap: consistencyColor, hide: 'unknown' },
  { key: 'reversal_summary.label', colorMap: reversalColor, hide: 'stable' },
  { key: 'reversal_precursor_summary.label', colorMap: precursorColor, hide: 'none' },
];

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const colorToVariant = (color: string): 'destructive' | 'outline' | 'secondary' | 'default' => {
  switch (color) {
    case 'red':
    case 'volcano':
      return 'destructive';
    case 'green':
      return 'outline';
    default:
      return 'secondary';
  }
};

// ---------------------------------------------------------------------------
// Row type
// ---------------------------------------------------------------------------

type FactorRow = FactorPanelFactor & { id: string };

// ---------------------------------------------------------------------------
// Column renderers
// ---------------------------------------------------------------------------

function EvidenceCell({ value }: { value: Record<string, unknown> }) {
  const conflictLevel = value?.conflict_level as string | undefined;
  const conflictTrend = value?.conflict_trend as string | undefined;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <span className="text-xs text-muted-foreground">
        {Number(value?.source_count ?? 0)} 源 / {Number(value?.record_count ?? 0)} 条
      </span>
      {conflictLevel && conflictLevel !== 'none' ? (
        <Badge variant={colorToVariant(conflictColor[conflictLevel] ?? 'orange')}>
          {localizeGodEyeText(conflictLevel)}
        </Badge>
      ) : null}
      {conflictTrend && conflictLevel !== 'none' ? (
        <Badge variant={colorToVariant(conflictTrendColor[conflictTrend] ?? 'blue')}>
          {localizeGodEyeText(conflictTrend)}
        </Badge>
      ) : null}
      {EVIDENCE_TAG_SPECS.map(({ key, colorMap, hide }) => {
        const tagValue = getNestedValue(value, key);
        if (!tagValue || tagValue === hide) return null;
        const tagStr = String(tagValue);
        return (
          <Badge key={key} variant={colorToVariant(colorMap[tagStr] ?? 'blue')}>
            {localizeGodEyeText(tagStr)}
          </Badge>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns definition
// ---------------------------------------------------------------------------

const columns: ColumnDef<FactorRow>[] = [
  {
    accessorKey: 'displayName',
    header: '因子',
    cell: ({ getValue }) => (
      <span className="font-semibold text-foreground">{String(getValue() ?? '')}</span>
    ),
  },
  {
    accessorKey: 'value',
    header: '值',
    cell: ({ getValue }) => Number(getValue() ?? 0).toFixed(4),
  },
  {
    accessorKey: 'z_score',
    header: 'Z',
    cell: ({ getValue }) => Number(getValue() ?? 0).toFixed(3),
  },
  {
    accessorKey: 'trendDelta',
    header: 'ΔZ',
    cell: ({ getValue, row }) => {
      const val = Number(getValue() ?? 0);
      return (
        <div className="flex items-center gap-1">
          <span className={val >= 0 ? 'text-pos' : 'text-neg'}>
            {val >= 0 ? '+' : ''}{val.toFixed(3)}
          </span>
          {row.original.signalChanged ? (
            <Badge variant="destructive">切换</Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: 'confidence',
    header: '置信度',
    cell: ({ getValue }) => {
      const val = Number(getValue() ?? 0);
      return (
        <div className="flex flex-col gap-1 min-w-[56px]">
          <span>{val.toFixed(2)}</span>
          <MicroBar value={val} tone="amber" />
        </div>
      );
    },
  },
  {
    accessorKey: 'signal',
    header: '信号',
    cell: ({ getValue }) => {
      const val = String(getValue() ?? '');
      const color = signalColor[val] ?? 'secondary';
      return (
        <Badge variant={colorToVariant(color)}>
          {val}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'evidenceSummary',
    header: '证据',
    cell: ({ getValue }) => {
      const ev = (getValue() as Record<string, unknown>) ?? {};
      return <EvidenceCell value={ev} />;
    },
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FactorTableProps {
  factors: FactorPanelFactor[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FactorTable({ factors }: FactorTableProps) {
  if (!factors.length) {
    return (
      <div className="py-4 text-center text-muted-foreground text-sm">暂无因子</div>
    );
  }

  const rows: FactorRow[] = factors.map((factor, idx) => ({
    ...factor,
    id: String(factor.name ?? `factor-${idx}`),
  }));

  return <DataTable columns={columns} data={rows} />;
}

export default FactorTable;
