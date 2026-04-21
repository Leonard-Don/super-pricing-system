import React from 'react';
import {
  App as AntdApp,
  Tabs,
} from 'antd';
import { publishQuantAlertEvent } from '../services/api';
import buildQuantLabPresentationModel from './quant-lab/buildQuantLabPresentationModel';
import QuantLabHeatmapGrid from './quant-lab/QuantLabHeatmapGrid';
import QuantLabShell from './quant-lab/QuantLabShell';
import {
  PERIOD_OPTIONS,
  QUANT_LAB_TAB_META,
  describeExecution,
  executionAlertType,
  formatDateTime,
  formatMoney,
  formatPct,
  formatSignedPct,
  lifecycleStageColor,
  lifecycleStatusColor,
} from './quant-lab/quantLabShared';
import useQuantLabInfrastructureForms from './quant-lab/useQuantLabInfrastructureForms';
import useQuantLabForms from './quant-lab/useQuantLabForms';
import useQuantLabInfrastructureLifecycle from './quant-lab/useQuantLabInfrastructureLifecycle';
import useQuantLabInfrastructureAuthActions from './quant-lab/useQuantLabInfrastructureAuthActions';
import useQuantLabConfigVersionActions from './quant-lab/useQuantLabConfigVersionActions';
import useQuantLabInfrastructurePersistenceActions from './quant-lab/useQuantLabInfrastructurePersistenceActions';
import useQuantLabInfrastructureNotificationActions from './quant-lab/useQuantLabInfrastructureNotificationActions';
import useQuantLabAsyncTaskSubmission from './quant-lab/useQuantLabAsyncTaskSubmission';
import useQuantLabResearchActions from './quant-lab/useQuantLabResearchActions';
import useQuantLabTaskResultLoader from './quant-lab/useQuantLabTaskResultLoader';
import useQuantLabExperimentActions from './quant-lab/useQuantLabExperimentActions';
import useQuantLabOperationsActions from './quant-lab/useQuantLabOperationsActions';
import useQuantLabStrategyCatalog from './quant-lab/useQuantLabStrategyCatalog';
import useQuantLabTabState from './quant-lab/useQuantLabTabState';
import useQuantLabRuntimeState from './quant-lab/useQuantLabRuntimeState';
import useQuantLabSignalBus from './quant-lab/useQuantLabSignalBus';

const QuantLab = () => {
  const { message } = AntdApp.useApp();
  const forms = useQuantLabForms();
  const {
    authState,
    experimentState,
    infrastructureState,
    operationsState,
    researchState,
    strategyState,
  } = useQuantLabRuntimeState();
  const {
    activeTab,
    activeTabMeta,
    handleTabChange,
    mountedInfrastructure,
    mountedOperations,
  } = useQuantLabTabState();

  useQuantLabSignalBus({
    ...researchState,
    publishAlertEvent: publishQuantAlertEvent,
  });

  useQuantLabInfrastructureForms({
    authPolicyForm: forms.authPolicyForm,
    infrastructureStatus: infrastructureState.infrastructureStatus,
    mountedInfrastructure,
    persistenceBootstrapForm: forms.persistenceBootstrapForm,
    persistenceMigrationForm: forms.persistenceMigrationForm,
    rateLimitForm: forms.rateLimitForm,
  });

  useQuantLabStrategyCatalog({
    message,
    ...strategyState,
  });

  const {
    applyAuthSession,
    loadInfrastructure,
    loadInfrastructureAuthDirectory,
    loadInfrastructureAuthProviders,
    loadInfrastructureAuthSection,
    loadInfrastructurePersistenceSection,
    loadInfrastructureStatus,
    loadInfrastructureStatusAndTasks,
    loadInfrastructureTasks,
    loadMoreInfrastructureTasks,
    refreshInfrastructureSections,
  } = useQuantLabInfrastructureLifecycle({
    enabled: mountedInfrastructure,
    message,
    ...authState,
    ...infrastructureState,
  });
  const submitAsyncQuantTask = useQuantLabAsyncTaskSubmission({
    loadInfrastructureStatusAndTasks,
    loadInfrastructure,
    message,
    setQueuedTaskLoading: experimentState.setQueuedTaskLoading,
  });
  const handleLoadTaskResult = useQuantLabTaskResultLoader({
    activateTab: handleTabChange,
    message,
    ...experimentState,
  });
  const infrastructureAuthActions = useQuantLabInfrastructureAuthActions({
    loadInfrastructureAuthDirectory,
    loadInfrastructureAuthProviders,
    loadInfrastructureStatus,
    loadInfrastructure,
    message,
    applyAuthSession,
    ...authState,
    ...forms,
  });
  const infrastructurePersistenceActions = useQuantLabInfrastructurePersistenceActions({
    loadInfrastructureStatusAndTasks,
    loadInfrastructure,
    message,
    ...forms,
    ...infrastructureState,
  });
  const infrastructureNotificationActions = useQuantLabInfrastructureNotificationActions({
    loadInfrastructureStatus,
    loadInfrastructure,
    message,
    ...forms,
  });
  const configVersionActions = useQuantLabConfigVersionActions({
    message,
    ...infrastructureState,
  });
  const researchActions = useQuantLabResearchActions({
    message,
    ...researchState,
  });
  const experimentActions = useQuantLabExperimentActions({
    message,
    submitAsyncQuantTask,
    ...forms,
    ...experimentState,
  });
  const operationsActions = useQuantLabOperationsActions({
    enabled: mountedOperations,
    message,
    ...operationsState,
  });
  const handleUpdateInfrastructureTaskFilters = (updates) => {
    infrastructureState.setInfrastructureTaskFilters((current) => ({
      ...(current || {}),
      ...(updates || {}),
    }));
  };
  const quantLabPresentationModel = buildQuantLabPresentationModel({
    activeTabMeta,
    actionBundles: {
      configVersionActions,
      experimentActions,
      infrastructureAuthActions,
      infrastructureNotificationActions,
      infrastructurePersistenceActions,
      operationsActions,
      researchActions,
    },
    authState,
    experimentState,
    forms,
    helpers: {
      HeatmapGridComponent: QuantLabHeatmapGrid,
      describeExecution,
      executionAlertType,
      formatDateTime,
      formatMoney,
      formatPct,
      formatSignedPct,
      lifecycleStageColor,
      lifecycleStatusColor,
      periodOptions: PERIOD_OPTIONS,
    },
    infrastructureState,
    loaders: {
      handleLoadTaskResult,
      loadInfrastructure,
      loadInfrastructureAuthSection,
      loadInfrastructurePersistenceSection,
      loadInfrastructureTasks,
      loadMoreInfrastructureTasks,
      refreshInfrastructureSections,
      handleUpdateInfrastructureTaskFilters,
    },
    operationsState,
    researchState,
    strategyState,
  });

  return (
    <QuantLabShell
      activeTab={activeTab}
      activeTabMeta={activeTabMeta}
      focusItems={quantLabPresentationModel.focusItems}
      heroMetrics={quantLabPresentationModel.heroMetrics}
      onTabChange={handleTabChange}
      tabMeta={QUANT_LAB_TAB_META}
    >
      <Tabs
        className="quantlab-tabs"
        items={quantLabPresentationModel.tabs}
        activeKey={activeTab}
        onChange={handleTabChange}
      />
    </QuantLabShell>
  );
};

export default QuantLab;
