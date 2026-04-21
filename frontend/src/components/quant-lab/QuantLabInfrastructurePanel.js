import React from 'react';
import {
  Button,
  Space,
  Spin,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  QuantLabInfrastructureAuthSection,
  QuantLabInfrastructureConfigSection,
  QuantLabInfrastructureOverviewSection,
  QuantLabInfrastructurePersistenceSection,
  QuantLabInfrastructureRateLimitsSection,
  QuantLabInfrastructureTaskQueueSection,
} from './QuantLabInfrastructureSections';

const FULL_WIDTH_STYLE = { width: '100%' };

const QuantLabInfrastructurePanel = ({
  authLoginForm,
  authPolicyForm,
  authProviders,
  authSession,
  authToken,
  authUserForm,
  authUsers,
  configDiff,
  configDiffRows,
  configLookupForm,
  configVersionForm,
  configVersionLoading,
  configVersionRows,
  formatDateTime,
  formatPct,
  handleBootstrapPersistence,
  handleCancelTask,
  handleCreateTask,
  handleCreateToken,
  handleDeleteNotificationChannel,
  handleDiagnoseOAuthProvider,
  handleDiffLatestConfigVersions,
  handleExchangeOAuthCode,
  handleLoadConfigVersions,
  handleLoadPersistenceExplorer,
  handleLoadTaskResult,
  handleLoginInfrastructureUser,
  handlePreviewPersistenceMigration,
  handleRestoreConfigVersion,
  handleRevokeRefreshSession,
  handleRunPersistenceMigration,
  handleSaveAuthUser,
  handleSaveConfigVersion,
  handleSaveNotificationChannel,
  handleSaveOAuthProvider,
  handleSavePersistenceRecord,
  handleSaveTimeseries,
  handleStartOAuthLogin,
  handleSyncOAuthProvidersFromEnv,
  handleTestNotification,
  handleUpdateAuthPolicy,
  handleUpdateRateLimits,
  infraHydrated,
  infraLoading,
  infrastructureRefreshState,
  infrastructureStatus,
  infrastructureTaskFilters,
  infrastructureTaskPagination,
  infrastructureTaskRows,
  loadInfrastructure,
  loadInfrastructureAuthSection,
  loadInfrastructurePersistenceSection,
  loadInfrastructureTasks,
  loadMoreInfrastructureTasks,
  onInfrastructureTaskFilterChange,
  notificationChannelForm,
  notificationForm,
  oauthDiagnostics,
  oauthExchangeForm,
  oauthLaunchContext,
  oauthProviderForm,
  persistenceBootstrapForm,
  persistenceBootstrapLoading,
  persistenceDiagnostics,
  persistenceMigrationForm,
  persistenceMigrationLoading,
  persistenceMigrationPreview,
  persistenceQueryForm,
  persistenceRecordForm,
  persistenceRecords,
  persistenceTimeseries,
  rateLimitForm,
  refreshSessions,
  refreshToken,
  refreshInfrastructureSections,
  taskForm,
  timeseriesForm,
  tokenForm,
}) => {
  const refreshState = infrastructureRefreshState || {};
  const overviewRefreshing = Number(refreshState.overview || 0) > 0;
  const authRefreshing = Number(refreshState.auth || 0) > 0;
  const persistenceRefreshing = Number(refreshState.persistence || 0) > 0;
  const tasksRefreshing = Number(refreshState.tasks || 0) > 0;
  const anyRefreshing = overviewRefreshing || authRefreshing || persistenceRefreshing || tasksRefreshing;
  const showInitialLoading = !infraHydrated && infraLoading;

  return (
    <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
      <Space wrap>
        <Button icon={<ReloadOutlined />} onClick={refreshInfrastructureSections || loadInfrastructure} loading={anyRefreshing || infraLoading}>刷新基础设施</Button>
        <Button size="small" onClick={loadInfrastructure} loading={infraLoading}>强制全量加载</Button>
        <Button size="small" onClick={loadInfrastructureAuthSection} loading={authRefreshing}>刷新认证</Button>
        <Button size="small" onClick={loadInfrastructurePersistenceSection} loading={persistenceRefreshing || overviewRefreshing}>刷新持久化</Button>
        <Button size="small" onClick={loadInfrastructureTasks} loading={tasksRefreshing}>刷新任务</Button>
      </Space>
      {showInitialLoading ? <Spin size="large" /> : null}
      {!showInitialLoading && infrastructureStatus ? (
        <>
          <Spin spinning={overviewRefreshing}>
        <QuantLabInfrastructureOverviewSection
          authToken={authToken}
          handleCreateTask={handleCreateTask}
          handleCreateToken={handleCreateToken}
          handleDeleteNotificationChannel={handleDeleteNotificationChannel}
          handleSaveNotificationChannel={handleSaveNotificationChannel}
          handleTestNotification={handleTestNotification}
          infrastructureStatus={infrastructureStatus}
          loadInfrastructure={loadInfrastructure}
          notificationChannelForm={notificationChannelForm}
          notificationForm={notificationForm}
          taskForm={taskForm}
          tokenForm={tokenForm}
        />
          </Spin>
        <QuantLabInfrastructureAuthSection
          authLoginForm={authLoginForm}
          authPolicyForm={authPolicyForm}
          authProviders={authProviders}
          authSession={authSession}
          authUserForm={authUserForm}
          authUsers={authUsers}
          formatDateTime={formatDateTime}
          handleDiagnoseOAuthProvider={handleDiagnoseOAuthProvider}
          handleExchangeOAuthCode={handleExchangeOAuthCode}
          handleLoginInfrastructureUser={handleLoginInfrastructureUser}
          handleRevokeRefreshSession={handleRevokeRefreshSession}
          handleSaveAuthUser={handleSaveAuthUser}
          handleSaveOAuthProvider={handleSaveOAuthProvider}
          handleStartOAuthLogin={handleStartOAuthLogin}
          handleSyncOAuthProvidersFromEnv={handleSyncOAuthProvidersFromEnv}
          handleUpdateAuthPolicy={handleUpdateAuthPolicy}
          infrastructureStatus={infrastructureStatus}
          oauthDiagnostics={oauthDiagnostics}
          oauthExchangeForm={oauthExchangeForm}
          oauthLaunchContext={oauthLaunchContext}
          oauthProviderForm={oauthProviderForm}
          refreshSessions={refreshSessions}
          refreshToken={refreshToken}
          loading={authRefreshing}
        />
        <QuantLabInfrastructureRateLimitsSection
          formatDateTime={formatDateTime}
          handleUpdateRateLimits={handleUpdateRateLimits}
          infrastructureStatus={infrastructureStatus}
          rateLimitForm={rateLimitForm}
          loading={overviewRefreshing}
        />
        <QuantLabInfrastructurePersistenceSection
          formatDateTime={formatDateTime}
          handleBootstrapPersistence={handleBootstrapPersistence}
          handleLoadPersistenceExplorer={handleLoadPersistenceExplorer}
          handlePreviewPersistenceMigration={handlePreviewPersistenceMigration}
          handleRunPersistenceMigration={handleRunPersistenceMigration}
          handleSavePersistenceRecord={handleSavePersistenceRecord}
          handleSaveTimeseries={handleSaveTimeseries}
          infrastructureStatus={infrastructureStatus}
          persistenceBootstrapForm={persistenceBootstrapForm}
          persistenceBootstrapLoading={persistenceBootstrapLoading}
          persistenceDiagnostics={persistenceDiagnostics}
          persistenceMigrationForm={persistenceMigrationForm}
          persistenceMigrationLoading={persistenceMigrationLoading}
          persistenceMigrationPreview={persistenceMigrationPreview}
          persistenceQueryForm={persistenceQueryForm}
          persistenceRecordForm={persistenceRecordForm}
          persistenceRecords={persistenceRecords}
          persistenceTimeseries={persistenceTimeseries}
          timeseriesForm={timeseriesForm}
          loading={persistenceRefreshing || overviewRefreshing}
        />
        <QuantLabInfrastructureConfigSection
          configDiff={configDiff}
          configDiffRows={configDiffRows}
          configLookupForm={configLookupForm}
          configVersionForm={configVersionForm}
          configVersionLoading={configVersionLoading}
          configVersionRows={configVersionRows}
          handleDiffLatestConfigVersions={handleDiffLatestConfigVersions}
          handleLoadConfigVersions={handleLoadConfigVersions}
          handleRestoreConfigVersion={handleRestoreConfigVersion}
          handleSaveConfigVersion={handleSaveConfigVersion}
        />
        <QuantLabInfrastructureTaskQueueSection
          formatDateTime={formatDateTime}
          formatPct={formatPct}
          handleCancelTask={handleCancelTask}
          handleLoadTaskResult={handleLoadTaskResult}
          infrastructureTaskFilters={infrastructureTaskFilters}
          infrastructureTaskPagination={infrastructureTaskPagination}
          infrastructureTaskRows={infrastructureTaskRows}
          loadMoreInfrastructureTasks={loadMoreInfrastructureTasks}
          onInfrastructureTaskFilterChange={onInfrastructureTaskFilterChange}
          persistedTaskTotal={infrastructureStatus.task_queue?.persisted_tasks || 0}
          loading={tasksRefreshing}
        />
      </>
      ) : null}
    </Space>
  );
};

export default QuantLabInfrastructurePanel;
