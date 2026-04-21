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
  infraLoading,
  infrastructureStatus,
  infrastructureTaskRows,
  loadInfrastructure,
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
  taskForm,
  timeseriesForm,
  tokenForm,
}) => (
  <Space direction="vertical" size="large" style={FULL_WIDTH_STYLE}>
    <Space>
      <Button icon={<ReloadOutlined />} onClick={loadInfrastructure} loading={infraLoading}>刷新基础设施</Button>
    </Space>
    {infraLoading ? <Spin size="large" /> : null}
    {!infraLoading && infrastructureStatus ? (
      <>
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
        />
        <QuantLabInfrastructureRateLimitsSection
          formatDateTime={formatDateTime}
          handleUpdateRateLimits={handleUpdateRateLimits}
          infrastructureStatus={infrastructureStatus}
          rateLimitForm={rateLimitForm}
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
          infrastructureTaskRows={infrastructureTaskRows}
        />
      </>
    ) : null}
  </Space>
);

export default QuantLabInfrastructurePanel;
