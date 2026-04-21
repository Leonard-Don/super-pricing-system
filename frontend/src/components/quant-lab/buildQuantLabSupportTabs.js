import React from 'react';
import {
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import QuantLabInfrastructurePanel from './QuantLabInfrastructurePanel';
import QuantLabOpsPanel from './QuantLabOpsPanel';

const buildQuantLabSupportTabs = ({
  actionBundles,
  authState,
  forms,
  helpers,
  infrastructureState,
  loaders,
  operationsState,
}) => {
  const {
    handleCreateToken,
    handleDiagnoseOAuthProvider,
    handleExchangeOAuthCode,
    handleLoginInfrastructureUser,
    handleRevokeRefreshSession,
    handleSaveAuthUser,
    handleSaveOAuthProvider,
    handleStartOAuthLogin,
    handleSyncOAuthProvidersFromEnv,
    handleUpdateAuthPolicy,
    handleUpdateRateLimits,
  } = actionBundles.infrastructureAuthActions;
  const {
    handleBootstrapPersistence,
    handleCancelTask,
    handleCreateTask,
    handleLoadPersistenceExplorer,
    handlePreviewPersistenceMigration,
    handleRunPersistenceMigration,
    handleSavePersistenceRecord,
    handleSaveTimeseries,
  } = actionBundles.infrastructurePersistenceActions;
  const {
    handleDeleteNotificationChannel,
    handleSaveNotificationChannel,
    handleTestNotification,
  } = actionBundles.infrastructureNotificationActions;
  const {
    handleDiffLatestConfigVersions,
    handleLoadConfigVersions,
    handleRestoreConfigVersion,
    handleSaveConfigVersion,
  } = actionBundles.configVersionActions;
  const {
    handleAddCompositeRule,
    handleAddLifecycleEntry,
    handlePublishAlertEvent,
    handleReviewAlertHistory,
    handleSaveTradeNote,
    loadOperations,
  } = actionBundles.operationsActions;
  const {
    authProviders,
    authSession,
    authToken,
    authUsers,
    oauthDiagnostics,
    oauthLaunchContext,
    refreshSessions,
    refreshToken,
  } = authState;
  const {
    formatDateTime,
    formatMoney,
    formatPct,
    lifecycleStageColor,
    lifecycleStatusColor,
  } = helpers;
  const {
    configDiff,
    configDiffRows,
    configVersionLoading,
    configVersionRows,
    infraLoading,
    infrastructureStatus,
    infrastructureTaskRows,
    persistenceBootstrapLoading,
    persistenceDiagnostics,
    persistenceMigrationLoading,
    persistenceMigrationPreview,
    persistenceRecords,
    persistenceTimeseries,
  } = infrastructureState;
  const { handleLoadTaskResult, loadInfrastructure } = loaders;
  const {
    alertOrchestration,
    dataQuality,
    opsLoading,
    tradingJournal,
  } = operationsState;

  return [
    {
      key: 'infrastructure',
      label: <span><DatabaseOutlined />基础设施</span>,
      children: (
        <QuantLabInfrastructurePanel
          authLoginForm={forms.authLoginForm}
          authPolicyForm={forms.authPolicyForm}
          authProviders={authProviders}
          authSession={authSession}
          authToken={authToken}
          authUserForm={forms.authUserForm}
          authUsers={authUsers}
          configDiff={configDiff}
          configDiffRows={configDiffRows}
          configLookupForm={forms.configLookupForm}
          configVersionForm={forms.configVersionForm}
          configVersionLoading={configVersionLoading}
          configVersionRows={configVersionRows}
          formatDateTime={formatDateTime}
          formatPct={formatPct}
          handleBootstrapPersistence={handleBootstrapPersistence}
          handleCancelTask={handleCancelTask}
          handleCreateTask={handleCreateTask}
          handleCreateToken={handleCreateToken}
          handleDeleteNotificationChannel={handleDeleteNotificationChannel}
          handleDiagnoseOAuthProvider={handleDiagnoseOAuthProvider}
          handleDiffLatestConfigVersions={handleDiffLatestConfigVersions}
          handleExchangeOAuthCode={handleExchangeOAuthCode}
          handleLoadConfigVersions={handleLoadConfigVersions}
          handleLoadPersistenceExplorer={handleLoadPersistenceExplorer}
          handleLoadTaskResult={handleLoadTaskResult}
          handleLoginInfrastructureUser={handleLoginInfrastructureUser}
          handlePreviewPersistenceMigration={handlePreviewPersistenceMigration}
          handleRestoreConfigVersion={handleRestoreConfigVersion}
          handleRevokeRefreshSession={handleRevokeRefreshSession}
          handleRunPersistenceMigration={handleRunPersistenceMigration}
          handleSaveAuthUser={handleSaveAuthUser}
          handleSaveConfigVersion={handleSaveConfigVersion}
          handleSaveNotificationChannel={handleSaveNotificationChannel}
          handleSaveOAuthProvider={handleSaveOAuthProvider}
          handleSavePersistenceRecord={handleSavePersistenceRecord}
          handleSaveTimeseries={handleSaveTimeseries}
          handleStartOAuthLogin={handleStartOAuthLogin}
          handleSyncOAuthProvidersFromEnv={handleSyncOAuthProvidersFromEnv}
          handleTestNotification={handleTestNotification}
          handleUpdateAuthPolicy={handleUpdateAuthPolicy}
          handleUpdateRateLimits={handleUpdateRateLimits}
          infraLoading={infraLoading}
          infrastructureStatus={infrastructureStatus}
          infrastructureTaskRows={infrastructureTaskRows}
          loadInfrastructure={loadInfrastructure}
          notificationChannelForm={forms.notificationChannelForm}
          notificationForm={forms.notificationForm}
          oauthDiagnostics={oauthDiagnostics}
          oauthExchangeForm={forms.oauthExchangeForm}
          oauthLaunchContext={oauthLaunchContext}
          oauthProviderForm={forms.oauthProviderForm}
          persistenceBootstrapForm={forms.persistenceBootstrapForm}
          persistenceBootstrapLoading={persistenceBootstrapLoading}
          persistenceDiagnostics={persistenceDiagnostics}
          persistenceMigrationForm={forms.persistenceMigrationForm}
          persistenceMigrationLoading={persistenceMigrationLoading}
          persistenceMigrationPreview={persistenceMigrationPreview}
          persistenceQueryForm={forms.persistenceQueryForm}
          persistenceRecordForm={forms.persistenceRecordForm}
          persistenceRecords={persistenceRecords}
          persistenceTimeseries={persistenceTimeseries}
          rateLimitForm={forms.rateLimitForm}
          refreshSessions={refreshSessions}
          refreshToken={refreshToken}
          taskForm={forms.taskForm}
          timeseriesForm={forms.timeseriesForm}
          tokenForm={forms.tokenForm}
        />
      ),
    },
    {
      key: 'ops',
      label: <span><SettingOutlined />研究运营中心</span>,
      children: (
        <QuantLabOpsPanel
          alertOrchestration={alertOrchestration}
          dataQuality={dataQuality}
          formatDateTime={formatDateTime}
          formatMoney={formatMoney}
          formatPct={formatPct}
          lifecycleStageColor={lifecycleStageColor}
          lifecycleStatusColor={lifecycleStatusColor}
          loading={opsLoading}
          onAddCompositeRule={handleAddCompositeRule}
          onAddLifecycleEntry={handleAddLifecycleEntry}
          onPublishAlertEvent={handlePublishAlertEvent}
          onReload={loadOperations}
          onReviewAlertHistory={handleReviewAlertHistory}
          onSaveTradeNote={handleSaveTradeNote}
          tradingJournal={tradingJournal}
        />
      ),
    },
  ];
};

export default buildQuantLabSupportTabs;
