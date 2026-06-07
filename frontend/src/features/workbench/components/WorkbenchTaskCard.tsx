// WorkbenchTaskCard — single kanban card for a research task.
// Ported from frontend/src/components/research-workbench/WorkbenchTaskCard.js (369 lines).
// Presentation-only: props-in / callbacks-out. No drag-drop (see TODO below).
//
// TODO (P3.5): HTML5 drag-drop reorder — deferred to P3.5 per plan.

import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MAIN_STATUSES, STATUS_LABEL } from '@/features/workbench/lib/workbenchUtils';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkbenchTask {
  id: string;
  title?: string;
  type?: string;
  source?: string;
  status?: string;
  symbol?: string;
  template?: string;
  updated_at?: string;
  snapshot?: {
    headline?: string;
    payload?: Record<string, unknown>;
  } | null;
  [key: string]: unknown;
}

export interface RefreshSignal {
  refreshLabel?: string;
  refreshTone?: string;
  severity?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface WorkbenchTaskCardProps {
  task: WorkbenchTask;
  isSelected: boolean;
  refreshSignal: RefreshSignal | null;
  onSelect: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_CLASS: Record<string, string> = {
  pricing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  macro_mispricing: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  trade_thesis: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  cross_market: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const getTypeBadgeClass = (type: string | undefined): string =>
  TYPE_BADGE_CLASS[type ?? ''] ?? 'bg-muted text-muted-foreground';

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  high: 'bg-destructive/15 text-destructive border-destructive/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground',
};

const getRefreshBadgeClass = (signal: RefreshSignal): string =>
  SEVERITY_BADGE_CLASS[signal.severity ?? ''] ??
  (signal.refreshTone ? `bg-${signal.refreshTone}-500/15 text-${signal.refreshTone}-400` : 'bg-muted text-muted-foreground');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkbenchTaskCard({
  task,
  isSelected,
  refreshSignal,
  onSelect,
  onStatusChange,
}: WorkbenchTaskCardProps) {
  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // Don't bubble click-from-dropdown into the card select
    const target = event.target as HTMLElement;
    if (target.closest('[data-slot="dropdown-menu-trigger"]') || target.closest('[data-slot="dropdown-menu-content"]')) {
      return;
    }
    onSelect(task.id);
  };

  return (
    <div
      data-testid={`workbench-task-card-${task.id}`}
      className={cn(
        'rounded-xl border p-3 mb-2.5 cursor-pointer transition-colors',
        'bg-card/60 hover:bg-card/90',
        isSelected
          ? 'ring-2 ring-primary border-primary/40'
          : 'border-border/50 hover:border-border',
      )}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(task.id);
        }
      }}
    >
      {/* Header row: title + type badge */}
      <div className="flex flex-wrap items-start gap-1.5 mb-1.5">
        <span className="text-sm font-semibold text-foreground leading-snug flex-1 min-w-0">
          {task.title ?? '(无标题)'}
        </span>
        <Badge
          data-testid={`task-type-badge-${task.id}`}
          variant="outline"
          className={cn('shrink-0 text-xs', getTypeBadgeClass(task.type))}
        >
          {task.type ?? 'unknown'}
        </Badge>
      </div>

      {/* Refresh-signal badge (if present) */}
      {refreshSignal?.refreshLabel ? (
        <div className="mb-1.5">
          <Badge
            data-testid={`task-refresh-signal-badge-${task.id}`}
            variant="outline"
            className={cn('text-xs', getRefreshBadgeClass(refreshSignal))}
          >
            {refreshSignal.refreshLabel}
          </Badge>
        </div>
      ) : null}

      {/* Snapshot headline */}
      {task.snapshot?.headline ? (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
          {task.snapshot.headline}
        </p>
      ) : null}

      {/* Footer row: symbol/template · updated_at + status dropdown */}
      <div className="flex items-end justify-between gap-2 mt-1">
        <span className="text-xs text-muted-foreground truncate">
          {task.symbol ?? task.template ?? '-'} ·{' '}
          {task.updated_at ? new Date(task.updated_at).toLocaleDateString('zh-CN') : ''}
        </span>

        {/* Status-change dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-6 items-center rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 outline-none"
            aria-label="状态"
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_LABEL[task.status ?? ''] ?? task.status ?? '状态'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {MAIN_STATUSES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={task.status === s}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task.id, s);
                }}
              >
                {STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={task.status === 'archived'}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(task.id, 'archived');
              }}
            >
              {STATUS_LABEL['archived']}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
