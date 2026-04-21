import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../components/quant-lab/QuantLabInfrastructureSections', () => ({
  QuantLabInfrastructureOverviewSection: () => <div data-testid="infra-overview-section" />,
  QuantLabInfrastructureAuthSection: () => <div data-testid="infra-auth-section" />,
  QuantLabInfrastructureRateLimitsSection: () => <div data-testid="infra-rate-limits-section" />,
  QuantLabInfrastructurePersistenceSection: () => <div data-testid="infra-persistence-section" />,
  QuantLabInfrastructureConfigSection: () => <div data-testid="infra-config-section" />,
  QuantLabInfrastructureTaskQueueSection: () => <div data-testid="infra-task-queue-section" />,
}));

import QuantLabInfrastructurePanel from '../components/quant-lab/QuantLabInfrastructurePanel';
import useQuantLabForms from '../components/quant-lab/useQuantLabForms';

const noop = jest.fn();

const baseInfrastructureStatus = {
  persistence: {},
  task_queue: {},
  notifications: {
    channels: [],
  },
  auth: {},
  rate_limits: {
    default_rule: {},
    recent_blocks: [],
    top_endpoints: [],
  },
};

function InfrastructureHarness() {
  const forms = useQuantLabForms();

  return (
    <QuantLabInfrastructurePanel
      {...forms}
      authProviders={[]}
      authSession={null}
      authToken=""
      authUsers={[]}
      configDiff={null}
      configDiffRows={[]}
      configVersionLoading={false}
      configVersionRows={[]}
      formatDateTime={(value) => String(value || '--')}
      formatPct={(value) => `${value}`}
      handleBootstrapPersistence={noop}
      handleCancelTask={noop}
      handleCreateTask={noop}
      handleCreateToken={noop}
      handleDeleteNotificationChannel={noop}
      handleDiagnoseOAuthProvider={noop}
      handleDiffLatestConfigVersions={noop}
      handleExchangeOAuthCode={noop}
      handleLoadConfigVersions={noop}
      handleLoadPersistenceExplorer={noop}
      handleLoadTaskResult={noop}
      handleLoginInfrastructureUser={noop}
      handlePreviewPersistenceMigration={noop}
      handleRestoreConfigVersion={noop}
      handleRevokeRefreshSession={noop}
      handleRunPersistenceMigration={noop}
      handleSaveAuthUser={noop}
      handleSaveConfigVersion={noop}
      handleSaveNotificationChannel={noop}
      handleSaveOAuthProvider={noop}
      handleSavePersistenceRecord={noop}
      handleSaveTimeseries={noop}
      handleStartOAuthLogin={noop}
      handleSyncOAuthProvidersFromEnv={noop}
      handleTestNotification={noop}
      handleUpdateAuthPolicy={noop}
      handleUpdateRateLimits={noop}
      infraHydrated
      infraLoading={false}
      infrastructureRefreshState={{ auth: 0, overview: 0, persistence: 0, tasks: 0 }}
      infrastructureStatus={baseInfrastructureStatus}
      infrastructureTaskFilters={{ taskView: 'active', status: 'all', executionBackend: 'all', sortBy: 'activity', sortDirection: 'desc' }}
      infrastructureTaskRows={[]}
      loadInfrastructure={noop}
      loadInfrastructureAuthSection={noop}
      loadInfrastructurePersistenceSection={noop}
      loadInfrastructureTasks={noop}
      loadMoreInfrastructureTasks={noop}
      onInfrastructureTaskFilterChange={noop}
      oauthDiagnostics={null}
      oauthLaunchContext={null}
      persistenceBootstrapLoading={false}
      persistenceDiagnostics={null}
      persistenceMigrationLoading={false}
      persistenceMigrationPreview={null}
      persistenceRecords={[]}
      persistenceTimeseries={[]}
      refreshSessions={[]}
      refreshToken=""
      refreshInfrastructureSections={noop}
    />
  );
}

describe('QuantLabInfrastructurePanel', () => {
  test('composes the split infrastructure sections', () => {
    render(<InfrastructureHarness />);

    expect(screen.getByRole('button', { name: /刷新基础设施/ })).toBeInTheDocument();
    expect(screen.getByTestId('infra-overview-section')).toBeInTheDocument();
    expect(screen.getByTestId('infra-auth-section')).toBeInTheDocument();
    expect(screen.getByTestId('infra-rate-limits-section')).toBeInTheDocument();
    expect(screen.getByTestId('infra-persistence-section')).toBeInTheDocument();
    expect(screen.getByTestId('infra-config-section')).toBeInTheDocument();
    expect(screen.getByTestId('infra-task-queue-section')).toBeInTheDocument();
  });
});
