import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export default function useResearchWorkbenchData() {
  const message = useSafeMessageApi();
  const initialContext = readResearchContext();
  const initialAutoRefreshPreferences = readAutoRefreshPreferences();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [liveOverview, setLiveOverview] = useState(null);
  const [liveSnapshot, setLiveSnapshot] = useState(null);
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
  const [selectedTask, setSelectedTask] = useState(null);
  const [timeline, setTimeline] = useState([]);
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
  const [lastRefreshAt, setLastRefreshAt] = useState('');
  const [lastRefreshTrigger, setLastRefreshTrigger] = useState('initial');
  const [lastAutoRefreshAt, setLastAutoRefreshAt] = useState('');
  const [autoRefreshRunCount, setAutoRefreshRunCount] = useState(0);
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
      setSelectedTask(null);
      setTimeline([]);
      return;
    }

    const requestId = taskDetailRequestRef.current + 1;
    taskDetailRequestRef.current = requestId;
    setDetailLoading(true);
    try {
      const [taskResponse, timelineResponse] = await Promise.all([
        getResearchTask(taskId),
        getResearchTaskTimeline(taskId),
      ]);
      if (taskDetailRequestRef.current !== requestId) {
        return;
      }
      setSelectedTask(taskResponse.data || null);
      setTimeline(timelineResponse.data || []);
    } catch (error) {
      if (taskDetailRequestRef.current !== requestId) {
        return;
      }
      message.error(getApiErrorMessage(error, '加载任务详情失败'));
      setSelectedTask(null);
      setTimeline([]);
    } finally {
      if (taskDetailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, [message]);

  const loadWorkbench = useCallback(async ({ trigger = 'manual' } = {}) => {
    setLoading(true);
    try {
      const [taskResponse, statsResponse, macroResponse, altSnapshotResponse] = await Promise.all([
        getResearchTasks({ limit: 200, view: 'board' }),
        getResearchTaskStats(),
        getMacroOverview(false),
        getAltDataSnapshot(false),
      ]);
      let nextTasks = taskResponse.data || [];
      const contextTaskId = readResearchContext().task || pendingContextTaskIdRef.current || '';
      if (contextTaskId && !nextTasks.some((task) => task.id === contextTaskId)) {
        try {
          const contextTaskResponse = await getResearchTask(contextTaskId);
          const contextTask = contextTaskResponse?.data || null;
          if (contextTask?.id) {
            nextTasks = [contextTask, ...nextTasks.filter((task) => task.id !== contextTask.id)];
          }
        } catch (detailError) {
          // Ignore direct-link enrichment failures here and let the regular detail loader surface errors.
        }
      }
      const hasContextTask = Boolean(contextTaskId) && nextTasks.some((task) => task.id === contextTaskId);
      if (hasContextTask) {
        pendingContextTaskIdRef.current = '';
      }
      setTasks(nextTasks);
      setStats(statsResponse.data || null);
      setLiveOverview(macroResponse || null);
      setLiveSnapshot(altSnapshotResponse || null);
      const refreshedAt = new Date().toISOString();
      setLastRefreshAt(refreshedAt);
      setLastRefreshTrigger(trigger);
      if (trigger === 'auto') {
        setLastAutoRefreshAt(refreshedAt);
        setAutoRefreshRunCount((current) => current + 1);
      }
      setSelectedTaskId((current) => {
        if (hasContextTask) {
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
      setLoading(false);
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
