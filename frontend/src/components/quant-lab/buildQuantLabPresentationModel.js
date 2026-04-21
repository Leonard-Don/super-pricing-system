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
  researchState,
  strategyState,
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
    infrastructureStatus: infrastructureState.infrastructureStatus,
    strategies: strategyState.strategies,
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
    researchState,
    strategyState,
  });

  return {
    focusItems: shellViewModel.focusItems,
    heroMetrics: shellViewModel.heroMetrics,
    tabs,
  };
};

export default buildQuantLabPresentationModel;
