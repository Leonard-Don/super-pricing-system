import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  getAltDataSnapshot,
  getMacroOverview,
  getResearchTask,
  getResearchTaskStats,
  getResearchTasks,
  getResearchTaskTimeline,
} from '../../services/api';
import {
  buildWorkbenchLink,
  formatResearchSource,
  readResearchContext,
} from '../../utils/researchContext';
import { buildResearchTaskRefreshSignals } from '../../utils/researchTaskSignals';
import { getApiErrorMessage, useSafeMessageApi } from '../../utils/messageApi';
import {
  buildRefreshStats,
  filterWorkbenchTasks,
} from './workbenchSelectors';
import {
  MAIN_STATUSES,
  buildMorningWorkbenchPreset,
  buildMorningWorkbenchSessionKey,
  buildSnapshotViewSummaryOptions,
  hasActiveWorkbenchFilters,
  isMorningWorkbenchWindow,
  matchesWorkbenchFilterPreset,
  sortByBoardOrder,
  STATUS_LABEL,
} from './workbenchUtils';
import useWorkbenchQueueNavigation from './useWorkbenchQueueNavigation';
import useSelectedTaskIntelligence from './useSelectedTaskIntelligence';

const AUTO_REFRESH_STORAGE_KEY = 'research_workbench_auto_refresh_v1';
const AUTO_REFRESH_INTERVAL_OPTIONS = [
  { label: '2 分钟', value: 2 * 60 * 1000 },
  { label: '5 分钟', value: 5 * 60 * 1000 },
  { label: '15 分钟', value: 15 * 60 * 1000 },
];
const DEFAULT_AUTO_REFRESH_INTERVAL_MS = AUTO_REFRESH_INTERVAL_OPTIONS[1].value;

const getErrorStatus = (error) => Number(error?.response?.status || error?.status || 0);
const isNotFoundTaskError = (error) => [404, 410].includes(getErrorStatus(error));

const readAutoRefreshPreferences = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : undefined,
      intervalMs: Number.isFinite(parsed?.intervalMs) && parsed.intervalMs > 0
        ? parsed.intervalMs
        : undefined,
    };
  } catch (error) {
    return {};
  }
};

const formatClockTime = (value = '') => {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch (error) {
    return '';
  }
};

const formatRelativeTime = (value = '') => {
  if (!value) {
    return '';
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes <= 0) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  return `${Math.floor(diffHours / 24)} 天前`;
};

const formatRefreshTriggerLabel = (value = 'initial') => {
  const mapping = {
    auto: '自动刷新',
    initial: '首次载入',
    manual: '手动刷新',
  };
  return mapping[value] || '手动刷新';
};

// --- State slices ---------------------------------------------------------
// The hook previously held ~23 separate useState fields. The slices below
// group the cohesive, internal-only state into useReducer reducers so each
// concern updates atomically. None of these fields' setters are part of the
// hook's public return value, so consolidating them does not change the
// hook's external interface — every returned value/setter is byte-identical.

// Slice 1: live workbench payload loaded by loadWorkbench().
const LIVE_INITIAL_STATE = {
  loading: true,
  stats: null,
  liveOverview: null,
  liveSnapshot: null,
};

