// WorkbenchDetailPanel — selected-task right panel.
// Ported from frontend/src/components/research-workbench/WorkbenchDetailPanel.js (253 lines)
// + WorkbenchDetailSections.js (413 lines).
//
// Presentation-only: props-in / callbacks-out.
// Snapshot-compare area is added in Task 8 — a placeholder slot is left.
//
// TODO (P3.5): queue navigation, matching-queue navigation — deferred per plan.

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  STATUS_LABEL,
  formatContextValue,
  TIMELINE_COLOR,
  formatTimelineType,
} from '@/features/workbench/lib/workbenchUtils';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkbenchComment {
  id: string;
  body: string;
  author?: string;
  created_at: string;
}

export interface WorkbenchTask {
  id: string;
  title?: string;
  type?: string;
  source?: string;
  status?: string;
  symbol?: string;
  template?: string;
  note?: string;
  updated_at?: string;
  context?: Record<string, unknown>;
  comments?: WorkbenchComment[];
  [key: string]: unknown;
}

export interface TimelineItemChild {
  label: string;
  type: string;
  color?: string;
  changeLabel?: string;
  changeColor?: string;
  snapshotViewSummary?: string;
  snapshotViewFocus?: string;
  snapshotViewNote?: string;
  detail?: string;
  createdAt: string;
}

export interface TimelineItem {
  color: string;
  dot: 'comment' | 'clock' | string;
  children: TimelineItemChild;
}

export interface WorkbenchDetailPanelProps {
  selectedTask: WorkbenchTask | null;
  timeline: Record<string, unknown>[];
  timelineItems?: TimelineItem[];
  onStatusChange: (newStatus: string) => void;
  onAddComment: (body: string) => void;
  onDeleteComment: (commentId: string) => void;
  saving?: boolean;
  /** Optional: rendered inside the snapshot slot (Task 8 fills this). */
  snapshotSlot?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// STATUS badge colour
// ---------------------------------------------------------------------------

const STATUS_BADGE_CLASS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_progress: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  blocked: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  complete: 'bg-green-500/15 text-green-400 border-green-500/30',
  archived: 'bg-muted text-muted-foreground',
};

const getStatusBadgeClass = (status: string | undefined): string =>
  STATUS_BADGE_CLASS[status ?? ''] ?? 'bg-muted text-muted-foreground';

// ---------------------------------------------------------------------------
// TimelineSection
// ---------------------------------------------------------------------------

