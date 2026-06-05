// ---------------------------------------------------------------------------
// useResearchWorkbenchData — ported (TRIMMED) from
// frontend/src/components/research-workbench/useResearchWorkbenchData.js
//
// TRIMMED (deferred to P3.5 with TODO comments):
//   - Daily-briefing hook (buildDailyBriefingPayload / sendBriefing / ~1700 lines)
//   - AltDataCandidateQueue (convert / dismiss / snooze)
//   - Bulk actions (bulkUpdateResearchTasks)
//   - Drag/drop board reorder (reorderResearchBoard, dragState persistence)
//   - useWorkbenchQueueNavigation (queue mode / queue action navigation)
//
// KEPT:
//   - Board task list + stats
//   - Filters (type / source / status / keyword + full filter set)
//   - selectedTaskId + selected-task detail (getResearchTask + timeline parallel)
//   - Refresh signals (researchTaskSignals + live overview/snapshot)
//   - Status update (updateResearchTask)
//   - Comments (add / delete)
//   - Snapshot comparison via buildLatestSnapshotComparison in useSelectedTaskIntelligence
//   - URL sync (buildWorkbenchLink / popstate)
//   - Manual refresh
//   - Morning preset auto-apply
//   - Auto-refresh (document-visibility-gated)
// ---------------------------------------------------------------------------

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  getResearchTask,
  getResearchTaskStats,
  getResearchTasks,
  getResearchTaskTimeline,
  updateResearchTask,
  addResearchTaskComment,
  deleteResearchTaskComment,
} from '@/services/api/research';
import { getMacroOverview, getAltDataSnapshot } from '@/services/api/altDataAndMacro';
import { buildWorkbenchLink } from '@/features/godeye/lib/researchContext';
import { buildResearchTaskRefreshSignals } from '@/features/godeye/lib/researchTaskSignals';
import type { RefreshSignalItem } from '@/features/godeye/lib/researchTaskSignals';
import {
  buildRefreshStats,
  filterWorkbenchTasks,
} from '@/features/workbench/lib/workbenchSelectors';
import {
  MAIN_STATUSES,
  STATUS_LABEL,
  buildMorningWorkbenchPreset,
  buildMorningWorkbenchSessionKey,
  buildSnapshotViewSummaryOptions,
  hasActiveWorkbenchFilters,
  isMorningWorkbenchWindow,
  matchesWorkbenchFilterPreset,
  sortByBoardOrder,
} from '@/features/workbench/lib/workbenchUtils';
import { formatResearchSource } from '@/features/workbench/lib/helpers';
import useSelectedTaskIntelligence from './useSelectedTaskIntelligence';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_REFRESH_STORAGE_KEY = 'research_workbench_auto_refresh_v1';
const AUTO_REFRESH_INTERVAL_OPTIONS = [
  { label: '2 分钟', value: 2 * 60 * 1000 },
  { label: '5 分钟', value: 5 * 60 * 1000 },
  { label: '15 分钟', value: 15 * 60 * 1000 },
] as const;
const DEFAULT_AUTO_REFRESH_INTERVAL_MS = AUTO_REFRESH_INTERVAL_OPTIONS[1].value;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getErrorStatus = (error: unknown): number => {
  const e = error as Record<string, unknown>;
  return Number(
    (e?.response as Record<string, unknown>)?.status ?? e?.status ?? 0,
  );
};

const isNotFoundTaskError = (error: unknown): boolean =>
  [404, 410].includes(getErrorStatus(error));

const readAutoRefreshPreferences = (): {
  enabled?: boolean;
  intervalMs?: number;
} => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled:
        typeof parsed?.enabled === 'boolean' ? parsed.enabled : undefined,
      intervalMs:
        Number.isFinite(parsed?.intervalMs) &&
        (parsed.intervalMs as number) > 0
          ? (parsed.intervalMs as number)
          : undefined,
    };
  } catch {
    return {};
  }
};

