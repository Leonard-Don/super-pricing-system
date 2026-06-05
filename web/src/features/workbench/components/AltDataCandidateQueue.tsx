/**
 * AltDataCandidateQueue — alt-data candidate queue for the workbench.
 *
 * Renders the pending alt-data candidate list with per-row
 * convert / dismiss / snooze action buttons, an empty/loading state,
 * and a refresh button.  Consumes useAltDataCandidates; no props required.
 * shadcn semantic tokens only.  No `any`.
 */

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import useAltDataCandidates from '@/features/workbench/hooks/useAltDataCandidates';
import type { components } from '@/generated/api-types';

type AltDataCandidate = components['schemas']['AltDataCandidate'];

// ---------------------------------------------------------------------------
// Sub-component: one candidate row
// ---------------------------------------------------------------------------

interface CandidateRowProps {
  candidate: AltDataCandidate;
  onConvert: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
}

function CandidateRow({ candidate, onConvert, onDismiss, onSnooze }: CandidateRowProps) {
  const { candidate_id, headline, source_component, signal_type, industry, impact_score, state } =
    candidate;

  return (
    <div
      data-testid={`candidate-row-${candidate_id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm"
    >
      {/* headline + meta */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{headline}</span>
        <Badge
          variant="outline"
          className="shrink-0 text-xs capitalize"
        >
          {state}
        </Badge>
      </div>

      {/* meta row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{source_component}</span>
        <span>·</span>
        <span>{signal_type}</span>
        <span>·</span>
        <span>{industry}</span>
        <span>·</span>
        <span>影响: {impact_score.toFixed(2)}</span>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2">
        <Button
          data-testid={`candidate-convert-${candidate_id}`}
          size="sm"
          variant="default"
          className="h-7 px-2.5 text-xs"
          onClick={() => onConvert(candidate_id)}
        >
          转为任务
        </Button>
        <Button
          data-testid={`candidate-snooze-${candidate_id}`}
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          onClick={() => onSnooze(candidate_id)}
        >
          延后
        </Button>
        <Button
          data-testid={`candidate-dismiss-${candidate_id}`}
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs text-muted-foreground"
          onClick={() => onDismiss(candidate_id)}
        >
          忽略
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AltDataCandidateQueue() {
  const { candidates, loading, error, refresh, convert, dismiss, snooze } =
    useAltDataCandidates();

  return (
    <section
      data-testid="alt-data-candidate-queue"
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">另类数据候选队列</h2>
        <Button
          data-testid="alt-data-refresh-btn"
          size="sm"
          variant="outline"
          onClick={() => { void refresh(); }}
          disabled={loading}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Error */}
      {error && (
        <p
          data-testid="alt-data-candidate-error"
          className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {/* Loading skeleton */}
      {loading && candidates.length === 0 && (
        <div data-testid="alt-data-candidate-loading" className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && candidates.length === 0 && !error && (
        <p
          data-testid="alt-data-candidate-empty"
          className="py-6 text-center text-sm text-muted-foreground"
        >
          暂无候选数据信号
        </p>
      )}

      {/* Candidate list */}
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          {candidates.map((c) => (
            <CandidateRow
              key={c.candidate_id}
              candidate={c}
              onConvert={convert}
              onDismiss={dismiss}
              onSnooze={snooze}
            />
          ))}
        </div>
      )}
    </section>
  );
}
