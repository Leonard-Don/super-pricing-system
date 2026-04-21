import { useCallback, useEffect, useRef } from 'react';
import {
  getInfrastructureAuthProviders,
  getInfrastructureAuthUsers,
  getInfrastructurePersistenceDiagnostics,
  getInfrastructurePersistenceMigrationPreview,
  getInfrastructureRecords,
  getInfrastructureStatus,
  getInfrastructureTasks,
  getInfrastructureTimeseries,
  setApiAuthToken,
  setApiRefreshToken,
} from '../../services/api';

const INFRA_TASK_PAGE_SIZE = 20;
const PERSISTENCE_EXPLORER_LIMIT = 12;

const buildTaskQueryOptions = (filters, extra = {}) => ({
  limit: extra.limit || INFRA_TASK_PAGE_SIZE,
  cursor: extra.cursor,
  executionBackend: filters?.executionBackend,
  sortBy: filters?.sortBy,
  sortDirection: filters?.sortDirection,
  status: filters?.status,
  taskView: filters?.taskView,
});

function useQuantLabInfrastructureLifecycle({
  enabled = false,
  infraHydrated,
  infrastructureTaskFilters,
  infrastructureTaskPagination,
  message,
  setAuthProviders,
  setAuthSession,
  setAuthToken,
  setAuthUsers,
  setInfraHydrated,
  setInfraLoading,
  setInfrastructureRefreshState,
  setInfrastructureStatus,
  setInfrastructureTaskPagination,
  setInfrastructureTasks,
  setPersistenceDiagnostics,
  setPersistenceMigrationPreview,
  setPersistenceRecords,
  setPersistenceTimeseries,
  setRefreshSessions,
  setRefreshToken,
}) {
  const taskFiltersHydratedRef = useRef(false);

  const withSectionLoading = useCallback(async (sections, loader) => {
    const normalizedSections = Array.isArray(sections) ? sections : [sections];
    setInfrastructureRefreshState((current) => normalizedSections.reduce((next, section) => ({
      ...next,
      [section]: (next?.[section] || 0) + 1,
    }), { ...(current || {}) }));
    try {
      return await loader();
    } finally {
      setInfrastructureRefreshState((current) => normalizedSections.reduce((next, section) => ({
        ...next,
        [section]: Math.max(0, (next?.[section] || 0) - 1),
      }), { ...(current || {}) }));
    }
  }, [setInfrastructureRefreshState]);

  const applyInfrastructureTasksPayload = useCallback((tasksPayload, { append = false } = {}) => {
    const nextTasks = Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : [];
    setInfrastructureTasks((current) => {
      if (!append) {
        return nextTasks;
      }
      const seen = new Set((current || []).map((item) => item.id));
      return [
        ...(current || []),
        ...nextTasks.filter((item) => !seen.has(item.id)),
      ];
    });
    setInfrastructureTaskPagination((current) => ({
      ...(append ? (current || {}) : {}),
      hasMore: Boolean(tasksPayload?.has_more),
      loadingMore: false,
      nextCursor: tasksPayload?.next_cursor || '',
      pageSize: tasksPayload?.limit || current?.pageSize || INFRA_TASK_PAGE_SIZE,
      total: tasksPayload?.total || 0,
    }));
    return tasksPayload;
  }, [setInfrastructureTaskPagination, setInfrastructureTasks]);

  const applyInfrastructureAuthDirectoryPayload = useCallback((usersPayload) => {
    setAuthUsers(usersPayload?.users || []);
    setRefreshSessions(usersPayload?.sessions || []);
    return usersPayload;
  }, [setAuthUsers, setRefreshSessions]);

  const applyInfrastructureAuthProvidersPayload = useCallback((providersPayload) => {
    setAuthProviders(providersPayload?.providers || []);
    return providersPayload;
  }, [setAuthProviders]);

  const applyInfrastructurePersistencePayload = useCallback(({
    diagnosticsPayload,
    migrationPreviewPayload,
    recordsPayload,
    timeseriesPayload,
  }) => {
    setPersistenceDiagnostics(diagnosticsPayload || null);
    setPersistenceMigrationPreview(migrationPreviewPayload || null);
    setPersistenceRecords(recordsPayload?.records || []);
    setPersistenceTimeseries(timeseriesPayload?.timeseries || []);
    return {
      diagnostics: diagnosticsPayload,
      migrationPreview: migrationPreviewPayload,
      records: recordsPayload,
      timeseries: timeseriesPayload,
    };
  }, [
    setPersistenceDiagnostics,
    setPersistenceMigrationPreview,
    setPersistenceRecords,
    setPersistenceTimeseries,
  ]);

  const fetchInfrastructureSnapshot = useCallback(async ({
    includeStatus = false,
    includeTasks = false,
    includeAuthDirectory = false,
    includeAuthProviders = false,
    includePersistence = false,
  } = {}) => {
    const requestEntries = [];
    if (includeStatus) {
      requestEntries.push(['statusPayload', getInfrastructureStatus()]);
    }
    if (includeTasks) {
      requestEntries.push([
        'tasksPayload',
        getInfrastructureTasks(buildTaskQueryOptions(infrastructureTaskFilters)),
      ]);
    }
    if (includeAuthDirectory) {
      requestEntries.push(['usersPayload', getInfrastructureAuthUsers()]);
    }
    if (includeAuthProviders) {
      requestEntries.push(['providersPayload', getInfrastructureAuthProviders()]);
    }
    if (includePersistence) {
      requestEntries.push(['diagnosticsPayload', getInfrastructurePersistenceDiagnostics()]);
      requestEntries.push(['migrationPreviewPayload', getInfrastructurePersistenceMigrationPreview()]);
      requestEntries.push([
        'recordsPayload',
        getInfrastructureRecords({ limit: PERSISTENCE_EXPLORER_LIMIT }),
      ]);
      requestEntries.push([
        'timeseriesPayload',
        getInfrastructureTimeseries({ limit: PERSISTENCE_EXPLORER_LIMIT }),
      ]);
    }

    const entries = await Promise.all(
      requestEntries.map(async ([key, request]) => [key, await request]),
    );
    return Object.fromEntries(entries);
  }, [infrastructureTaskFilters]);

  const applyInfrastructureSnapshot = useCallback((snapshot, { hydrate = false } = {}) => {
    if (snapshot.statusPayload) {
      setInfrastructureStatus(snapshot.statusPayload);
    }
    if (snapshot.tasksPayload) {
      applyInfrastructureTasksPayload(snapshot.tasksPayload);
    }
    if (snapshot.usersPayload) {
      applyInfrastructureAuthDirectoryPayload(snapshot.usersPayload);
    }
    if (snapshot.providersPayload) {
      applyInfrastructureAuthProvidersPayload(snapshot.providersPayload);
    }

    const hasPersistencePayload = [
      'diagnosticsPayload',
      'migrationPreviewPayload',
      'recordsPayload',
      'timeseriesPayload',
    ].some((key) => key in snapshot);

    if (hasPersistencePayload) {
      applyInfrastructurePersistencePayload({
        diagnosticsPayload: snapshot.diagnosticsPayload,
        migrationPreviewPayload: snapshot.migrationPreviewPayload,
        recordsPayload: snapshot.recordsPayload,
        timeseriesPayload: snapshot.timeseriesPayload,
      });
    }

    if (hydrate) {
      setInfraHydrated(true);
    }

    return snapshot;
  }, [
    applyInfrastructureAuthDirectoryPayload,
    applyInfrastructureAuthProvidersPayload,
    applyInfrastructurePersistencePayload,
    applyInfrastructureTasksPayload,
    setInfraHydrated,
    setInfrastructureStatus,
  ]);

  const fetchFullInfrastructureSnapshot = useCallback(() => fetchInfrastructureSnapshot({
    includeStatus: true,
    includeTasks: true,
    includeAuthDirectory: true,
    includeAuthProviders: true,
    includePersistence: true,
  }), [fetchInfrastructureSnapshot]);

  const loadInfrastructureStatus = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading('overview', async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({ includeStatus: true });
        applyInfrastructureSnapshot(snapshot);
        return snapshot.statusPayload;
      } catch (error) {
        message.error(`刷新基础设施概览失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [applyInfrastructureSnapshot, enabled, fetchInfrastructureSnapshot, message, withSectionLoading]);

  const loadInfrastructureTasks = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading('tasks', async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({ includeTasks: true });
        applyInfrastructureSnapshot(snapshot);
        return snapshot.tasksPayload;
      } catch (error) {
        message.error(`刷新基础设施任务失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructureStatusAndTasks = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading(['overview', 'tasks'], async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({
          includeStatus: true,
          includeTasks: true,
        });
        applyInfrastructureSnapshot(snapshot);
        return {
          status: snapshot.statusPayload,
          tasks: snapshot.tasksPayload,
        };
      } catch (error) {
        message.error(`刷新基础设施任务状态失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructureAuthDirectory = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading('auth', async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({ includeAuthDirectory: true });
        applyInfrastructureSnapshot(snapshot);
        return snapshot.usersPayload;
      } catch (error) {
        message.error(`刷新基础设施认证目录失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructureAuthProviders = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading('auth', async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({ includeAuthProviders: true });
        applyInfrastructureSnapshot(snapshot);
        return snapshot.providersPayload;
      } catch (error) {
        message.error(`刷新 OAuth Provider 失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructureAuthSection = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading(['overview', 'auth'], async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({
          includeStatus: true,
          includeAuthDirectory: true,
          includeAuthProviders: true,
        });
        applyInfrastructureSnapshot(snapshot);
        return {
          providers: snapshot.providersPayload,
          status: snapshot.statusPayload,
          users: snapshot.usersPayload,
        };
      } catch (error) {
        message.error(`刷新认证中心失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructurePersistenceSection = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading(['overview', 'persistence'], async () => {
      try {
        const snapshot = await fetchInfrastructureSnapshot({
          includeStatus: true,
          includePersistence: true,
        });
        applyInfrastructureSnapshot(snapshot);
        return {
          diagnostics: snapshot.diagnosticsPayload,
          migrationPreview: snapshot.migrationPreviewPayload,
          records: snapshot.recordsPayload,
          status: snapshot.statusPayload,
          timeseries: snapshot.timeseriesPayload,
        };
      } catch (error) {
        message.error(`刷新持久化面板失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const refreshInfrastructureSections = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    return withSectionLoading(['overview', 'auth', 'persistence', 'tasks'], async () => {
      try {
        const snapshot = await fetchFullInfrastructureSnapshot();
        applyInfrastructureSnapshot(snapshot, { hydrate: true });
        return snapshot.statusPayload;
      } catch (error) {
        message.error(`刷新基础设施状态失败: ${error.userMessage || error.message}`);
        return null;
      }
    });
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchFullInfrastructureSnapshot,
    message,
    withSectionLoading,
  ]);

  const loadInfrastructure = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setInfraLoading(true);
    try {
      const snapshot = await fetchFullInfrastructureSnapshot();
      applyInfrastructureSnapshot(snapshot, { hydrate: true });
      return snapshot.statusPayload;
    } catch (error) {
      message.error(`加载基础设施状态失败: ${error.userMessage || error.message}`);
      return null;
    } finally {
      setInfraLoading(false);
    }
  }, [
    applyInfrastructureSnapshot,
    enabled,
    fetchFullInfrastructureSnapshot,
    message,
    setInfraLoading,
  ]);

  const loadMoreInfrastructureTasks = useCallback(async () => {
    if (!enabled || !infrastructureTaskPagination?.nextCursor || infrastructureTaskPagination?.loadingMore) {
      return null;
    }
    setInfrastructureTaskPagination((current) => ({
      ...(current || {}),
      loadingMore: true,
    }));
    try {
      const tasksPayload = await getInfrastructureTasks({
        ...buildTaskQueryOptions(infrastructureTaskFilters, {
          limit: infrastructureTaskPagination.pageSize || INFRA_TASK_PAGE_SIZE,
          cursor: infrastructureTaskPagination.nextCursor,
        }),
      });
      return applyInfrastructureTasksPayload(tasksPayload, { append: true });
    } catch (error) {
      setInfrastructureTaskPagination((current) => ({
        ...(current || {}),
        loadingMore: false,
      }));
      message.error(`加载更多基础设施任务失败: ${error.userMessage || error.message}`);
      return null;
    }
  }, [
    applyInfrastructureTasksPayload,
    enabled,
    infrastructureTaskFilters,
    infrastructureTaskPagination,
    message,
    setInfrastructureTaskPagination,
  ]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    if (!infraHydrated) {
      loadInfrastructure();
    }
    return undefined;
  }, [enabled, infraHydrated, loadInfrastructure]);

  useEffect(() => {
    if (!enabled) {
      taskFiltersHydratedRef.current = false;
      return undefined;
    }
    if (!infraHydrated) {
      return undefined;
    }
    if (!taskFiltersHydratedRef.current) {
      taskFiltersHydratedRef.current = true;
      return undefined;
    }
    loadInfrastructureTasks();
    return undefined;
  }, [enabled, infraHydrated, loadInfrastructureTasks]);

  const applyAuthSession = useCallback((response, successMessage) => {
    setAuthToken(response?.access_token || '');
    setApiAuthToken(response?.access_token || '');
    setRefreshToken(response?.refresh_token || '');
    setApiRefreshToken(response?.refresh_token || '');
    setAuthSession(response || null);
    if (successMessage) {
      message.success(successMessage);
    }
  }, [message, setAuthSession, setAuthToken, setRefreshToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleOAuthMessage = (event) => {
      if (!event?.data || event.data.type !== 'quant-oauth-callback') {
        return;
      }
      if (event.data.success && event.data.payload) {
        applyAuthSession(
          event.data.payload,
          `OAuth 登录成功: ${event.data.payload.user?.display_name || event.data.payload.user?.subject || event.data.provider_id}`,
        );
        loadInfrastructureStatus();
        loadInfrastructureAuthDirectory();
      } else {
        message.error(`OAuth 登录失败: ${event.data.error || '未知错误'}`);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, [applyAuthSession, loadInfrastructureAuthDirectory, loadInfrastructureStatus, message]);

  return {
    applyAuthSession,
    loadInfrastructureAuthDirectory,
    loadInfrastructureAuthProviders,
    loadInfrastructureAuthSection,
    loadInfrastructure,
    loadInfrastructurePersistenceSection,
    refreshInfrastructureSections,
    loadInfrastructureStatus,
    loadInfrastructureStatusAndTasks,
    loadInfrastructureTasks,
    loadMoreInfrastructureTasks,
  };
}

export default useQuantLabInfrastructureLifecycle;
