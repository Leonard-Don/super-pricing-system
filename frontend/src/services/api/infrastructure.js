import { api, withTimeoutProfile } from './core';

/**
 * 基础设施领域 API：系统状态、任务、持久化、迁移、限流、认证（账号/Token/OAuth）、通知通道、配置版本。
 * 路由前缀：`/infrastructure/*`
 */

export const getInfrastructureStatus = async () => {
  const response = await api.get('/infrastructure/status', withTimeoutProfile('standard'));
  return response.data;
};

export const createInfrastructureTask = async (payload) => {
  const response = await api.post('/infrastructure/tasks', payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 持久化 ============
export const saveInfrastructureRecord = async (payload) => {
  const response = await api.post('/infrastructure/persistence/records', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructurePersistenceDiagnostics = async () => {
  const response = await api.get('/infrastructure/persistence/diagnostics', withTimeoutProfile('standard'));
  return response.data;
};

export const bootstrapInfrastructurePersistence = async (payload) => {
  const response = await api.post('/infrastructure/persistence/bootstrap', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructurePersistenceMigrationPreview = async ({ sqlitePath } = {}) => {
  const params = new URLSearchParams();
  if (sqlitePath) params.set('sqlite_path', sqlitePath);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await api.get(`/infrastructure/persistence/migration/preview${suffix}`, withTimeoutProfile('standard'));
  return response.data;
};

export const runInfrastructurePersistenceMigration = async (payload) => {
  const response = await api.post('/infrastructure/persistence/migration/run', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructureRecords = async ({ recordType, limit = 20 } = {}) => {
  const params = new URLSearchParams();
  if (recordType) params.set('record_type', recordType);
  params.set('limit', String(limit));
  const response = await api.get(`/infrastructure/persistence/records?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

export const saveInfrastructureTimeseries = async (payload) => {
  const response = await api.post('/infrastructure/persistence/timeseries', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructureTimeseries = async ({ seriesName, symbol, limit = 20 } = {}) => {
  const params = new URLSearchParams();
  if (seriesName) params.set('series_name', seriesName);
  if (symbol) params.set('symbol', symbol);
  params.set('limit', String(limit));
  const response = await api.get(`/infrastructure/persistence/timeseries?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 任务管理 ============
export const getInfrastructureTasks = async (options = 20) => {
  const normalizedOptions = typeof options === 'number' ? { limit: options } : (options || {});
  const params = new URLSearchParams();
  params.set('limit', String(normalizedOptions.limit || 20));
  if (normalizedOptions.cursor) {
    params.set('cursor', normalizedOptions.cursor);
  }
  if (normalizedOptions.taskView && normalizedOptions.taskView !== 'all') {
    params.set('task_view', normalizedOptions.taskView);
  }
  if (normalizedOptions.status && normalizedOptions.status !== 'all') {
    params.set('status', normalizedOptions.status);
  }
  if (normalizedOptions.executionBackend && normalizedOptions.executionBackend !== 'all') {
    params.set('execution_backend', normalizedOptions.executionBackend);
  }
  if (normalizedOptions.sortBy) {
    params.set('sort_by', normalizedOptions.sortBy);
  }
  if (normalizedOptions.sortDirection) {
    params.set('sort_direction', normalizedOptions.sortDirection);
  }
  const response = await api.get(`/infrastructure/tasks?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

export const cancelInfrastructureTask = async (taskId) => {
  const response = await api.post(`/infrastructure/tasks/${encodeURIComponent(taskId)}/cancel`, undefined, withTimeoutProfile('standard'));
  return response.data;
};

export const updateInfrastructureRateLimits = async (payload) => {
  const response = await api.post('/infrastructure/rate-limits', payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 认证（Token / 账号 / OAuth Provider） ============
export const createInfrastructureToken = async (payload) => {
  const response = await api.post('/infrastructure/auth/token', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const loginInfrastructureUser = async (payload) => {
  const response = await api.post('/infrastructure/auth/login', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const refreshInfrastructureToken = async (payload) => {
  const response = await api.post('/infrastructure/auth/refresh', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructureAuthUsers = async () => {
  const response = await api.get('/infrastructure/auth/users', withTimeoutProfile('standard'));
  return response.data;
};

export const saveInfrastructureAuthUser = async (payload) => {
  const response = await api.post('/infrastructure/auth/users', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const updateInfrastructureAuthPolicy = async (payload) => {
  const response = await api.post('/infrastructure/auth/policy', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const revokeInfrastructureAuthSession = async (sessionId) => {
  const response = await api.post(`/infrastructure/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, undefined, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructureAuthProviders = async () => {
  const response = await api.get('/infrastructure/auth/oauth/providers', withTimeoutProfile('standard'));
  return response.data;
};

export const saveInfrastructureAuthProvider = async (payload) => {
  const response = await api.post('/infrastructure/auth/oauth/providers', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const syncInfrastructureAuthProvidersFromEnv = async () => {
  const response = await api.post('/infrastructure/auth/oauth/providers/sync-env', undefined, withTimeoutProfile('standard'));
  return response.data;
};

export const getInfrastructureAuthProviderDiagnostics = async (providerId) => {
  const response = await api.get(`/infrastructure/auth/oauth/providers/${encodeURIComponent(providerId)}/diagnostics`, withTimeoutProfile('standard'));
  return response.data;
};

export const startInfrastructureOAuthProvider = async (providerId, payload = {}) => {
  const response = await api.post(`/infrastructure/auth/oauth/providers/${encodeURIComponent(providerId)}/authorize`, payload, withTimeoutProfile('standard'));
  return response.data;
};

export const exchangeInfrastructureOAuthProvider = async (providerId, payload) => {
  const response = await api.post(`/infrastructure/auth/oauth/providers/${encodeURIComponent(providerId)}/exchange`, payload, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 通知通道 ============
export const testNotificationChannel = async (payload) => {
  const response = await api.post('/infrastructure/notifications/test', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const saveNotificationChannel = async (payload) => {
  const response = await api.post('/infrastructure/notifications/channels', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const deleteNotificationChannel = async (channelId) => {
  const response = await api.delete(`/infrastructure/notifications/channels/${encodeURIComponent(channelId)}`, withTimeoutProfile('standard'));
  return response.data;
};

// ============ 配置版本 ============
export const saveConfigVersion = async (payload) => {
  const response = await api.post('/infrastructure/config-versions', payload, withTimeoutProfile('standard'));
  return response.data;
};

export const getConfigVersions = async ({ configType, configKey, ownerId = 'default', limit = 20 }) => {
  const params = new URLSearchParams({
    config_type: configType,
    config_key: configKey,
    owner_id: ownerId,
    limit: String(limit),
  });
  const response = await api.get(`/infrastructure/config-versions?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

export const diffConfigVersions = async ({ configType, configKey, fromVersion, toVersion, ownerId = 'default' }) => {
  const params = new URLSearchParams({
    config_type: configType,
    config_key: configKey,
    owner_id: ownerId,
    from_version: String(fromVersion),
    to_version: String(toVersion),
  });
  const response = await api.get(`/infrastructure/config-versions/diff?${params.toString()}`, withTimeoutProfile('standard'));
  return response.data;
};

export const restoreConfigVersion = async (payload) => {
  const response = await api.post('/infrastructure/config-versions/restore', payload, withTimeoutProfile('standard'));
  return response.data;
};
