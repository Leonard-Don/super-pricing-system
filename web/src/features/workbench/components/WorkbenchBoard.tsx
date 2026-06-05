// WorkbenchBoard — 4-column kanban board + archived section.
// Ported from frontend/src/components/research-workbench/WorkbenchBoardSection.js (395 lines).
// Presentation-only: tasks prop in, callbacks out. No HTML5 drag-drop.
//
// TODO (P3.5): HTML5 drag-drop reorder — deferred to P3.5 per plan.

import { ChevronDown, ChevronUp, Archive } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MAIN_STATUSES, STATUS_LABEL, sortByBoardOrder } from '@/features/workbench/lib/workbenchUtils';
import WorkbenchTaskCard, { type WorkbenchTask, type RefreshSignal } from './WorkbenchTaskCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkbenchBoardProps {
  /** Flat list of tasks (includes archived); board groups by status. */
  tasks: WorkbenchTask[];
  selectedTaskId: string | null;
  /** Lookup: taskId → refresh signal */
  refreshSignalsByTaskId: Record<string, RefreshSignal>;
  onSelect: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
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
}: WorkbenchBoardProps) {
  const [showArchived, setShowArchived] = useState(false);

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

  return (
    <div className="flex flex-col gap-4">
      {/* ── Main 4-column grid ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MAIN_STATUSES.map((status) => {
          const colTasks = tasksByStatus[status] ?? [];
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
                  className="flex flex-col overflow-y-auto"
                  style={{ minHeight: 200, maxHeight: 'calc(100vh - 280px)' }}
                >
                  {colTasks.length > 0 ? (
                    colTasks.map((task) => (
                      <WorkbenchTaskCard
                        key={task.id}
                        task={task}
                        isSelected={selectedTaskId === task.id}
                        refreshSignal={refreshSignalsByTaskId[task.id] ?? null}
                        onSelect={onSelect}
                        onStatusChange={onStatusChange}
                      />
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
