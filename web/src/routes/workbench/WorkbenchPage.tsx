// WorkbenchPage — Task 9 assembly.
// Replaces the P0 placeholder with the full workbench layout:
//   WorkbenchShell (top chrome)
//   + WorkbenchFilters (filter strip)
//   + 16/8 responsive grid:
//       left  = WorkbenchBoard (kanban + task cards with refresh-signal badges)
//       right = WorkbenchDetailPanel (with snapshot-slot filled by SnapshotComparePanel
//               + SnapshotSummary when latestSnapshotComparison is present)
//               + SelectedTaskRefreshPanel
//   + daily briefing cluster (P3.5): DailyBriefingPanel + DailyBriefingPreviewDrawer
//
// P3.5: bulk actions + drag/drop reorder wired in.
//
// States:
//   - loading + no tasks → Skeleton
//   - render board + detail panel when data present
//   - manual refresh button

import { useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

import useResearchWorkbenchData from '@/features/workbench/hooks/useResearchWorkbenchData';
import WorkbenchShell from '@/features/workbench/components/WorkbenchShell';
import WorkbenchFilters from '@/features/workbench/components/WorkbenchFilters';
import WorkbenchBoard from '@/features/workbench/components/WorkbenchBoard';
import WorkbenchDetailPanel from '@/features/workbench/components/WorkbenchDetailPanel';
import SelectedTaskRefreshPanel from '@/features/workbench/components/SelectedTaskRefreshPanel';
import SnapshotComparePanel from '@/features/workbench/components/SnapshotComparePanel';
import SnapshotSummary from '@/features/workbench/components/SnapshotSummary';
import DailyBriefingCluster from '@/features/workbench/components/DailyBriefingCluster';
import AltDataCandidateQueue from '@/features/workbench/components/AltDataCandidateQueue';
import type { ComparisonRow } from '@/features/workbench/lib/snapshotCompareFormatters';
import type { RefreshSignal } from '@/features/workbench/components/WorkbenchTaskCard';

// ---------------------------------------------------------------------------
// Helper: build hero metrics from stats
// ---------------------------------------------------------------------------

function buildHeroMetrics(stats: Record<string, unknown> | null): Array<{ label: string; value: string | number }> {
  if (!stats) return [];
  const metrics: Array<{ label: string; value: string | number }> = [];
  if (stats.total !== undefined && stats.total !== null) {
    metrics.push({ label: '总任务', value: Number(stats.total) });
  }
  if (stats.in_progress !== undefined && stats.in_progress !== null) {
    metrics.push({ label: '研究中', value: Number(stats.in_progress) });
  }
  if (stats.blocked !== undefined && stats.blocked !== null) {
    metrics.push({ label: '阻塞', value: Number(stats.blocked) });
  }
  if (stats.complete !== undefined && stats.complete !== null) {
    metrics.push({ label: '完成', value: Number(stats.complete) });
  }
  return metrics;
}

// ---------------------------------------------------------------------------
// WorkbenchPage
// ---------------------------------------------------------------------------

export default function WorkbenchPage() {
  const {
    // board
    tasks,
    boardColumns,
    archivedTasks,
    stats,

    // filters
    filters,
    setFilters,
    sourceOptions,

    // refresh
    refreshStats,
    refreshSignals,
    refreshCurrentTask,
    loading,
    autoRefreshSummary,

    // morning preset
    applyMorningPreset,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,

    // selected task
    selectedTaskId,
    setSelectedTaskId,
    selectedTask,
    timeline,
    timelineItems,
    missingTaskNotice,

    // task intelligence
    selectedTaskPriorityMeta,
    latestSnapshotComparison,

    // mutations
    updateTaskStatus,
    addComment,
    deleteComment,

    // bulk + reorder (P3.5)
    bulkUpdateStatus,
    reorderCard,

    // filtered tasks (for briefing context)
    filteredTasks,
  } = useResearchWorkbenchData();

  // ── Daily briefing context ─────────────────────────────────────────────────
  const briefingWorkbenchViewSummary = {
    headline: stats ? `工作台 · ${String(stats.total ?? 0)} 个任务` : '研究工作台',
    scopedTaskLabel: selectedTask
      ? `${String((selectedTask as Record<string, unknown>).symbol ?? '')} ${String((selectedTask as Record<string, unknown>).title ?? '')}`.trim()
      : '',
  };

  // ── Bulk selection state (P3.5) ───────────────────────────────────────────
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const handleBulkSelect = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    );
  }, []);

  const handleBulkClear = useCallback(() => {
    setSelectedTaskIds([]);
  }, []);

  const handleBulkStatusChange = useCallback(
    (taskIds: string[], newStatus: string) => {
      void bulkUpdateStatus(taskIds, newStatus);
      setSelectedTaskIds([]);
    },
    [bulkUpdateStatus],
  );

  // ── Drag/drop callback (P3.5) ─────────────────────────────────────────────
  const handleDrop = useCallback(
    ({ taskId, targetStatus }: { taskId: string; targetStatus: string }) => {
      void reorderCard(taskId, targetStatus);
    },
    [reorderCard],
  );

  // ── Copy view link ─────────────────────────────────────────────────────────
  const handleCopyViewLink = () => {
    if (typeof window !== 'undefined') {
      void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
    }
  };

  // ── Manual refresh ─────────────────────────────────────────────────────────
  const handleManualRefresh = () => {
    void refreshCurrentTask({ trigger: 'manual' });
  };

  // ── Derived: hero metrics ──────────────────────────────────────────────────
  const heroMetrics = buildHeroMetrics(stats);

  // ── Snapshot slot content ──────────────────────────────────────────────────
  // Filled when latestSnapshotComparison is non-null (from useSelectedTaskIntelligence)
  const snapshotRows: ComparisonRow[] =
    latestSnapshotComparison &&
    Array.isArray((latestSnapshotComparison as unknown as Record<string, unknown>).rows)
      ? ((latestSnapshotComparison as unknown as Record<string, unknown>).rows as ComparisonRow[])
      : [];

  const snapshotSlot =
    latestSnapshotComparison && selectedTask ? (
      <div className="flex flex-col gap-3">
        <SnapshotComparePanel
          rows={snapshotRows}
          onBaseChange={() => undefined}
          onTargetChange={() => undefined}
        />
        <SnapshotSummary
          task={selectedTask as Parameters<typeof SnapshotSummary>[0]['task']}
        />
      </div>
    ) : null;

  // ── Skeleton while loading (first load, no data yet) ──────────────────────
  const showSkeleton = loading && tasks.length === 0;

  return (
    <WorkbenchShell
      heroMetrics={heroMetrics}
      onCopyViewLink={handleCopyViewLink}
      missingTaskNotice={missingTaskNotice}
    >
      {/* ── Filters strip ── */}
      <WorkbenchFilters
        filters={filters}
        setFilters={setFilters}
        sourceOptions={sourceOptions}
        refreshStats={refreshStats}
        morningPresetActive={morningPresetActive}
        morningPresetCandidate={morningPresetCandidate}
        onApplyMorningPreset={() => applyMorningPreset()}
      />

      {/* ── Manual refresh button ── */}
      <div className="flex items-center justify-end">
        <Button
          data-testid="manual-refresh-btn"
          size="sm"
          variant="outline"
          onClick={handleManualRefresh}
          disabled={loading}
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '刷新中…' : '手动刷新'}
        </Button>
      </div>

      {/* ── Skeleton or board+detail ── */}
      {showSkeleton ? (
        <div data-testid="workbench-skeleton" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            {/* Board skeleton */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[1, 2, 3, 4].map((col) => (
                  <div key={col} className="flex flex-col gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            {/* Detail panel skeleton */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : (
        /* ── 16/8 responsive grid ── */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          {/* Left: board */}
          <WorkbenchBoard
            tasks={[...boardColumns.flatMap((col) => col.tasks), ...archivedTasks]}
            selectedTaskId={selectedTaskId || null}
            refreshSignalsByTaskId={
              refreshSignals.byTaskId as unknown as Record<string, RefreshSignal>
            }
            onSelect={(taskId: string) => setSelectedTaskId(taskId)}
            onStatusChange={(taskId: string, newStatus: string) => {
              void updateTaskStatus(taskId, newStatus);
            }}
            selectedTaskIds={selectedTaskIds}
            onBulkSelect={handleBulkSelect}
            onBulkClear={handleBulkClear}
            onBulkStatusChange={handleBulkStatusChange}
            onDrop={handleDrop}
          />

          {/* Right: detail + refresh panel */}
          <div className="flex flex-col gap-4">
            <WorkbenchDetailPanel
              selectedTask={
                selectedTask as Parameters<typeof WorkbenchDetailPanel>[0]['selectedTask']
              }
              timeline={timeline as Parameters<typeof WorkbenchDetailPanel>[0]['timeline']}
              timelineItems={
                timelineItems as Parameters<typeof WorkbenchDetailPanel>[0]['timelineItems']
              }
              onStatusChange={(newStatus: string) => {
                if (selectedTaskId) void updateTaskStatus(selectedTaskId, newStatus);
              }}
              onAddComment={(body: string) => {
                if (selectedTaskId) void addComment(selectedTaskId, body);
              }}
              onDeleteComment={(commentId: string) => {
                if (selectedTaskId) void deleteComment(selectedTaskId, commentId);
              }}
              snapshotSlot={snapshotSlot}
            />

            {/* Refresh panel (priority meta + recommendations) */}
            <SelectedTaskRefreshPanel
              priorityMeta={
                selectedTaskPriorityMeta as Parameters<typeof SelectedTaskRefreshPanel>[0]['priorityMeta']
              }
            />
          </div>
        </div>
      )}

      {/* ── Daily briefing cluster (P3.5) ── */}
      <DailyBriefingCluster
        workbenchDailyBriefing={{ headline: '', summary: '', chips: [], details: [] }}
        workbenchViewSummary={briefingWorkbenchViewSummary}
        filteredTasks={filteredTasks}
        filters={filters}
        selectedTask={selectedTask as Parameters<typeof DailyBriefingCluster>[0]['selectedTask']}
        selectedTaskId={selectedTaskId ?? undefined}
        morningPresetActive={morningPresetActive}
        morningPresetCandidate={morningPresetCandidate as Parameters<typeof DailyBriefingCluster>[0]['morningPresetCandidate']}
        morningPresetSummary={morningPresetSummary as Parameters<typeof DailyBriefingCluster>[0]['morningPresetSummary']}
        autoRefreshSummary={autoRefreshSummary as Parameters<typeof DailyBriefingCluster>[0]['autoRefreshSummary']}
      />

      {/* ── Alt-data candidate queue (P3.5) ── */}
      <AltDataCandidateQueue />
    </WorkbenchShell>
  );
}