const liveReducer = (state, action) => {
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

// Slice 2: selected-task detail (task body, timeline, loading, missing notice).
const DETAIL_INITIAL_STATE = {
  detailLoading: false,
  selectedTask: null,
  timeline: [],
  missingTaskNotice: null,
};

const detailReducer = (state, action) => {
  switch (action.type) {
    case 'detail_reset':
      // Mirrors the no-taskId branch of loadTaskDetail: clear task + timeline.
      return { ...state, selectedTask: null, timeline: [] };
    case 'detail_load_start':
      return { ...state, detailLoading: true };
    case 'detail_load_finish':
      return { ...state, detailLoading: false };
    case 'detail_load_success':
      return { ...state, selectedTask: action.selectedTask, timeline: action.timeline };
    case 'detail_missing':
      // 404/410 path: record the notice and clear the stale task + timeline.
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

// Slice 3: refresh metadata surfaced through autoRefreshSummary.
const REFRESH_INITIAL_STATE = {
  lastRefreshAt: '',
  lastRefreshTrigger: 'initial',
  lastAutoRefreshAt: '',
  autoRefreshRunCount: 0,
};

const refreshReducer = (state, action) => {
  switch (action.type) {
    case 'refreshed':
      // A non-auto refresh records the timestamp + trigger only.
      return {
        ...state,
        lastRefreshAt: action.refreshedAt,
        lastRefreshTrigger: action.trigger,
      };
    case 'refreshed_auto':
      // An auto refresh additionally stamps lastAutoRefreshAt and bumps the
      // run counter — equivalent to the prior functional setState increment.
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

export default function useResearchWorkbenchData() {
  const message = useSafeMessageApi();
  const initialContext = readResearchContext();
  const initialAutoRefreshPreferences = readAutoRefreshPreferences();
  const [liveState, dispatchLive] = useReducer(liveReducer, LIVE_INITIAL_STATE);
  const { loading, stats, liveOverview, liveSnapshot } = liveState;
  const [detailState, dispatchDetail] = useReducer(detailReducer, DETAIL_INITIAL_STATE);
  const {
    detailLoading,
    selectedTask,
    timeline,
    missingTaskNotice,
  } = detailState;
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState({
    type: initialContext.workbenchType || '',
    source: initialContext.workbenchSource || '',
    refresh: initialContext.workbenchRefresh || '',
    reason: initialContext.workbenchReason || '',
    snapshotView: initialContext.workbenchSnapshotView || '',
    snapshotFingerprint: initialContext.workbenchSnapshotFingerprint || '',
    snapshotSummary: initialContext.workbenchSnapshotSummary || '',
    keyword: initialContext.workbenchKeyword || '',
  });
  const [workbenchQueueMode, setWorkbenchQueueMode] = useState(initialContext.workbenchQueueMode || '');
  const [workbenchQueueAction, setWorkbenchQueueAction] = useState(initialContext.workbenchQueueAction || '');
  const [selectedTaskId, setSelectedTaskId] = useState(initialContext.task || '');
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    initialAutoRefreshPreferences.enabled ?? true
  );
  const [autoRefreshIntervalMs, setAutoRefreshIntervalMs] = useState(
    initialAutoRefreshPreferences.intervalMs || DEFAULT_AUTO_REFRESH_INTERVAL_MS
  );
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );
  const [refreshState, dispatchRefresh] = useReducer(refreshReducer, REFRESH_INITIAL_STATE);
  const {
    lastRefreshAt,
    lastRefreshTrigger,
    lastAutoRefreshAt,
    autoRefreshRunCount,
  } = refreshState;
  const [morningPresetSummary, setMorningPresetSummary] = useState(null);
  const taskDetailRequestRef = useRef(0);
  const pendingContextTaskIdRef = useRef(initialContext.task || '');
  const hasInitialWorkbenchStateRef = useRef(Boolean(
    initialContext.task
    || initialContext.workbenchQueueMode
    || initialContext.workbenchQueueAction
    || hasActiveWorkbenchFilters({
      type: initialContext.workbenchType || '',
      source: initialContext.workbenchSource || '',
      refresh: initialContext.workbenchRefresh || '',
      reason: initialContext.workbenchReason || '',
      snapshotView: initialContext.workbenchSnapshotView || '',
      snapshotFingerprint: initialContext.workbenchSnapshotFingerprint || '',
      snapshotSummary: initialContext.workbenchSnapshotSummary || '',
      keyword: initialContext.workbenchKeyword || '',
    })
  ));
  const morningPresetAttemptedRef = useRef(false);

  const sourceOptions = useMemo(() => {
    const uniqueSources = Array.from(new Set(tasks.map((task) => task.source).filter(Boolean)));
    return [
      { label: '全部来源', value: '' },
      ...uniqueSources.map((source) => ({
        label: formatResearchSource(source),
        value: source,
      })),
    ];
  }, [tasks]);

  const loadTaskDetail = useCallback(async (taskId) => {
    if (!taskId) {
      dispatchDetail({ type: 'detail_reset' });
      return;
    }

    const requestId = taskDetailRequestRef.current + 1;
    taskDetailRequestRef.current = requestId;
    dispatchDetail({ type: 'detail_load_start' });
    try {
      const [taskResponse, timelineResponse] = await Promise.all([
        getResearchTask(taskId),
        getResearchTaskTimeline(taskId),
      ]);
      if (taskDetailRequestRef.current !== requestId) {
        return;
      }
      dispatchDetail({
        type: 'detail_load_success',
        selectedTask: taskResponse.data || null,
        timeline: timelineResponse.data || [],
      });
    } catch (error) {
      if (taskDetailRequestRef.current !== requestId) {
        return;
      }
      message.error(getApiErrorMessage(error, '加载任务详情失败'));
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
  }, [message]);

  const loadWorkbench = useCallback(async ({ trigger = 'manual' } = {}) => {
    dispatchLive({ type: 'load_start' });
    try {
      // 50 per status × 4 statuses = 200 visible cards is plenty for the
      // kanban view. Previously this hit 200 tasks landing in a single
      // column at peak, producing a ~60k-pixel-tall scroll body (see
      // dogfood audit V9). The CSS cap below also bounds the column body
      // height so a future spike can't recreate the problem.
      const [taskResponse, statsResponse, macroResponse, altSnapshotResponse] = await Promise.all([
        getResearchTasks({ limit: 50, view: 'board' }),
        getResearchTaskStats(),
        getMacroOverview(false),
        getAltDataSnapshot(false),
      ]);
      let nextTasks = taskResponse.data || [];
      let contextTaskLookupFailedTransiently = false;
      const contextTaskId = readResearchContext().task || pendingContextTaskIdRef.current || '';
      if (contextTaskId && !nextTasks.some((task) => task.id === contextTaskId)) {
        try {
          const contextTaskResponse = await getResearchTask(contextTaskId);
          const contextTask = contextTaskResponse?.data || null;
          if (contextTask?.id) {
            nextTasks = [contextTask, ...nextTasks.filter((task) => task.id !== contextTask.id)];
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
          } else {
            contextTaskLookupFailedTransiently = true;
            message.error(getApiErrorMessage(detailError, '加载任务详情失败'));
          }
        }
      }
      const hasContextTask = Boolean(contextTaskId) && nextTasks.some((task) => task.id === contextTaskId);
      if (hasContextTask) {
        pendingContextTaskIdRef.current = '';
        dispatchDetail({ type: 'set_missing_notice', missingTaskNotice: null });
      }
      setTasks(nextTasks);
      dispatchLive({
        type: 'load_success',
        stats: statsResponse.data || null,
        liveOverview: macroResponse || null,
        liveSnapshot: altSnapshotResponse || null,
      });
      const refreshedAt = new Date().toISOString();
      if (trigger === 'auto') {
        dispatchRefresh({ type: 'refreshed_auto', refreshedAt, trigger });
      } else {
        dispatchRefresh({ type: 'refreshed', refreshedAt, trigger });
      }
      setSelectedTaskId((current) => {
        if (hasContextTask || contextTaskLookupFailedTransiently) {
          return contextTaskId;
        }
        if (current && nextTasks.some((task) => task.id === current)) {
          return current;
        }
        return nextTasks[0]?.id || '';
      });
      return true;
    } catch (error) {
      message.error(getApiErrorMessage(error, '加载研究工作台失败'));
      return false;
    } finally {
      dispatchLive({ type: 'load_finish' });
    }
  }, [message]);

  useEffect(() => {
    loadWorkbench({ trigger: 'initial' });
  }, [loadWorkbench]);

  useEffect(() => {
    loadTaskDetail(selectedTaskId);
  }, [loadTaskDetail, selectedTaskId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      window.localStorage.setItem(
        AUTO_REFRESH_STORAGE_KEY,
        JSON.stringify({
          enabled: autoRefreshEnabled,
          intervalMs: autoRefreshIntervalMs,
        })
      );
    } catch (error) {
      // Ignore storage failures so the workbench keeps working.
    }

    return undefined;
  }, [autoRefreshEnabled, autoRefreshIntervalMs]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      setDocumentVisible(document.visibilityState !== 'hidden');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
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
        queueMode: workbenchQueueMode,
        queueAction: workbenchQueueAction,
        taskId: selectedTaskId,
      },
      window.location.search
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
    workbenchQueueAction,
    workbenchQueueMode,
  ]);

  useEffect(() => {
    const handlePopState = () => {
      const nextContext = readResearchContext();
      pendingContextTaskIdRef.current = nextContext.task || '';
      setFilters((current) => ({
        ...current,
        type: nextContext.workbenchType || '',
        source: nextContext.workbenchSource || '',
        refresh: nextContext.workbenchRefresh || '',
        reason: nextContext.workbenchReason || '',
        snapshotView: nextContext.workbenchSnapshotView || '',
        snapshotFingerprint: nextContext.workbenchSnapshotFingerprint || '',
        snapshotSummary: nextContext.workbenchSnapshotSummary || '',
        keyword: nextContext.workbenchKeyword || '',
      }));
      setWorkbenchQueueMode(nextContext.workbenchQueueMode || '');
      setWorkbenchQueueAction(nextContext.workbenchQueueAction || '');
      setSelectedTaskId(nextContext.task || '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const refreshCurrentTask = useCallback(async ({ trigger = 'manual' } = {}) => {
    const refreshed = await loadWorkbench({ trigger });
    if (selectedTaskId) {
      await loadTaskDetail(selectedTaskId);
    }
    return refreshed;
  }, [loadTaskDetail, loadWorkbench, selectedTaskId]);

  useEffect(() => {
    if (
      typeof window === 'undefined'
      || !autoRefreshEnabled
      || !lastRefreshAt
      || loading
      || detailLoading
      || !documentVisible
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      refreshCurrentTask({ trigger: 'auto' });
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

  const refreshSignals = useMemo(
    () => buildResearchTaskRefreshSignals({ researchTasks: tasks, overview: liveOverview, snapshot: liveSnapshot }) || {
      prioritized: [],
      byTaskId: {},
    },
    [liveOverview, liveSnapshot, tasks]
  );

  const refreshStats = useMemo(() => buildRefreshStats(refreshSignals, tasks), [refreshSignals, tasks]);
  const morningPresetCandidate = useMemo(
    () => buildMorningWorkbenchPreset(refreshStats),
    [refreshStats]
  );
  const morningPresetActive = useMemo(
    () => (
      morningPresetCandidate
        ? matchesWorkbenchFilterPreset(filters, morningPresetCandidate.filters)
        : false
    ),
    [filters, morningPresetCandidate]
  );
  const snapshotSummaryOptions = useMemo(() => {
    const queuedViews = stats?.snapshot_view_queues;
    return Array.isArray(queuedViews) && queuedViews.length
      ? queuedViews.map((item) => ({
        label: item?.label || item?.value || '',
        value: item?.value || item?.label || '',
        fingerprint: item?.fingerprint || '',
        count: Number(item?.count || 0),
        scopedCount: Number(item?.scopedCount ?? item?.scoped_count ?? 0),
        latestAt: item?.latestAt || item?.latest_at || '',
        typeCounts: item?.typeCounts || item?.type_counts || {},
      }))
      : buildSnapshotViewSummaryOptions(tasks);
  }, [stats, tasks]);

  const filteredTasks = useMemo(
    () => filterWorkbenchTasks(tasks, filters, refreshSignals.byTaskId),
    [filters, refreshSignals.byTaskId, tasks]
  );

  const applyMorningPreset = useCallback(({ source = 'manual', markSession = false } = {}) => {
    if (!morningPresetCandidate) {
      return false;
    }

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
          })
        );
      } catch (error) {
        // Ignore sessionStorage failures and keep the current page functional.
      }
    }
    return true;
  }, [morningPresetCandidate]);

  useEffect(() => {
    if (
      typeof window === 'undefined'
      || morningPresetAttemptedRef.current
      || hasInitialWorkbenchStateRef.current
      || loading
      || !tasks.length
    ) {
      return;
    }

    morningPresetAttemptedRef.current = true;
    const now = new Date();
    if (!isMorningWorkbenchWindow(now)) {
      return;
    }

    const storageKey = buildMorningWorkbenchSessionKey(now);
    try {
      if (window.sessionStorage.getItem(storageKey)) {
        return;
      }
    } catch (error) {
      // Ignore sessionStorage failures and continue without the one-time guard.
    }

    if (!morningPresetCandidate) {
      return;
    }

    applyMorningPreset({ source: 'auto', markSession: true });
  }, [applyMorningPreset, loading, morningPresetCandidate, tasks.length]);

  useWorkbenchQueueNavigation({
    tasks,
    filters,
    filteredTasks,
    refreshSignals,
    selectedTaskId,
    setSelectedTaskId,
    workbenchQueueMode,
    workbenchQueueAction,
    setWorkbenchQueueAction,
    message,
  });

  useEffect(() => {
    const queueContext = readResearchContext();
    const queuedTaskId = queueContext.task || pendingContextTaskIdRef.current || '';
    if (!filteredTasks.length) {
      if (workbenchQueueAction === 'next_same_type' && queuedTaskId) {
        if (selectedTaskId !== queuedTaskId) {
          setSelectedTaskId(queuedTaskId);
        }
        return;
      }
      if (selectedTaskId && !loading && !pendingContextTaskIdRef.current) {
        setSelectedTaskId('');
      }
      return;
    }
    if (workbenchQueueAction === 'next_same_type' && queuedTaskId) {
      const hasQueuedTask = filteredTasks.some((task) => task.id === queuedTaskId);
      const hasSelectedTask = filteredTasks.some((task) => task.id === selectedTaskId);
      if (!hasSelectedTask && hasQueuedTask) {
        setSelectedTaskId(queuedTaskId);
      }
      return;
    }
    const hasSelectedTask = filteredTasks.some((task) => task.id === selectedTaskId);
    if (pendingContextTaskIdRef.current && selectedTaskId === pendingContextTaskIdRef.current && !hasSelectedTask) {
      return;
    }
    if (!selectedTaskId || !hasSelectedTask) {
      setSelectedTaskId(filteredTasks[0].id);
    }
  }, [filteredTasks, loading, selectedTaskId, workbenchQueueAction]);

  const boardColumns = useMemo(
    () =>
      MAIN_STATUSES.map((status) => ({
        status,
        title: STATUS_LABEL[status],
        tasks: filteredTasks.filter((task) => task.status === status).sort(sortByBoardOrder),
      })),
    [filteredTasks]
  );

  const archivedTasks = useMemo(
    () =>
      filteredTasks
        .filter((task) => task.status === 'archived')
        .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || ''))),
    [filteredTasks]
  );

  const taskIntelligence = useSelectedTaskIntelligence({
    selectedTaskId,
    selectedTask,
    refreshSignals,
    timeline,
    showAllTimeline,
  });

  const autoRefreshSummary = useMemo(() => {
    const intervalOption = AUTO_REFRESH_INTERVAL_OPTIONS.find((item) => item.value === autoRefreshIntervalMs);
    const intervalLabel = intervalOption?.label || `${Math.round(autoRefreshIntervalMs / 60000)} 分钟`;
    const nextRefreshAt = autoRefreshEnabled && lastRefreshAt
      ? new Date(new Date(lastRefreshAt).getTime() + autoRefreshIntervalMs).toISOString()
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
      lastAutoRefreshLabel: lastAutoRefreshAt ? formatClockTime(lastAutoRefreshAt) : '',
      nextRefreshAt,
      nextRefreshLabel: nextRefreshAt ? `下一次预计 ${formatClockTime(nextRefreshAt)}` : '自动刷新已暂停',
      runCount: autoRefreshRunCount,
      documentVisible,
      isRefreshing: loading || detailLoading,
      statusLabel: autoRefreshEnabled
        ? (documentVisible ? `${intervalLabel} 自动刷新中` : `${intervalLabel} 自动刷新待恢复`)
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

  return {
    archivedTasks,
    applyMorningPreset,
    autoRefreshSummary,
    boardColumns,
    detailLoading,
    dragState,
    filteredTasks,
    filters,
    loadTaskDetail,
    loadWorkbench,
    loading,
    missingTaskNotice,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,
    refreshCurrentTask,
    refreshSignals,
    refreshStats,
    snapshotSummaryOptions,
    selectedTask,
    selectedTaskId,
    setAutoRefreshEnabled,
    setAutoRefreshIntervalMs,
    setDragState,
    setFilters,
    setSelectedTaskId,
    setShowAllTimeline,
    setShowArchived,
    showAllTimeline,
    showArchived,
    sourceOptions,
    stats,
    tasks,
    setTasks,
    timeline,
    workbenchQueueAction,
    workbenchQueueMode,
    setWorkbenchQueueAction,
    setWorkbenchQueueMode,
    ...taskIntelligence,
  };
}
