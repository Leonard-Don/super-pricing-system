// ---------------------------------------------------------------------------
// useSelectedTaskIntelligence — ported from
// frontend/src/components/research-workbench/useSelectedTaskIntelligence.js
// ---------------------------------------------------------------------------

import { useMemo } from 'react';

import {
  buildLatestSnapshotComparison,
  buildOpenTaskPriorityLabel,
  buildOpenTaskPriorityNote,
  buildRefreshPriorityEventPayload,
  buildRefreshPriorityMeta,
  buildTimelineItems,
} from '@/features/workbench/lib/workbenchSelectors';
import type { RefreshSignalItem } from '@/features/godeye/lib/researchTaskSignals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkbenchTask = Record<string, unknown>;
type TimelineEntry = Record<string, unknown>;

interface UseSelectedTaskIntelligenceParams {
  selectedTaskId: string;
  selectedTask: WorkbenchTask | null;
  refreshSignals: {
    byTaskId: Record<string, RefreshSignalItem>;
    prioritized: RefreshSignalItem[];
  };
  timeline: TimelineEntry[];
  showAllTimeline: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useSelectedTaskIntelligence({
  selectedTaskId,
  selectedTask,
  refreshSignals,
  timeline,
  showAllTimeline,
}: UseSelectedTaskIntelligenceParams) {
  const selectedTaskRefreshSignal = selectedTaskId
    ? (refreshSignals.byTaskId[selectedTaskId] ?? null)
    : null;

  // The selector functions use an internal `RefreshSignal` / `WorkbenchTask`
  // interface that is structurally identical to `RefreshSignalItem` /
  // `Record<string,unknown>` but not assignment-compatible due to `null` vs
  // `undefined` on shift fields. Cast through `unknown` at each call site.
  type RS = Parameters<typeof buildOpenTaskPriorityLabel>[0];
  type WT = Parameters<typeof buildOpenTaskPriorityNote>[0];

  const signalArg = selectedTaskRefreshSignal as unknown as RS;
  const taskArg = selectedTask as unknown as WT;

  const openTaskPriorityLabel = useMemo(
    () => buildOpenTaskPriorityLabel(signalArg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTaskRefreshSignal],
  );

  const openTaskPriorityNote = useMemo(
    () => buildOpenTaskPriorityNote(taskArg, signalArg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTask, selectedTaskRefreshSignal],
  );

  const selectedTaskPriorityMeta = useMemo(
    () => buildRefreshPriorityMeta(signalArg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTaskRefreshSignal],
  );

  const selectedTaskPriorityEventPayload = useMemo(
    () =>
      buildRefreshPriorityEventPayload(
        signalArg,
        selectedTaskPriorityMeta,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTaskPriorityMeta, selectedTaskRefreshSignal],
  );

  const latestSnapshotComparison = useMemo(
    () => buildLatestSnapshotComparison(taskArg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTask],
  );

  type TLEntry = Parameters<typeof buildTimelineItems>[0];
  const timelineItems = useMemo(
    () =>
      buildTimelineItems(
        timeline as unknown as TLEntry,
        showAllTimeline,
        taskArg,
        signalArg,
        selectedTaskPriorityMeta,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedTask,
      selectedTaskPriorityMeta,
      selectedTaskRefreshSignal,
      showAllTimeline,
      timeline,
    ],
  );

  return {
    selectedTaskRefreshSignal,
    openTaskPriorityLabel,
    openTaskPriorityNote,
    selectedTaskPriorityMeta,
    selectedTaskPriorityEventPayload,
    latestSnapshotComparison,
    timelineItems,
  };
}
