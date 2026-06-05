// WorkbenchShell — page chrome for the research workbench.
// Ported from frontend/src/components/research-workbench/WorkbenchShell.js (116 lines).
// Props-in / callbacks-out; no internal state.

import { FolderOpen, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeroMetric {
  label: string;
  value: string | number;
}

interface ContextItem {
  title: string;
  detail: string;
}

interface MissingTaskNotice {
  message?: string;
  taskId?: string;
}

export interface WorkbenchShellProps {
  /** Summary stats shown in the hero strip */
  heroMetrics?: HeroMetric[];
  /** Context items displayed in the rail below the hero */
  contextItems?: ContextItem[];
  /** Fires when the user clicks "copy view link" */
  onCopyViewLink: () => void;
  /** When present, renders a missing-task warning */
  missingTaskNotice?: MissingTaskNotice | null;
  /** Page content slot */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkbenchShell({
  heroMetrics = [],
  contextItems = [],
  onCopyViewLink,
  missingTaskNotice,
  children,
}: WorkbenchShellProps) {
  return (
    <div
      className="flex flex-col gap-4 w-full"
      data-testid="workbench-page"
    >
      {/* ── Hero ── */}
      <section
        className="rounded-xl border border-border bg-card p-5"
        data-testid="workbench-hero"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: eyebrow + heading */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              任务闭环
            </span>
            <div className="flex items-center gap-2">
              <FolderOpen className="size-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">研究工作台</h2>
            </div>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              把当前筛选队列、任务详情和重开入口放到同一个地方，方便先决定"现在看哪条、下一步做什么"。
            </p>
          </div>

          {/* Right: metric strip */}
          {heroMetrics.length > 0 && (
            <div className="flex flex-wrap gap-3 shrink-0">
              {heroMetrics.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center rounded-lg border border-border bg-muted/40 px-4 py-2 min-w-[64px]"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-lg font-semibold text-foreground tabular-nums">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Context rail ── */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              当前视图
            </span>
            <h3 className="mt-0.5 text-sm font-semibold text-foreground">当前视图与下一步</h3>
          </div>
          <Button size="sm" variant="outline" onClick={onCopyViewLink}>
            复制当前视图链接
          </Button>
        </div>

        {/* Missing-task alert */}
        {missingTaskNotice ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">
                {missingTaskNotice.message ??
                  '该研究任务不存在或已归档，已回到全部任务视图。'}
              </span>
              {missingTaskNotice.taskId ? (
                <span className="text-muted-foreground">
                  {`任务 ID：${missingTaskNotice.taskId}`}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  你可以复制当前有效链接，或从下方最近任务继续选择。
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* Context items grid */}
        {contextItems.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {contextItems.map((item) => (
              <div key={item.title} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{item.title}</span>
                <span className="text-sm font-medium text-foreground">{item.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Page children ── */}
      {children}
    </div>
  );
}
