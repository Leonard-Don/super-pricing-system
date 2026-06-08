// WorkbenchShell — page chrome for the research workbench.
// Ported from frontend/src/components/research-workbench/WorkbenchShell.js (116 lines).
// Props-in / callbacks-out; no internal state.
//
// Command-center premium design applied: glass hero, DataNumber metric chips,
// SectionFrame context rail — appearance-only, no logic changes.

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataNumber, GlassPanel, SectionFrame, TacticalBackdrop, Reveal } from '@/components/command';

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
      {/* ── Command hero strip ── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-primary/15 p-7"
        style={{ background: 'var(--cmd-grad)' }}
        data-testid="workbench-hero"
      >
        <TacticalBackdrop grid radar />
        <Reveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {/* Left: eyebrow + heading */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cmd-ink2)]">
                <span className="text-primary">◢</span> 任务闭环 · RESEARCH WORKBENCH
              </span>
              <h2 className="text-lg font-semibold leading-snug text-white">研究工作台</h2>
              <p className="mt-0.5 max-w-prose text-sm text-white/70">
                把当前筛选队列、任务详情和重开入口放到同一个地方，方便先决定"现在看哪条、下一步做什么"。
              </p>
            </div>

            {/* Right: metric chips — DataNumber for tabular counts */}
            {heroMetrics.length > 0 && (
              <div className="flex flex-wrap gap-3 shrink-0">
                {heroMetrics.map((item) => (
                  <GlassPanel
                    key={item.label}
                    className="flex flex-col items-center px-4 py-2.5 min-w-[72px]"
                  >
                    <span className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">
                      {item.label}
                    </span>
                    <DataNumber
                      value={item.value}
                      tone="default"
                      className="text-xl font-semibold"
                    />
                  </GlassPanel>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {/* ── Context rail ── */}
      <GlassPanel className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionFrame title="当前视图与下一步" latin="CONTEXT" />
          </div>
          <Button size="sm" variant="outline" onClick={onCopyViewLink}
            className="shrink-0 border-white/20 text-white/80 hover:bg-white/10"
          >
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
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {contextItems.map((item) => (
              <div key={item.title} className="flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-wider text-[var(--cmd-ink3)]">{item.title}</span>
                <span className="text-sm font-medium text-foreground">{item.detail}</span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* ── Page children ── */}
      {children}
    </div>
  );
}
