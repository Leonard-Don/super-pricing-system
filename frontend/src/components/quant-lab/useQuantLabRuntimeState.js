import { useState } from 'react';
import { getApiAuthToken, getApiRefreshToken } from '../../services/api';

const EMPTY_INFRASTRUCTURE_STATUS = {
  persistence: {},
  task_queue: {
    broker_states: [],
    execution_backends: [],
  },
  notifications: {
    channels: [],
  },
  auth: {
    supported: [],
    policy: {},
  },
  rate_limits: {
    default_rule: {},
    top_endpoints: [],
    recent_blocks: [],
  },
};

const EMPTY_TRADING_JOURNAL = {
  summary: {},
  bias_detection: [],
  source_breakdown: [],
  risk_breakdown: [],
  trades: [],
  daily_report: [],
  weekly_report: [],
  loss_analysis: [],
  strategy_lifecycle_summary: {
    stage_breakdown: [],
  },
  strategy_lifecycle: [],
};

const EMPTY_ALERT_ORCHESTRATION = {
  summary: {},
  composite_rules: [],
  history_stats: {
    rule_stats: [],
    module_stats: [],
    cascade_stats: [],
    pending_queue: [],
  },
  event_bus: {
    history: [],
  },
};

function useQuantLabRuntimeState() {
  const [strategies, setStrategies] = useState([]);

  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskResult, setRiskResult] = useState(null);
  const [valuationLoading, setValuationLoading] = useState(false);
  const [valuationResult, setValuationResult] = useState(null);
  const [rotationLoading, setRotationLoading] = useState(false);
  const [rotationResult, setRotationResult] = useState(null);
  const [queuedTaskLoading, setQueuedTaskLoading] = useState({});
  const [factorLoading, setFactorLoading] = useState(false);
  const [factorResult, setFactorResult] = useState(null);
  const [backtestEnhancementLoading, setBacktestEnhancementLoading] = useState(false);
  const [backtestEnhancementResult, setBacktestEnhancementResult] = useState(null);

  const [industryIntelLoading, setIndustryIntelLoading] = useState(false);
  const [industryIntelResult, setIndustryIntelResult] = useState(null);
  const [industryNetworkResult, setIndustryNetworkResult] = useState(null);
  const [signalValidationLoading, setSignalValidationLoading] = useState(false);
  const [macroValidationResult, setMacroValidationResult] = useState(null);
  const [altSignalDiagnostics, setAltSignalDiagnostics] = useState(null);
  const [marketProbeLoading, setMarketProbeLoading] = useState(false);
  const [replayResult, setReplayResult] = useState(null);
  const [orderbookResult, setOrderbookResult] = useState(null);
  const [linkedReplayResult, setLinkedReplayResult] = useState(null);
  const [anomalyDiagnostics, setAnomalyDiagnostics] = useState(null);

  const [infraLoading, setInfraLoading] = useState(false);
  const [infrastructureStatus, setInfrastructureStatus] = useState(EMPTY_INFRASTRUCTURE_STATUS);
  const [infrastructureTasks, setInfrastructureTasks] = useState([]);
  const [persistenceDiagnostics, setPersistenceDiagnostics] = useState(null);
  const [persistenceBootstrapLoading, setPersistenceBootstrapLoading] = useState(false);
  const [persistenceMigrationPreview, setPersistenceMigrationPreview] = useState(null);
  const [persistenceMigrationLoading, setPersistenceMigrationLoading] = useState(false);
  const [persistenceRecords, setPersistenceRecords] = useState([]);
  const [persistenceTimeseries, setPersistenceTimeseries] = useState([]);
  const [configVersionLoading, setConfigVersionLoading] = useState(false);
  const [configVersions, setConfigVersions] = useState([]);
  const [configDiff, setConfigDiff] = useState(null);
  const [activeConfigScope, setActiveConfigScope] = useState({
    ownerId: 'default',
    configType: 'strategy',
    configKey: 'moving_average',
  });

  const [authUsers, setAuthUsers] = useState([]);
  const [refreshSessions, setRefreshSessions] = useState([]);
  const [authProviders, setAuthProviders] = useState([]);
  const [oauthLaunchContext, setOauthLaunchContext] = useState(null);
  const [oauthDiagnostics, setOauthDiagnostics] = useState(null);
  const [authToken, setAuthToken] = useState(() => getApiAuthToken());
  const [refreshToken, setRefreshToken] = useState(() => getApiRefreshToken());
  const [authSession, setAuthSession] = useState(null);

  const [opsLoading, setOpsLoading] = useState(false);
  const [tradingJournal, setTradingJournal] = useState(EMPTY_TRADING_JOURNAL);
  const [alertOrchestration, setAlertOrchestration] = useState(EMPTY_ALERT_ORCHESTRATION);
  const [dataQuality, setDataQuality] = useState(null);

  return {
    authState: {
      authProviders,
      authSession,
      authToken,
      authUsers,
      oauthDiagnostics,
      oauthLaunchContext,
      refreshSessions,
      refreshToken,
      setAuthProviders,
      setAuthSession,
      setAuthToken,
      setAuthUsers,
      setOauthDiagnostics,
      setOauthLaunchContext,
      setRefreshSessions,
      setRefreshToken,
    },
    experimentState: {
      backtestEnhancementLoading,
      backtestEnhancementResult,
      factorLoading,
      factorResult,
      optimizerLoading,
      optimizerResult,
      queuedTaskLoading,
      riskLoading,
      riskResult,
      rotationLoading,
      rotationResult,
      setBacktestEnhancementLoading,
      setBacktestEnhancementResult,
      setFactorLoading,
      setFactorResult,
      setOptimizerLoading,
      setOptimizerResult,
      setQueuedTaskLoading,
      setRiskLoading,
      setRiskResult,
      setRotationLoading,
      setRotationResult,
      setValuationLoading,
      setValuationResult,
      valuationLoading,
      valuationResult,
    },
    infrastructureState: {
      activeConfigScope,
      configDiff,
      configVersionLoading,
      configVersions,
      infraLoading,
      infrastructureStatus,
      infrastructureTasks,
      persistenceBootstrapLoading,
      persistenceDiagnostics,
      persistenceMigrationLoading,
      persistenceMigrationPreview,
      persistenceRecords,
      persistenceTimeseries,
      setActiveConfigScope,
      setConfigDiff,
      setConfigVersionLoading,
      setConfigVersions,
      setInfraLoading,
      setInfrastructureStatus,
      setInfrastructureTasks,
      setPersistenceBootstrapLoading,
      setPersistenceDiagnostics,
      setPersistenceMigrationLoading,
      setPersistenceMigrationPreview,
      setPersistenceRecords,
      setPersistenceTimeseries,
    },
    operationsState: {
      alertOrchestration,
      dataQuality,
      opsLoading,
      setAlertOrchestration,
      setDataQuality,
      setOpsLoading,
      setTradingJournal,
      tradingJournal,
    },
    researchState: {
      altSignalDiagnostics,
      anomalyDiagnostics,
      industryIntelLoading,
      industryIntelResult,
      industryNetworkResult,
      linkedReplayResult,
      macroValidationResult,
      marketProbeLoading,
      orderbookResult,
      replayResult,
      setAltSignalDiagnostics,
      setAnomalyDiagnostics,
      setIndustryIntelLoading,
      setIndustryIntelResult,
      setIndustryNetworkResult,
      setLinkedReplayResult,
      setMacroValidationResult,
      setMarketProbeLoading,
      setOrderbookResult,
      setReplayResult,
      setSignalValidationLoading,
      signalValidationLoading,
    },
    strategyState: {
      setStrategies,
      strategies,
    },
  };
}

export default useQuantLabRuntimeState;
