import buildQuantLabPresentationModel from '../components/quant-lab/buildQuantLabPresentationModel';
import { QUANT_LAB_TAB_META_MAP } from '../components/quant-lab/quantLabShared';

const noop = jest.fn();

const createNoopBundle = () => new Proxy({}, {
  get: () => noop,
});

const createFormsBundle = () => new Proxy({}, {
  get: (_, key) => ({ formKey: String(key) }),
});

describe('buildQuantLabPresentationModel', () => {
  test('builds shell metrics and injects derived infrastructure rows into tabs', () => {
    const model = buildQuantLabPresentationModel({
      activeTabMeta: QUANT_LAB_TAB_META_MAP.infrastructure,
      actionBundles: {
        configVersionActions: createNoopBundle(),
        experimentActions: createNoopBundle(),
        infrastructureAuthActions: createNoopBundle(),
        infrastructureNotificationActions: createNoopBundle(),
        infrastructurePersistenceActions: createNoopBundle(),
        operationsActions: createNoopBundle(),
        researchActions: createNoopBundle(),
      },
      authState: {
        authProviders: [],
        authSession: null,
        authToken: '',
        authUsers: [],
        oauthDiagnostics: null,
        oauthLaunchContext: null,
        refreshSessions: [],
        refreshToken: '',
      },
      experimentState: {
        backtestEnhancementLoading: false,
        backtestEnhancementResult: null,
        factorLoading: false,
        factorResult: null,
        optimizerLoading: false,
        optimizerResult: null,
        queuedTaskLoading: {},
        riskLoading: false,
        riskResult: null,
        rotationLoading: false,
        rotationResult: null,
        valuationLoading: false,
        valuationResult: null,
      },
      forms: createFormsBundle(),
      helpers: {
        HeatmapGridComponent: () => null,
        describeExecution: (execution, fallback) => execution?.source || fallback,
        executionAlertType: () => 'info',
        formatDateTime: (value) => String(value),
        formatMoney: (value) => `$${value}`,
        formatPct: (value) => `${value}`,
        formatSignedPct: (value) => `${value}`,
        lifecycleStageColor: () => 'blue',
        lifecycleStatusColor: () => 'cyan',
        periodOptions: [{ value: '1y', label: '1年' }],
      },
      infrastructureState: {
        configDiff: {
          changes: [
            { path: 'auth.required', before: false, after: true },
          ],
        },
        configVersionLoading: false,
        configVersions: [
          { id: 'cfg-1', created_at: '2026-04-20T10:00:00Z' },
        ],
        infraLoading: false,
        infrastructureStatus: {
          task_queue: {
            queued_or_running: 2,
            failed: 1,
            execution_backends: ['celery', 'local'],
          },
        },
        infrastructureTasks: [
          { id: 'task-1', name: 'quant_strategy_optimizer' },
        ],
        persistenceBootstrapLoading: false,
        persistenceDiagnostics: null,
        persistenceMigrationLoading: false,
        persistenceMigrationPreview: null,
        persistenceRecords: [],
        persistenceTimeseries: [],
      },
      loaders: {
        handleLoadTaskResult: noop,
        loadInfrastructure: noop,
      },
      operationsState: {
        alertOrchestration: {
          history_stats: {
            pending_queue: [{ id: 'alert-1' }, { id: 'alert-2' }],
          },
        },
        dataQuality: {
          summary: {
            degraded: 1,
            down: 1,
          },
        },
        opsLoading: false,
        tradingJournal: {
          summary: {
            total_trades: 12,
          },
        },
      },
      researchState: {
        altSignalDiagnostics: null,
        anomalyDiagnostics: null,
        industryIntelLoading: false,
        industryIntelResult: null,
        industryNetworkResult: null,
        linkedReplayResult: null,
        macroValidationResult: null,
        marketProbeLoading: false,
        orderbookResult: null,
        replayResult: null,
        signalValidationLoading: false,
      },
      strategyState: {
        strategies: [
          { name: 'moving_average' },
          { name: 'mean_reversion' },
        ],
      },
    });

    expect(model.heroMetrics).toEqual([
      { label: '工作区', value: '10 个' },
      { label: '策略模板', value: '2 个' },
      { label: '运行中任务', value: '2' },
      { label: '待复盘告警', value: '2' },
    ]);

    expect(model.focusItems[0].detail).toContain('基础设施');
    expect(model.focusItems[2].detail).toContain('运行中 2');
    expect(model.focusItems[2].detail).toContain('失败 1');
    expect(model.focusItems[2].detail).toContain('celery / local');

    expect(model.tabs.map((item) => item.key)).toEqual([
      'optimizer',
      'backtest-enhance',
      'risk',
      'valuation',
      'industry',
      'industry-intel',
      'signal-validation',
      'factor',
      'infrastructure',
      'ops',
    ]);

    const infrastructureTab = model.tabs.find((item) => item.key === 'infrastructure');
    expect(infrastructureTab.children.props.configDiffRows).toEqual([
      { path: 'auth.required', before: false, after: true, key: 'auth.required-0' },
    ]);
    expect(infrastructureTab.children.props.configVersionRows).toEqual([
      { id: 'cfg-1', created_at: '2026-04-20T10:00:00Z', key: 'cfg-1' },
    ]);
    expect(infrastructureTab.children.props.infrastructureTaskRows).toEqual([
      { id: 'task-1', name: 'quant_strategy_optimizer', key: 'task-1' },
    ]);

    const optimizerTab = model.tabs.find((item) => item.key === 'optimizer');
    expect(optimizerTab.children.props.strategies).toEqual([
      { name: 'moving_average' },
      { name: 'mean_reversion' },
    ]);
  });
});
