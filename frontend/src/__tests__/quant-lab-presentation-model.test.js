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
        factorLoading: false,
        factorResult: null,
        queuedTaskLoading: {},
        valuationLoading: false,
        valuationResult: null,
      },
      forms: createFormsBundle(),
      helpers: {
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
        infraHydrated: true,
        infraLoading: false,
        infrastructureStatus: {
          task_queue: {
            queued_or_running: 2,
            failed: 1,
            execution_backends: ['celery', 'local'],
          },
        },
        infrastructureTasks: [
          { id: 'task-1', name: 'quant_valuation_lab' },
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
        opsHydrated: true,
        opsLoading: false,
        tradingJournal: {
          summary: {
            total_trades: 12,
          },
        },
      },
    });

    expect(model.heroMetrics).toEqual([
      { label: '定价内核', value: '2 个' },
      { label: '已迁移', value: '6 个' },
      { label: '内部支撑', value: '2 个' },
      { label: '运行中任务', value: '2' },
    ]);

    expect(model.activeBoundary.label).toBe('内部支撑');
    expect(model.boundarySummary.map((item) => item.label)).toEqual([
      '定价内核',
      '已迁移',
      '内部支撑',
    ]);
    expect(model.focusItems[0].detail).toContain('内部支撑');
    expect(model.focusItems[1].detail).toContain('quant-trading-system');
    expect(model.focusItems[2].detail).toContain('运行中 2');
    expect(model.focusItems[2].detail).toContain('失败 1');
    expect(model.focusItems[2].detail).toContain('celery / local');

    expect(model.tabs.map((item) => item.key)).toEqual([
      'valuation',
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
      { id: 'task-1', name: 'quant_valuation_lab', key: 'task-1' },
    ]);
  });
});
