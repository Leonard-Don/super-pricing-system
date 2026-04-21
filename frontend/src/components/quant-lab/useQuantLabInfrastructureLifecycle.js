import { useCallback, useEffect } from 'react';
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

function useQuantLabInfrastructureLifecycle({
  message,
  setAuthProviders,
  setAuthSession,
  setAuthToken,
  setAuthUsers,
  setInfraLoading,
  setInfrastructureStatus,
  setInfrastructureTasks,
  setPersistenceDiagnostics,
  setPersistenceMigrationPreview,
  setPersistenceRecords,
  setPersistenceTimeseries,
  setRefreshSessions,
  setRefreshToken,
}) {
  const loadInfrastructure = useCallback(async () => {
    setInfraLoading(true);
    try {
      const [statusPayload, tasksPayload, usersPayload, providersPayload, diagnosticsPayload, migrationPreviewPayload, recordsPayload, timeseriesPayload] = await Promise.all([
        getInfrastructureStatus(),
        getInfrastructureTasks(20),
        getInfrastructureAuthUsers(),
        getInfrastructureAuthProviders(),
        getInfrastructurePersistenceDiagnostics(),
        getInfrastructurePersistenceMigrationPreview(),
        getInfrastructureRecords({ limit: 12 }),
        getInfrastructureTimeseries({ limit: 12 }),
      ]);
      setInfrastructureStatus(statusPayload);
      setInfrastructureTasks(tasksPayload.tasks || []);
      setAuthUsers(usersPayload.users || []);
      setRefreshSessions(usersPayload.sessions || []);
      setAuthProviders(providersPayload.providers || []);
      setPersistenceDiagnostics(diagnosticsPayload);
      setPersistenceMigrationPreview(migrationPreviewPayload);
      setPersistenceRecords(recordsPayload.records || []);
      setPersistenceTimeseries(timeseriesPayload.timeseries || []);
    } catch (error) {
      message.error(`加载基础设施状态失败: ${error.userMessage || error.message}`);
    } finally {
      setInfraLoading(false);
    }
  }, [
    message,
    setAuthProviders,
    setAuthUsers,
    setInfraLoading,
    setInfrastructureStatus,
    setInfrastructureTasks,
    setPersistenceDiagnostics,
    setPersistenceMigrationPreview,
    setPersistenceRecords,
    setPersistenceTimeseries,
    setRefreshSessions,
  ]);

  useEffect(() => {
    loadInfrastructure();
  }, [loadInfrastructure]);

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
        loadInfrastructure();
      } else {
        message.error(`OAuth 登录失败: ${event.data.error || '未知错误'}`);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, [applyAuthSession, loadInfrastructure, message]);

  return {
    applyAuthSession,
    loadInfrastructure,
  };
}

export default useQuantLabInfrastructureLifecycle;