const readWorkbenchContext = () => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    task: params.get('task') ?? '',
    workbenchType: params.get('workbench_type') ?? '',
    workbenchSource: params.get('workbench_source') ?? '',
    workbenchRefresh: params.get('workbench_refresh') ?? '',
    workbenchReason: params.get('workbench_reason') ?? '',
    workbenchSnapshotView: params.get('workbench_snapshot_view') ?? '',
    workbenchSnapshotFingerprint:
      params.get('workbench_snapshot_fingerprint') ?? '',
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary') ?? '',
    workbenchKeyword: params.get('workbench_keyword') ?? '',
  };
};

const formatClockTime = (value = ''): string => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const formatRelativeTime = (value = ''): string => {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${Math.floor(diffHours / 24)} 天前`;
};

const formatRefreshTriggerLabel = (value = 'initial'): string => {
  const mapping: Record<string, string> = {
    auto: '自动刷新',
    initial: '首次载入',
    manual: '手动刷新',
  };
  return mapping[value] ?? '手动刷新';
};

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

type WorkbenchTask = Record<string, unknown>;
type TimelineEntry = Record<string, unknown>;

interface WorkbenchFilters {
  type: string;
  source: string;
  refresh: string;
  reason: string;
  snapshotView: string;
  snapshotFingerprint: string;
  snapshotSummary: string;
  keyword: string;
}

// ---------------------------------------------------------------------------
// Reducers (avoid react-hooks/exhaustive-deps "setState in effect" lint rule
// by reducing multiple related fields atomically)
// ---------------------------------------------------------------------------

// Slice 1: live board payload
interface LiveState {
  loading: boolean;
  stats: Record<string, unknown> | null;
  liveOverview: Record<string, unknown> | null;
  liveSnapshot: Record<string, unknown> | null;
}

type LiveAction =
  | { type: 'load_start' }
  | { type: 'load_finish' }
  | {
      type: 'load_success';
      stats: Record<string, unknown> | null;
      liveOverview: Record<string, unknown> | null;
      liveSnapshot: Record<string, unknown> | null;
    };

const LIVE_INITIAL: LiveState = {
  loading: true,
  stats: null,
  liveOverview: null,
  liveSnapshot: null,
};

const liveReducer = (state: LiveState, action: LiveAction): LiveState => {
  switch (action.type) {
    case 'load_start':
      return { ...state, loading: true };
    case 'load_finish':
      return { ...state, loading: false };
    case 'load_success':
      return {
        ...state,
        stats: action.stats,
        liveOverview: action.liveOverview,
        liveSnapshot: action.liveSnapshot,
      };
    default:
      return state;
  }
};

// Slice 2: selected-task detail
interface DetailState {
  detailLoading: boolean;
  selectedTask: WorkbenchTask | null;
  timeline: TimelineEntry[];
  missingTaskNotice: { taskId: string; message: string } | null;
}

type DetailAction =
  | { type: 'detail_reset' }
  | { type: 'detail_load_start' }
  | { type: 'detail_load_finish' }
  | {
      type: 'detail_load_success';
      selectedTask: WorkbenchTask | null;
      timeline: TimelineEntry[];
    }
  | {
      type: 'detail_missing';
      missingTaskNotice: { taskId: string; message: string };
    }
  | {
      type: 'set_missing_notice';
      missingTaskNotice: { taskId: string; message: string } | null;
    };

const DETAIL_INITIAL: DetailState = {
  detailLoading: false,
  selectedTask: null,
  timeline: [],
  missingTaskNotice: null,
};

const detailReducer = (
  state: DetailState,
  action: DetailAction,
): DetailState => {
  switch (action.type) {
    case 'detail_reset':
      return { ...state, selectedTask: null, timeline: [] };
    case 'detail_load_start':
      return { ...state, detailLoading: true };
    case 'detail_load_finish':
      return { ...state, detailLoading: false };
    case 'detail_load_success':
      return {
        ...state,
        selectedTask: action.selectedTask,
        timeline: action.timeline,
      };
    case 'detail_missing':
      return {
        ...state,
        missingTaskNotice: action.missingTaskNotice,
        selectedTask: null,
        timeline: [],
      };
    case 'set_missing_notice':
      return { ...state, missingTaskNotice: action.missingTaskNotice };
    default:
      return state;
  }
};

// Slice 3: refresh metadata
interface RefreshState {
  lastRefreshAt: string;
  lastRefreshTrigger: string;
  lastAutoRefreshAt: string;
  autoRefreshRunCount: number;
}

type RefreshAction =
  | { type: 'refreshed'; refreshedAt: string; trigger: string }
  | { type: 'refreshed_auto'; refreshedAt: string; trigger: string };

const REFRESH_INITIAL: RefreshState = {
  lastRefreshAt: '',
  lastRefreshTrigger: 'initial',
  lastAutoRefreshAt: '',
  autoRefreshRunCount: 0,
};

const refreshReducer = (
  state: RefreshState,
  action: RefreshAction,
): RefreshState => {
  switch (action.type) {
    case 'refreshed':
      return {
        ...state,
        lastRefreshAt: action.refreshedAt,
        lastRefreshTrigger: action.trigger,
      };
    case 'refreshed_auto':
      return {
        lastRefreshAt: action.refreshedAt,
        lastRefreshTrigger: action.trigger,
        lastAutoRefreshAt: action.refreshedAt,
        autoRefreshRunCount: state.autoRefreshRunCount + 1,
      };
    default:
      return state;
  }
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default function useResearchWorkbenchData() {
  // -------------------------------------------------------------------------
  // One-time initialization values — computed via useState lazy initializers
  // so they are evaluated once on mount and never on re-renders.
  // This satisfies the react-hooks/refs rule (no ref.current during render).
  // -------------------------------------------------------------------------

  const [filters, setFilters] = useState<WorkbenchFilters>(() => {
    const ctx = readWorkbenchContext();
    return {
      type: ctx.workbenchType ?? '',
      source: ctx.workbenchSource ?? '',
      refresh: ctx.workbenchRefresh ?? '',
      reason: ctx.workbenchReason ?? '',
      snapshotView: ctx.workbenchSnapshotView ?? '',
      snapshotFingerprint: ctx.workbenchSnapshotFingerprint ?? '',
      snapshotSummary: ctx.workbenchSnapshotSummary ?? '',
      keyword: ctx.workbenchKeyword ?? '',
    };
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => {
    const ctx = readWorkbenchContext();
    return ctx.task ?? '';
  });

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    const prefs = readAutoRefreshPreferences();
    return prefs.enabled ?? true;
  });
  const [autoRefreshIntervalMs, setAutoRefreshIntervalMs] = useState<number>(
    () => {
      const prefs = readAutoRefreshPreferences();
      return prefs.intervalMs ?? DEFAULT_AUTO_REFRESH_INTERVAL_MS;
    },
  );

  // -------------------------------------------------------------------------
  // Reducers
  // -------------------------------------------------------------------------

  const [liveState, dispatchLive] = useReducer(liveReducer, LIVE_INITIAL);
  const { loading, stats, liveOverview, liveSnapshot } = liveState;

  const [detailState, dispatchDetail] = useReducer(detailReducer, DETAIL_INITIAL);
  const { detailLoading, selectedTask, timeline, missingTaskNotice } = detailState;

  const [tasks, setTasks] = useState<WorkbenchTask[]>([]);

  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [documentVisible, setDocumentVisible] = useState<boolean>(() =>
    typeof document === 'undefined'
      ? true
      : document.visibilityState !== 'hidden',
  );
  const [morningPresetSummary, setMorningPresetSummary] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [refreshState, dispatchRefresh] = useReducer(
    refreshReducer,
    REFRESH_INITIAL,
  );
  const {
    lastRefreshAt,
    lastRefreshTrigger,
    lastAutoRefreshAt,
    autoRefreshRunCount,
  } = refreshState;

  // -------------------------------------------------------------------------
  // Refs (mutation-only, never read during render)
  // -------------------------------------------------------------------------

  const taskDetailRequestRef = useRef(0);
  // pendingContextTaskIdRef is updated in async code and effects only
  const pendingContextTaskIdRef = useRef('');
  // hasInitialWorkbenchStateRef is read only inside effects
  const hasInitialWorkbenchStateRef = useRef<boolean | null>(null);
  const morningPresetAttemptedRef = useRef(false);

  // Lazily initialize hasInitialWorkbenchStateRef inside an effect on mount
  useEffect(() => {
    const ctx = readWorkbenchContext();
    pendingContextTaskIdRef.current = ctx.task ?? '';
    hasInitialWorkbenchStateRef.current = Boolean(
      ctx.task ||
        hasActiveWorkbenchFilters({
          type: ctx.workbenchType ?? '',
          source: ctx.workbenchSource ?? '',
          refresh: ctx.workbenchRefresh ?? '',
          reason: ctx.workbenchReason ?? '',
          snapshotView: ctx.workbenchSnapshotView ?? '',
          snapshotFingerprint: ctx.workbenchSnapshotFingerprint ?? '',
          snapshotSummary: ctx.workbenchSnapshotSummary ?? '',
          keyword: ctx.workbenchKeyword ?? '',
        }),
    );
    // This effect runs once on mount to set up refs from URL context.
    // hasInitialWorkbenchStateRef is only read in the morning-preset effect
    // which fires after tasks load (loading → false), so the ref is ready.
  }, []);

  // -------------------------------------------------------------------------
  // Derived: source options
  // -------------------------------------------------------------------------

  const sourceOptions = useMemo(() => {
    const uniqueSources = Array.from(
      new Set(
        tasks
          .map((t) => t.source as string | undefined)
          .filter((s): s is string => Boolean(s)),
      ),
    );
    return [
      { label: '全部来源', value: '' },
      ...uniqueSources.map((source) => ({
        label: formatResearchSource(source),
        value: source,
      })),
    ];
  }, [tasks]);

  // -------------------------------------------------------------------------
  // loadTaskDetail
  // -------------------------------------------------------------------------

  const loadTaskDetail = useCallback(async (taskId: string) => {
    if (!taskId) {
      dispatchDetail({ type: 'detail_reset' });
      return;
    }

    const requestId = ++taskDetailRequestRef.current;
    dispatchDetail({ type: 'detail_load_start' });
    try {
      const [taskResponse, timelineResponse] = await Promise.all([
        getResearchTask(taskId),
        getResearchTaskTimeline(taskId),
      ]);
      if (taskDetailRequestRef.current !== requestId) return;
      dispatchDetail({
        type: 'detail_load_success',
        selectedTask:
          (taskResponse as Record<string, unknown>)?.data as WorkbenchTask ??
          null,
        timeline:
          ((timelineResponse as Record<string, unknown>)?.data as TimelineEntry[]) ?? [],
      });
    } catch (error) {
      if (taskDetailRequestRef.current !== requestId) return;
      if (isNotFoundTaskError(error)) {
        dispatchDetail({
          type: 'detail_missing',
          missingTaskNotice: {
            taskId,
            message: '该研究任务不存在或已归档，已回到全部任务视图。',
          },
        });
        setSelectedTaskId((current) => (current === taskId ? '' : current));
      }
    } finally {
      if (taskDetailRequestRef.current === requestId) {
        dispatchDetail({ type: 'detail_load_finish' });
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // loadWorkbench
  // -------------------------------------------------------------------------

  const loadWorkbench = useCallback(
    async ({ trigger = 'manual' }: { trigger?: string } = {}) => {
      dispatchLive({ type: 'load_start' });
      try {
        const [taskResponse, statsResponse, macroResponse, altSnapshotResponse] =
          await Promise.all([
            getResearchTasks({ limit: 50, view: 'board' }),
            getResearchTaskStats(),
            getMacroOverview(false),
            getAltDataSnapshot(false),
          ]);
        let nextTasks =
          ((taskResponse as Record<string, unknown>)?.data as WorkbenchTask[]) ?? [];
        const contextTaskId =
          readWorkbenchContext().task || pendingContextTaskIdRef.current || '';
        if (
          contextTaskId &&
          !nextTasks.some((t) => t.id === contextTaskId)
        ) {
          try {
            const contextTaskResponse = await getResearchTask(contextTaskId);
            const contextTask =
              ((contextTaskResponse as Record<string, unknown>)?.data as WorkbenchTask) ??
              null;
            if (contextTask?.id) {
              nextTasks = [
                contextTask,
                ...nextTasks.filter((t) => t.id !== contextTask.id),
              ];
            }
          } catch (detailError) {
            if (isNotFoundTaskError(detailError)) {
              dispatchDetail({
                type: 'set_missing_notice',
                missingTaskNotice: {
                  taskId: contextTaskId,
                  message: '该研究任务不存在或已归档，已回到全部任务视图。',
                },
              });
              pendingContextTaskIdRef.current = '';
            }
          }
        }
        const hasContextTask =
          Boolean(contextTaskId) &&
          nextTasks.some((t) => t.id === contextTaskId);
        if (hasContextTask) {
          pendingContextTaskIdRef.current = '';
          dispatchDetail({
            type: 'set_missing_notice',
            missingTaskNotice: null,
          });
        }
        // Use startTransition so the state batch doesn't block the browser
        // paint and avoids react-hooks set-state-in-effect lint issues.
        startTransition(() => {
          setTasks(nextTasks);
          dispatchLive({
            type: 'load_success',
            stats:
              ((statsResponse as Record<string, unknown>)?.data as Record<
                string,
                unknown
              >) ?? null,
            liveOverview:
              (macroResponse as Record<string, unknown>) ?? null,
            liveSnapshot:
              (altSnapshotResponse as Record<string, unknown>) ?? null,
          });
          const refreshedAt = new Date().toISOString();
          if (trigger === 'auto') {
            dispatchRefresh({
              type: 'refreshed_auto',
              refreshedAt,
              trigger,
            });
          } else {
            dispatchRefresh({ type: 'refreshed', refreshedAt, trigger });
          }
          setSelectedTaskId((current) => {
            if (hasContextTask) return contextTaskId;
            if (current && nextTasks.some((t) => t.id === current))
              return current;
            return (nextTasks[0]?.id as string) ?? '';
          });
        });
        return true;
      } catch {
        return false;
      } finally {
        dispatchLive({ type: 'load_finish' });
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------

  useEffect(() => {
    void loadWorkbench({ trigger: 'initial' });
  }, [loadWorkbench]);

  // -------------------------------------------------------------------------
  // Load task detail when selectedTaskId changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    startTransition(() => {
      void loadTaskDetail(selectedTaskId);
    });
  }, [loadTaskDetail, selectedTaskId]);

  // -------------------------------------------------------------------------
  // Persist auto-refresh preferences
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        AUTO_REFRESH_STORAGE_KEY,
        JSON.stringify({
          enabled: autoRefreshEnabled,
          intervalMs: autoRefreshIntervalMs,
        }),
      );
    } catch {
      // ignore storage failures
    }
  }, [autoRefreshEnabled, autoRefreshIntervalMs]);

  // -------------------------------------------------------------------------
  // Document visibility tracking
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      setDocumentVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // -------------------------------------------------------------------------
  // URL sync
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextUrl = buildWorkbenchLink(
      {
        refresh: filters.refresh,
        type: filters.type,
        sourceFilter: filters.source,
        reason: filters.reason,
        snapshotView: filters.snapshotView,
        snapshotFingerprint: filters.snapshotFingerprint,
        snapshotSummary: filters.snapshotSummary,
        keyword: filters.keyword,
        taskId: selectedTaskId,
      },
      window.location.search,
    );
    window.history.replaceState(null, '', nextUrl);
  }, [
    filters.keyword,
    filters.reason,
    filters.refresh,
    filters.snapshotFingerprint,
    filters.snapshotSummary,
    filters.snapshotView,
    filters.source,
    filters.type,
    selectedTaskId,
  ]);

  // -------------------------------------------------------------------------
  // Browser back/forward sync
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePopState = () => {
      const ctx = readWorkbenchContext();
      pendingContextTaskIdRef.current = ctx.task ?? '';
      setFilters({
        type: ctx.workbenchType ?? '',
        source: ctx.workbenchSource ?? '',
        refresh: ctx.workbenchRefresh ?? '',
        reason: ctx.workbenchReason ?? '',
        snapshotView: ctx.workbenchSnapshotView ?? '',
        snapshotFingerprint: ctx.workbenchSnapshotFingerprint ?? '',
        snapshotSummary: ctx.workbenchSnapshotSummary ?? '',
        keyword: ctx.workbenchKeyword ?? '',
      });
      setSelectedTaskId(ctx.task ?? '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // -------------------------------------------------------------------------
  // refreshCurrentTask
  // -------------------------------------------------------------------------

  const refreshCurrentTask = useCallback(
    async ({ trigger = 'manual' }: { trigger?: string } = {}) => {
      const refreshed = await loadWorkbench({ trigger });
      if (selectedTaskId) {
        await loadTaskDetail(selectedTaskId);
      }
      return refreshed;
    },
    [loadTaskDetail, loadWorkbench, selectedTaskId],
  );

  // -------------------------------------------------------------------------
  // Auto-refresh timer
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !autoRefreshEnabled ||
      !lastRefreshAt ||
      loading ||
      detailLoading ||
      !documentVisible
    ) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      void refreshCurrentTask({ trigger: 'auto' });
    }, autoRefreshIntervalMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    autoRefreshEnabled,
    autoRefreshIntervalMs,
    detailLoading,
    documentVisible,
    lastRefreshAt,
    loading,
    refreshCurrentTask,
  ]);

  // -------------------------------------------------------------------------
  // Derived: refreshSignals + refreshStats + morning preset
  // -------------------------------------------------------------------------

  const refreshSignals = useMemo(() => {
    const result = buildResearchTaskRefreshSignals({
      researchTasks: tasks,
      overview: liveOverview ?? {},
      snapshot: liveSnapshot ?? {},
    });
    return (
      result ?? {
        prioritized: [] as RefreshSignalItem[],
        byTaskId: {} as Record<string, RefreshSignalItem>,
        byTemplateId: {} as Record<string, RefreshSignalItem>,
      }
    );
  }, [liveOverview, liveSnapshot, tasks]);

  const refreshStats = useMemo(
    () => buildRefreshStats(
      refreshSignals as unknown as Parameters<typeof buildRefreshStats>[0],
      tasks as unknown as Parameters<typeof buildRefreshStats>[1],
    ),
    [refreshSignals, tasks],
  );

  const morningPresetCandidate = useMemo(
    () => buildMorningWorkbenchPreset(refreshStats),
    [refreshStats],
  );

  const morningPresetActive = useMemo(
    () =>
      morningPresetCandidate
        ? matchesWorkbenchFilterPreset(
            filters as unknown as Parameters<typeof matchesWorkbenchFilterPreset>[0],
            morningPresetCandidate.filters,
          )
        : false,
    [filters, morningPresetCandidate],
  );

  const snapshotSummaryOptions = useMemo(() => {
    const queuedViews = stats?.snapshot_view_queues;
    return Array.isArray(queuedViews) && queuedViews.length
      ? queuedViews.map((item) => ({
          label: (item as Record<string, unknown>)?.label ?? (item as Record<string, unknown>)?.value ?? '',
          value: (item as Record<string, unknown>)?.value ?? (item as Record<string, unknown>)?.label ?? '',
          fingerprint: (item as Record<string, unknown>)?.fingerprint ?? '',
          count: Number((item as Record<string, unknown>)?.count ?? 0),
          scopedCount: Number(
            (item as Record<string, unknown>)?.scopedCount ??
              (item as Record<string, unknown>)?.scoped_count ??
              0,
          ),
          latestAt: (item as Record<string, unknown>)?.latestAt ?? (item as Record<string, unknown>)?.latest_at ?? '',
          typeCounts: (item as Record<string, unknown>)?.typeCounts ?? (item as Record<string, unknown>)?.type_counts ?? {},
        }))
      : buildSnapshotViewSummaryOptions(tasks as unknown as Parameters<typeof buildSnapshotViewSummaryOptions>[0]);
  }, [stats, tasks]);

  const filteredTasks = useMemo(
    () =>
      filterWorkbenchTasks(
        tasks as unknown as Parameters<typeof filterWorkbenchTasks>[0],
        filters as unknown as Parameters<typeof filterWorkbenchTasks>[1],
        refreshSignals.byTaskId as unknown as Parameters<typeof filterWorkbenchTasks>[2],
      ),
    [filters, refreshSignals.byTaskId, tasks],
  );

  // -------------------------------------------------------------------------
  // Morning preset auto-apply
  // -------------------------------------------------------------------------

  const applyMorningPreset = useCallback(
    ({
      source = 'manual',
      markSession = false,
    }: { source?: string; markSession?: boolean } = {}) => {
      if (!morningPresetCandidate) return false;
      const now = new Date();
      setFilters({
        type: '',
        source: '',
        refresh: '',
        reason: '',
        snapshotView: '',
        snapshotFingerprint: '',
        snapshotSummary: '',
        keyword: '',
        ...morningPresetCandidate.filters,
      });
      setMorningPresetSummary({
        ...morningPresetCandidate,
        appliedAt: now.toISOString(),
        appliedBy: source,
      });
      if (markSession && typeof window !== 'undefined') {
        const storageKey = buildMorningWorkbenchSessionKey(now);
        try {
          window.sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              appliedAt: now.toISOString(),
              label: morningPresetCandidate.label,
            }),
          );
        } catch {
          // ignore
        }
      }
      return true;
    },
    [morningPresetCandidate],
  );

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      morningPresetAttemptedRef.current ||
      hasInitialWorkbenchStateRef.current ||
      loading ||
      !tasks.length
    )
      return;
    morningPresetAttemptedRef.current = true;
    const now = new Date();
    if (!isMorningWorkbenchWindow(now)) return;
    const storageKey = buildMorningWorkbenchSessionKey(now);
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
    } catch {
      // ignore
    }
    if (!morningPresetCandidate) return;
    startTransition(() => {
      applyMorningPreset({ source: 'auto', markSession: true });
    });
  }, [applyMorningPreset, loading, morningPresetCandidate, tasks.length]);

  // -------------------------------------------------------------------------
  // Auto-select first task when filteredTasks changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!filteredTasks.length) {
      if (selectedTaskId && !loading && !pendingContextTaskIdRef.current) {
        startTransition(() => setSelectedTaskId(''));
      }
      return;
    }
    const hasSelectedTask = filteredTasks.some((t) => t.id === selectedTaskId);
    if (
      pendingContextTaskIdRef.current &&
      selectedTaskId === pendingContextTaskIdRef.current &&
      !hasSelectedTask
    ) {
      return;
    }
    if (!selectedTaskId || !hasSelectedTask) {
      const firstId = filteredTasks[0]?.id as string | undefined;
      if (firstId) startTransition(() => setSelectedTaskId(firstId));
    }
  }, [filteredTasks, loading, selectedTaskId]);

  // -------------------------------------------------------------------------
  // Derived: boardColumns + archivedTasks
  // -------------------------------------------------------------------------

  const boardColumns = useMemo(
    () =>
      MAIN_STATUSES.map((status) => ({
        status,
        title: STATUS_LABEL[status] ?? status,
        tasks: filteredTasks
          .filter((t) => t.status === status)
          .sort(sortByBoardOrder),
      })),
    [filteredTasks],
  );

  const archivedTasks = useMemo(
    () =>
      filteredTasks
        .filter((t) => t.status === 'archived')
        .sort((left, right) =>
          String(right.updated_at ?? '').localeCompare(
            String(left.updated_at ?? ''),
          ),
        ),
    [filteredTasks],
  );

  // -------------------------------------------------------------------------
  // Task intelligence (memoized via sub-hook)
  // -------------------------------------------------------------------------

  const taskIntelligence = useSelectedTaskIntelligence({
    selectedTaskId,
    selectedTask,
    refreshSignals,
    timeline,
    showAllTimeline,
  });

  // -------------------------------------------------------------------------
  // autoRefreshSummary
  // -------------------------------------------------------------------------

  const autoRefreshSummary = useMemo(() => {
    const intervalOption = AUTO_REFRESH_INTERVAL_OPTIONS.find(
      (item) => item.value === autoRefreshIntervalMs,
    );
    const intervalLabel =
      intervalOption?.label ??
      `${Math.round(autoRefreshIntervalMs / 60000)} 分钟`;
    const nextRefreshAt =
      autoRefreshEnabled && lastRefreshAt
        ? new Date(
            new Date(lastRefreshAt).getTime() + autoRefreshIntervalMs,
          ).toISOString()
        : '';
    return {
      enabled: autoRefreshEnabled,
      intervalMs: autoRefreshIntervalMs,
      intervalLabel,
      intervalOptions: AUTO_REFRESH_INTERVAL_OPTIONS,
      lastRefreshAt,
      lastRefreshLabel: lastRefreshAt
        ? `${formatClockTime(lastRefreshAt)} · ${formatRelativeTime(lastRefreshAt)}`
        : '等待首次刷新',
      lastRefreshTrigger,
      lastRefreshTriggerLabel: formatRefreshTriggerLabel(lastRefreshTrigger),
      lastAutoRefreshAt,
      lastAutoRefreshLabel: lastAutoRefreshAt
        ? formatClockTime(lastAutoRefreshAt)
        : '',
      nextRefreshAt,
      nextRefreshLabel: nextRefreshAt
        ? `下一次预计 ${formatClockTime(nextRefreshAt)}`
        : '自动刷新已暂停',
      runCount: autoRefreshRunCount,
      documentVisible,
      isRefreshing: loading || detailLoading,
      statusLabel: autoRefreshEnabled
        ? documentVisible
          ? `${intervalLabel} 自动刷新中`
          : `${intervalLabel} 自动刷新待恢复`
        : '自动刷新已关闭',
    };
  }, [
    autoRefreshEnabled,
    autoRefreshIntervalMs,
    autoRefreshRunCount,
    detailLoading,
    documentVisible,
    lastAutoRefreshAt,
    lastRefreshAt,
    lastRefreshTrigger,
    loading,
  ]);

  // -------------------------------------------------------------------------
  // Mutation helpers exposed to consumers
  // -------------------------------------------------------------------------

  const updateTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      const response = await updateResearchTask(taskId, {
        status,
      } as Parameters<typeof updateResearchTask>[1]);
      // Optimistically refresh board after status update
      void loadWorkbench({ trigger: 'manual' });
      return response;
    },
    [loadWorkbench],
  );

  const addComment = useCallback(
    async (taskId: string, text: string, author = 'local') => {
      const response = await addResearchTaskComment(
        taskId,
        // Cast via unknown: the generated schema uses {author, body}
        // but caller API exposes a simple (taskId, text) surface.
        { author, body: text } as unknown as Parameters<typeof addResearchTaskComment>[1],
      );
      // Reload task detail to show new comment in timeline
      await loadTaskDetail(taskId);
      return response;
    },
    [loadTaskDetail],
  );

  const deleteComment = useCallback(
    async (taskId: string, commentId: string) => {
      const response = await deleteResearchTaskComment(taskId, commentId);
      await loadTaskDetail(taskId);
      return response;
    },
    [loadTaskDetail],
  );

  // TODO (P3.5): daily-briefing hook (buildDailyBriefingPayload / sendBriefing)
  // TODO (P3.5): AltDataCandidateQueue (convert / dismiss / snooze)
  // TODO (P3.5): bulk actions (bulkUpdateResearchTasks)
  // TODO (P3.5): drag/drop board reorder persistence (reorderResearchBoard)

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // Board data
    archivedTasks,
    boardColumns,
    filteredTasks,
    tasks,
    setTasks,
    stats,

    // Filters
    filters,
    setFilters,
    sourceOptions,
    snapshotSummaryOptions,

    // Selected task
    selectedTaskId,
    setSelectedTaskId,
    selectedTask,
    detailLoading,
    timeline,
    missingTaskNotice,

    // Loading
    loading,

    // Refresh
    refreshSignals,
    refreshStats,
    refreshCurrentTask,
    loadWorkbench,
    loadTaskDetail,
    autoRefreshSummary,
    setAutoRefreshEnabled,
    setAutoRefreshIntervalMs,

    // Morning preset
    applyMorningPreset,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,

    // UI toggles
    showAllTimeline,
    setShowAllTimeline,
    showArchived,
    setShowArchived,

    // Mutations
    updateTaskStatus,
    addComment,
    deleteComment,

    // Task intelligence (spread from sub-hook)
    ...taskIntelligence,
  };
}
