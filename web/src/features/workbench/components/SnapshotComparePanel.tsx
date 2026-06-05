// SnapshotComparePanel — version comparison table.
// Ported from frontend/src/components/research-workbench/SnapshotComparePanel.js (122 lines).
//
// Props can be provided in two forms:
//   1. task + baseIndex + targetIndex — the component calls the lib dispatcher.
//   2. rows — pre-built ComparisonRow[] (for testing / parent-controlled mode).
//
// Renders via @/components/DataTable; columns: label / 基准 / 目标 / 变化.
// Presentation-only; selector callbacks forwarded to parent (controlled).

import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/DataTable';
import { buildSnapshotComparison } from '@/features/workbench/lib/snapshotCompare';
import type { ComparisonRow } from '@/features/workbench/lib/snapshotCompareFormatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawSnapshot {
  saved_at?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface TaskWithHistory {
  type?: string;
  snapshot_history?: RawSnapshot[];
  [key: string]: unknown;
}

/** Controlled props form 1 — derive rows from task + index. */
interface TaskBasedProps {
  task: TaskWithHistory;
  baseIndex: number;
  targetIndex: number;
  rows?: undefined;
}

/** Controlled props form 2 — supply pre-built rows directly. */
interface RowsBasedProps {
  task?: undefined;
  baseIndex?: undefined;
  targetIndex?: undefined;
  rows: ComparisonRow[];
}

export type SnapshotComparePanelProps = (TaskBasedProps | RowsBasedProps) & {
  onBaseChange: (index: number) => void;
  onTargetChange: (index: number) => void;
};

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: ColumnDef<ComparisonRow>[] = [
  {
    accessorKey: 'label',
    header: '指标',
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'left',
    header: '基准',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'right',
    header: '目标',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'delta',
    header: '变化',
    cell: ({ getValue }) => {
      const value = getValue() as string | null;
      if (!value || value === '不变') {
        return <span className="text-muted-foreground">{value ?? '-'}</span>;
      }
      const isPositive = value.startsWith('+');
      const isNegative = value.startsWith('-') && value !== '-';
      return (
        <span
          className={
            isPositive
              ? 'text-pos font-mono'
              : isNegative
                ? 'text-neg font-mono'
                : 'text-foreground font-mono'
          }
        >
          {value}
        </span>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function versionLabel(snapshot: RawSnapshot | undefined, index: number): string {
  if (!snapshot) return `版本 ${index + 1}`;
  return snapshot.saved_at
    ? new Date(snapshot.saved_at).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : `版本 ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SnapshotComparePanel(props: SnapshotComparePanelProps) {
  const { onBaseChange, onTargetChange } = props;

  // Pre-built rows mode (no task)
  if (props.rows !== undefined) {
    return (
      <div data-testid="workbench-snapshot-compare" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">版本对比</span>
        </div>
        <DataTable<ComparisonRow, unknown> columns={COLUMNS} data={props.rows} />
      </div>
    );
  }

  // Task-based mode
  const { task, baseIndex, targetIndex } = props;
  const history: RawSnapshot[] = task.snapshot_history ?? [];

  if (history.length < 2) {
    return (
      <div data-testid="workbench-snapshot-compare" className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">版本对比</span>
        <p className="text-sm text-muted-foreground">至少需要两个快照版本才能开始对比</p>
      </div>
    );
  }

  const baseSnapshot = history[baseIndex];
  const targetSnapshot = history[targetIndex];

  const comparison = buildSnapshotComparison(
    task.type ?? null,
    baseSnapshot as Record<string, unknown>,
    targetSnapshot as Record<string, unknown>,
  );

  const options = history.map((snap, idx) => ({
    label: versionLabel(snap, idx),
    value: idx,
  }));

  return (
    <div data-testid="workbench-snapshot-compare" className="flex flex-col gap-3">
      {/* Header: title + version selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground mr-auto">版本对比</span>
        <select
          aria-label="基准版本"
          value={baseIndex}
          onChange={(e) => onBaseChange(Number(e.target.value))}
          className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">vs</span>
        <select
          aria-label="目标版本"
          value={targetIndex}
          onChange={(e) => onTargetChange(Number(e.target.value))}
          className="text-xs border border-border rounded px-2 py-1 bg-background text-foreground"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Lead / summary badges */}
      {comparison && 'lead' in comparison && comparison.lead ? (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">
          {comparison.lead}
        </p>
      ) : null}

      {comparison ? (
        <>
          {/* Summary pills */}
          {comparison.summary?.length ? (
            <div className="flex flex-wrap gap-1">
              {comparison.summary.filter(Boolean).map((item) => (
                <span
                  key={item}
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {/* Comparison rows table */}
          <DataTable<ComparisonRow, unknown> columns={COLUMNS} data={comparison.rows} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">当前快照结构不足以生成对比</p>
      )}
    </div>
  );
}