function TimelineSection({
  timeline,
  timelineItems,
}: {
  timeline: Record<string, unknown>[];
  timelineItems?: TimelineItem[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Build items from raw timeline if pre-built items are not provided
  const items: TimelineItem[] = timelineItems ?? timeline.map((event) => {
    const eventType = String(event.type ?? '');
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    return {
      color: TIMELINE_COLOR[eventType] ?? 'gray',
      dot: eventType === 'comment_added' ? 'comment' : 'clock',
      children: {
        label: String(meta.label ?? meta.note ?? formatTimelineType(eventType)),
        type: formatTimelineType(eventType),
        color: TIMELINE_COLOR[eventType] ?? 'gray',
        createdAt: String(event.created_at ?? ''),
      },
    };
  });

  const displayed = showAll ? items : items.slice(0, 8);
  const canToggle = items.length > 8;

  return (
    <Card size="sm" data-testid="timeline-section">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm">研究时间线</CardTitle>
        {canToggle && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll ? '收起' : '展开更多'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {displayed.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无时间线事件</p>
        ) : (
          <ol className="space-y-3">
            {displayed.map((item, index) => (
              <li key={index} className="flex gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 size-2 shrink-0 rounded-full ring-1 ring-offset-background ring-offset-1',
                    item.color === 'blue' && 'bg-blue-400 ring-blue-400/40',
                    item.color === 'orange' && 'bg-amber-400 ring-amber-400/40',
                    item.color === 'green' && 'bg-green-400 ring-green-400/40',
                    item.color === 'purple' && 'bg-purple-400 ring-purple-400/40',
                    item.color === 'cyan' && 'bg-cyan-400 ring-cyan-400/40',
                    item.color === 'red' && 'bg-red-400 ring-red-400/40',
                    item.color === 'gold' && 'bg-yellow-400 ring-yellow-400/40',
                    !['blue', 'orange', 'green', 'purple', 'cyan', 'red', 'gold'].includes(item.color) &&
                      'bg-muted-foreground ring-muted-foreground/40',
                  )}
                />
                <div className="flex-1 space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{item.children.label}</span>
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      {item.children.type}
                    </Badge>
                    {item.children.changeLabel && (
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {item.children.changeLabel}
                      </Badge>
                    )}
                    {item.children.snapshotViewSummary && (
                      <Badge variant="outline" className="text-xs px-1 py-0 bg-green-500/10 text-green-400">
                        研究视角
                      </Badge>
                    )}
                  </div>
                  {item.children.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.children.createdAt).toLocaleString('zh-CN')}
                    </p>
                  )}
                  {item.children.detail && (
                    <p className="text-xs text-muted-foreground">{item.children.detail}</p>
                  )}
                  {item.children.snapshotViewSummary && (
                    <p className="text-xs text-muted-foreground">
                      工作台视角 {item.children.snapshotViewSummary}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CommentsSection
// ---------------------------------------------------------------------------

function CommentsSection({
  comments,
  saving,
  onAddComment,
  onDeleteComment,
}: {
  comments: WorkbenchComment[];
  saving: boolean;
  onAddComment: (body: string) => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const handleSubmit = () => {
    if (!draft.trim()) return;
    onAddComment(draft.trim());
    setDraft('');
  };

  return (
    <Card size="sm" data-testid="comments-section">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">评论</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          data-testid="comment-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="记录这一步的判断、风险或下一步动作"
          className="resize-none"
        />
        <Button
          data-testid="add-comment-button"
          size="sm"
          onClick={handleSubmit}
          disabled={!draft.trim() || saving}
        >
          添加评论
        </Button>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无评论</p>
        ) : (
          <ul className="space-y-2 mt-1">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border border-border/50 p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{comment.author ?? 'local'}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <Button
                    data-testid={`delete-comment-${comment.id}`}
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => onDeleteComment(comment.id)}
                    disabled={saving}
                  >
                    删除
                  </Button>
                </div>
                <p className="text-sm">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StatusSection
// ---------------------------------------------------------------------------

function StatusSection({
  status,
  saving,
  onStatusChange,
}: {
  status: string | undefined;
  saving: boolean;
  onStatusChange: (newStatus: string) => void;
}) {
  const isArchived = status === 'archived';

  return (
    <Card size="sm" data-testid="status-section">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">状态流转</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {isArchived ? (
            <Button
              data-testid="status-btn-restore"
              size="sm"
              onClick={() => onStatusChange('new')}
              disabled={saving}
            >
              恢复到新建
            </Button>
          ) : (
            <>
              <Button
                data-testid="status-btn-new"
                variant="outline"
                size="sm"
                onClick={() => onStatusChange('new')}
                disabled={saving}
              >
                {STATUS_LABEL['new']}
              </Button>
              <Button
                data-testid="status-btn-in_progress"
                variant="outline"
                size="sm"
                onClick={() => onStatusChange('in_progress')}
                disabled={saving}
              >
                {STATUS_LABEL['in_progress']}
              </Button>
              <Button
                data-testid="status-btn-blocked"
                variant="outline"
                size="sm"
                onClick={() => onStatusChange('blocked')}
                disabled={saving}
              >
                {STATUS_LABEL['blocked']}
              </Button>
              <Button
                data-testid="status-btn-complete"
                size="sm"
                onClick={() => onStatusChange('complete')}
                disabled={saving}
              >
                {STATUS_LABEL['complete']}
              </Button>
              <Button
                data-testid="status-btn-archived"
                variant="outline"
                size="sm"
                onClick={() => onStatusChange('archived')}
                disabled={saving}
              >
                {STATUS_LABEL['archived']}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel
// ---------------------------------------------------------------------------

export default function WorkbenchDetailPanel({
  selectedTask,
  timeline,
  timelineItems,
  onStatusChange,
  onAddComment,
  onDeleteComment,
  saving = false,
  snapshotSlot,
}: WorkbenchDetailPanelProps) {
  return (
    <div data-testid="workbench-detail-panel" className="flex flex-col gap-4">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">任务详情</h3>
        {selectedTask && (
          <Badge
            data-testid="detail-status-badge"
            variant="outline"
            className={cn('text-xs', getStatusBadgeClass(selectedTask.status))}
          >
            {selectedTask.status}
          </Badge>
        )}
      </div>

      {/* Empty state */}
      {!selectedTask ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/50">
          <p className="text-sm text-muted-foreground">请选择一个研究任务</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Task meta card */}
          <Card size="sm">
            <CardContent className="pt-3 space-y-2">
              {/* Tag row */}
              <div className="flex flex-wrap gap-1.5">
                {selectedTask.type && (
                  <Badge
                    data-testid="detail-type-badge"
                    variant="outline"
                    className="text-xs"
                  >
                    {selectedTask.type}
                  </Badge>
                )}
                {selectedTask.symbol && (
                  <Badge
                    data-testid="detail-symbol-badge"
                    variant="outline"
                    className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30"
                  >
                    {selectedTask.symbol}
                  </Badge>
                )}
                {selectedTask.template && (
                  <Badge
                    data-testid="detail-template-badge"
                    variant="outline"
                    className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30"
                  >
                    {selectedTask.template}
                  </Badge>
                )}
              </div>

              {/* Title */}
              <p className="text-sm font-semibold leading-snug">
                {selectedTask.title ?? selectedTask.id}
              </p>

              {/* Note */}
              {selectedTask.note && (
                <p className="text-sm text-muted-foreground">{selectedTask.note}</p>
              )}
            </CardContent>
          </Card>

          {/* Context tags */}
          {selectedTask.context && Object.keys(selectedTask.context).length > 0 && (
            <Card size="sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">任务上下文</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selectedTask.context)
                    .filter(([key]) => key !== 'screener_filters')
                    .map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {formatContextValue(value)}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Snapshot placeholder — Task 8 fills this slot */}
          <div data-testid="snapshot-slot">
            {snapshotSlot ?? null}
          </div>

          {/* Timeline */}
          <TimelineSection timeline={timeline} timelineItems={timelineItems} />

          {/* Comments */}
          <CommentsSection
            comments={selectedTask.comments ?? []}
            saving={saving}
            onAddComment={onAddComment}
            onDeleteComment={onDeleteComment}
          />

          {/* Status change */}
          <StatusSection
            status={selectedTask.status}
            saving={saving}
            onStatusChange={onStatusChange}
          />
        </div>
      )}
    </div>
  );
}
