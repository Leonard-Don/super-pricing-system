const mockPost = jest.fn();
const mockGet = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: mockPost,
    get: mockGet,
    put: mockPut,
    delete: mockDelete,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  isCancel: jest.fn(() => false),
}));

describe('super pricing api timeouts', () => {
  beforeEach(() => {
    mockPost.mockClear();
    mockGet.mockClear();
    mockPut.mockClear();
    mockDelete.mockClear();
    mockPost.mockResolvedValue({ data: {} });
    mockGet.mockResolvedValue({ data: {} });
    mockPut.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it('uses analysis timeout profile for gap analysis and screener', async () => {
    const { API_TIMEOUT_PROFILES, getGapAnalysis, runPricingScreener } = require('../services/api');

    await getGapAnalysis('AAPL', '1y');
    await runPricingScreener(['AAPL', 'MSFT'], '1y', 10, 3);

    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      '/pricing/gap-analysis',
      { symbol: 'AAPL', period: '1y' },
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.analysis })
    );
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/pricing/screener',
      { symbols: ['AAPL', 'MSFT'], period: '1y', limit: 10, max_workers: 3 },
      expect.objectContaining({ timeout: Math.max(API_TIMEOUT_PROFILES.analysis, 180000) })
    );
  });

  it('uses dashboard and workbench timeout profiles for overview data', async () => {
    const { API_TIMEOUT_PROFILES, getMacroOverview, getResearchTasks } = require('../services/api');

    await getMacroOverview(true);
    await getResearchTasks({ limit: 20, type: 'pricing' });

    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      '/macro/overview?refresh=true',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/research-workbench/tasks?limit=20&type=pricing',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.workbench })
    );
  });

  it('exposes pricing factor model and benchmark factor endpoints through frontend helpers', async () => {
    const {
      API_TIMEOUT_PROFILES,
      getBenchmarkFactors,
      getFactorModelAnalysis,
    } = require('../services/api');

    await getFactorModelAnalysis('AAPL', '2y');
    await getBenchmarkFactors();

    expect(mockPost).toHaveBeenCalledWith(
      '/pricing/factor-model',
      { symbol: 'AAPL', period: '2y' },
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.analysis })
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/pricing/benchmark-factors',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
  });

  it('exposes advanced alt-data diagnostics endpoints through frontend helpers', async () => {
    const {
      API_TIMEOUT_PROFILES,
      getAltDataProviderCorrelation,
      getAltDataThemesWithDiversity,
      getCompositeSignalComparison,
      getCompositeSignalsClusterAware,
    } = require('../services/api');

    await getAltDataThemesWithDiversity({
      days_window: 30,
      min_conviction: 'high',
      min_providers: 2,
      cluster_threshold: 0.91,
    });
    await getAltDataProviderCorrelation({ days_window: 45 });
    await getCompositeSignalsClusterAware({ days_window: 14, cluster_threshold: 0.9, limit: 12 });
    await getCompositeSignalComparison({ days_window: 21, cluster_threshold: 0.88 });

    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      '/alt-data/themes-with-diversity?days_window=30&min_conviction=high&min_providers=2&cluster_threshold=0.91',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      '/alt-data/provider-correlation?days_window=45',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      3,
      '/alt-data/composite-signals-cluster-aware?days_window=14&cluster_threshold=0.9&limit=12',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      4,
      '/alt-data/composite-signal-comparison?days_window=21&cluster_threshold=0.88',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
  });

  it('exposes infrastructure signal panel through a frontend helper', async () => {
    const { API_TIMEOUT_PROFILES, getInfrastructureSignalPanel } = require('../services/api');

    await getInfrastructureSignalPanel({ days: 90, symbol: 'aapl', signalName: 'structural_decay', limit: 25 });

    expect(mockGet).toHaveBeenCalledWith(
      '/infrastructure/signal-panel?days=90&symbol=AAPL&signal_name=structural_decay&limit=25',
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.dashboard })
    );
  });
});
