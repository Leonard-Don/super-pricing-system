// WorkbenchBoard — 4-column kanban board + archived section.
// Ported from frontend/src/components/research-workbench/WorkbenchBoardSection.js (395 lines).
// P3.5: added HTML5 native DnD reorder + bulk multi-select actions.

import { ChevronDown, ChevronUp, Archive, CheckSquare, X } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MAIN_STATUSES, STATUS_LABEL, sortByBoardOrder } from '@/features/workbench/lib/workbenchUtils';
import WorkbenchTaskCard, { type WorkbenchTask, type RefreshSignal } from './WorkbenchTaskCard';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropPayload {
  taskId: string;
  targetStatus: string;
}

export interface WorkbenchBoardProps {
  /** Flat list of tasks (includes archived); board groups by status. */
  tasks: WorkbenchTask[];
  selectedTaskId: string | null;
  /** Lookup: taskId → refresh signal */
  refreshSignalsByTaskId: Record<string, RefreshSignal>;
  onSelect: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;

  // Bulk-select props (P3.5)
  selectedTaskIds: string[];
  onBulkSelect: (taskId: string) => void;
  onBulkClear: () => void;
  onBulkStatusChange: (taskIds: string[], newStatus: string) => void;

  // Drag/drop callback (P3.5)
  onDrop: (payload: DropPayload) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkbenchBoard({
  tasks,
  selectedTaskId,
  refreshSignalsByTaskId,
  onSelect,
  onStatusChange,
  selectedTaskIds,
  onBulkSelect,
  onBulkClear,
  onBulkStatusChange,
  onDrop,
}: WorkbenchBoardProps) {
  const [showArchived, setShowArchived] = useState(false);
  // Track which column is the active drag-over target (for visual highlight)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  // Ref to the currently dragged task id (set during dragStart, cleared on dragEnd)
  const draggedTaskIdRef = useRef<string | null>(null);
  // Ref to the source status of the dragged task
  const draggedTaskStatusRef = useRef<string | null>(null);

  // Group tasks by status
  const tasksByStatus: Record<string, WorkbenchTask[]> = {};
  const archivedTasks: WorkbenchTask[] = [];

  for (const task of tasks) {
    const s = task.status ?? 'new';
    if (s === 'archived') {
      archivedTasks.push(task);
    } else {
      (tasksByStatus[s] ??= []).push(task);
    }
  }

  // Sort each column by board_order then updated_at
  for (const s of MAIN_STATUSES) {
    tasksByStatus[s] = (tasksByStatus[s] ?? []).sort(sortByBoardOrder);
  }
  archivedTasks.sort(sortByBoardOrder);

  // -------------------------------------------------------------------------
  // DnD handlers (attached to the column CardContent drop-zones)
  // -------------------------------------------------------------------------

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, status: string) => {
      e.preventDefault();
      // dataTransfer may be absent in jsdom test environments
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      setDragOverStatus(status);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetStatus: string) => {
      e.preventDefault();
      setDragOverStatus(null);
      const taskId = draggedTaskIdRef.current;
      const sourceStatus = draggedTaskStatusRef.current;
      draggedTaskIdRef.current = null;
      draggedTaskStatusRef.current = null;
      if (!taskId) return;
      // Only call onDrop if the status would actually change
      if (sourceStatus === targetStatus) return;
      onDrop({ taskId, targetStatus });
    },
    [onDrop],
  );

  // -------------------------------------------------------------------------
  // DnD handlers attached to task cards (via draggable wrapper)
  // -------------------------------------------------------------------------

  const handleCardDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, taskId: string, status: string) => {
      draggedTaskIdRef.current = taskId;
      draggedTaskStatusRef.current = status;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
      }
    },
    [],
  );

  const handleCardDragEnd = useCallback(() => {
    draggedTaskIdRef.current = null;
    draggedTaskStatusRef.current = null;
    setDragOverStatus(null);
  }, []);

  // -------------------------------------------------------------------------
  // Bulk selection helpers
  // -------------------------------------------------------------------------

  const hasBulkSelection = selectedTaskIds.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Bulk action toolbar (shown when any tasks are selected) ── */}
      {hasBulkSelection ? (
        <div
          data-testid="bulk-action-toolbar"
          className="flex items-center gap-2 rounded-lg border border-border bg-card/80 px-4 py-2 shadow-sm"
        >
          <CheckSquare className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium mr-2">
            已选 {selectedTaskIds.length} 个任务
          </span>

          {/* Bulk status buttons */}
          {MAIN_STATUSES.map((s) => (
            <Button
              key={s}
              data-testid={`bulk-action-${s}`}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBulkStatusChange(selectedTaskIds, s)}
            >
              → {STATUS_LABEL[s] ?? s}
            </Button>
          ))}
          <Button
            data-testid={`bulk-action-archived`}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onBulkStatusChange(selectedTaskIds, 'archived')}
          >
            → {STATUS_LABEL['archived']}
          </Button>

          {/* Clear selection */}
          <Button
            data-testid="bulk-action-clear"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs ml-auto"
            onClick={onBulkClear}
          >
            <X className="size-3 mr-1" />
            取消选择
          </Button>
        </div>
      ) : null}

      {/* ── Main 4-column grid ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MAIN_STATUSES.map((status) => {
          const colTasks = tasksByStatus[status] ?? [];
          const isDragOver = dragOverStatus === status;
          return (
            <div
              key={status}
              data-testid={`board-column-${status}`}
              className="flex flex-col gap-0"
            >
              <Card className="flex flex-col h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-semibold">
                      {STATUS_LABEL[status] ?? status}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs tabular-nums">
                      {colTasks.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent
                  data-testid={`board-column-dropzone-${status}`}
                  className={cn(
                    'flex flex-col overflow-y-auto transition-colors',
                    isDragOver && 'bg-primary/5 ring-2 ring-primary/30 ring-inset rounded-b-md',
                  )}
                  style={{ minHeight: 200, maxHeight: 'calc(100vh - 280px)' }}
                  onDragOver={(e) => handleDragOver(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  {colTasks.length > 0 ? (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-1"
                        draggable
                        onDragStart={(e) =>
                          handleCardDragStart(e, task.id, task.status ?? 'new')
                        }
                        onDragEnd={handleCardDragEnd}
                        data-testid={`board-card-wrapper-${task.id}`}
                        data-task-id={task.id}
                        data-task-status={task.status ?? 'new'}
                      >
                        {/* Bulk-select checkbox */}
                        <div className="pt-3.5 pl-0.5 shrink-0">
                          <input
                            type="checkbox"
                            data-testid={`bulk-select-${task.id}`}
                            checked={selectedTaskIds.includes(task.id)}
                            onChange={() => onBulkSelect(task.id)}
                            aria-label={`选择任务 ${task.title ?? task.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="size-3.5 rounded border-border accent-primary cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <WorkbenchTaskCard
                            task={task}
                            isSelected={selectedTaskId === task.id}
                            refreshSignal={refreshSignalsByTaskId[task.id] ?? null}
                            onSelect={onSelect}
                            onStatusChange={onStatusChange}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      {STATUS_LABEL[status]}暂无任务
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* ── Archived section ── */}
      <Card data-testid="board-archived-section">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Archived 收纳区</CardTitle>
              <Badge variant="outline" className="text-xs tabular-nums">
                {archivedTasks.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowArchived((prev) => !prev)}
            >
              {showArchived ? (
                <>
                  <ChevronUp className="mr-1 size-3" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 size-3" />
                  展开
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {showArchived ? (
          <CardContent>
            {archivedTasks.length > 0 ? (
              <div className="flex flex-col">
                {archivedTasks.map((task) => (
                  <WorkbenchTaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    refreshSignal={refreshSignalsByTaskId[task.id] ?? null}
                    onSelect={onSelect}
                    onStatusChange={onStatusChange}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">当前没有归档任务</p>
            )}
          </CardContent>
        ) : (
          <CardContent>
            <p className="text-xs text-muted-foreground">归档任务默认收起，避免占用主看板空间。</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
