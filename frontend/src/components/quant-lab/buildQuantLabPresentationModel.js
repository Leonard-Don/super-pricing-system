import buildQuantLabInfrastructureTables from './buildQuantLabInfrastructureTables';
import buildQuantLabShellViewModel from './buildQuantLabShellViewModel';
import buildQuantLabTabs from './buildQuantLabTabs';

const buildQuantLabPresentationModel = ({
  activeTabMeta,
  actionBundles,
  authState,
  experimentState,
  forms,
  helpers,
  infrastructureState,
  loaders,
  operationsState,
}) => {
  const {
    configDiffRows,
    configVersionRows,
    infrastructureTaskRows,
  } = buildQuantLabInfrastructureTables({
    configDiff: infrastructureState.configDiff,
    configVersions: infrastructureState.configVersions,
    infrastructureTasks: infrastructureState.infrastructureTasks,
  });

  const shellViewModel = buildQuantLabShellViewModel({
    activeTabMeta,
    alertOrchestration: operationsState.alertOrchestration,
    dataQuality: operationsState.dataQuality,
    infraHydrated: infrastructureState.infraHydrated,
    infrastructureStatus: infrastructureState.infrastructureStatus,
    opsHydrated: operationsState.opsHydrated,
    tradingJournal: operationsState.tradingJournal,
  });

  const tabs = buildQuantLabTabs({
    actionBundles,
    authState,
    experimentState,
    forms,
    helpers,
    infrastructureState: {
      ...infrastructureState,
      configDiffRows,
      configVersionRows,
      infrastructureTaskRows,
    },
    loaders,
    operationsState,
  });

  return {
    activeBoundary: shellViewModel.activeBoundary,
    boundarySummary: shellViewModel.boundarySummary,
    focusItems: shellViewModel.focusItems,
    heroMetrics: shellViewModel.heroMetrics,
    tabs,
  };
};

export default buildQuantLabPresentationModel;
