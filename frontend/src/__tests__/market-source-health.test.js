import {
  formatMarketSourceHealthReport,
  formatQuantLabProviderHealthReport,
  summarizeFetchSourceHealth,
} from '../utils/marketSourceHealth';

const FIXED_NOW = new Date('2026-05-14T08:00:00Z');

const buildReport = (overrides = {}) => ({
  checked_at: '2026-05-14T07:59:30Z',
  default_source: 'xueqiu_v1',
  fallback_enabled: true,
  configured_sources: ['xueqiu_v1', 'sina', 'yahoo_legacy'],
  active_provider_count: 2,
  configured_provider_count: 3,
  sources: [
    {
      id: 'xueqiu_v1',
      name: 'xueqiu_v1',
      label: '雪球 V1',
      ok: true,
      status: 'ready',
      reason: null,
      required: true,
      fallback: false,
      requires_api_key: false,
      priority: 1,
      rate_limit: null,
      capabilities: { historical_data: true, latest_quote: true },
      checked_at: '2026-05-14T07:59:30Z',
    },
    {
      id: 'sina',
      name: 'sina',
      label: '新浪财经',
      ok: true,
      status: 'ready',
      reason: null,
      required: false,
      fallback: true,
      requires_api_key: false,
      priority: 2,
      rate_limit: '5 r/s',
      capabilities: { historical_data: true, latest_quote: false },
      checked_at: '2026-05-14T07:59:30Z',
    },
    {
      id: 'yahoo_legacy',
      name: 'yahoo_legacy',
      label: 'Yahoo legacy',
      ok: false,
      status: 'missing',
      reason: '未配置 YAHOO_API_KEY',
      required: false,
      fallback: true,
      requires_api_key: true,
      priority: 3,
      rate_limit: null,
      capabilities: { historical_data: true },
      checked_at: '2026-05-14T07:59:30Z',
    },
  ],
  last_fetch: null,
  ...overrides,
});

describe('formatMarketSourceHealthReport', () => {
  test('returns unknown tone when report is null/empty', () => {
    expect(formatMarketSourceHealthReport(null, { now: FIXED_NOW })).toEqual(
      expect.objectContaining({
        tone: 'unknown',
        summary: '暂无数据源健康信息',
        sources: [],
      })
    );
    expect(formatMarketSourceHealthReport({}, { now: FIXED_NOW })).toEqual(
      expect.objectContaining({ tone: 'unknown', sources: [] })
    );
  });

  test('marks aggregate as degraded when a non-required source is missing api key', () => {
    const model = formatMarketSourceHealthReport(buildReport(), { now: FIXED_NOW });
    expect(model.tone).toBe('degraded');
    expect(model.headline.ready).toBe(2);
    expect(model.headline.total).toBe(3);
    expect(model.headline.missingKeys).toBe(1);
    expect(model.headline.fallbackEnabled).toBe(true);
    expect(model.headline.defaultLabel).toBe('雪球 V1');
    expect(model.summary).toContain('2/3');
  });

  test('aggregate is healthy when every source is ok', () => {
    const report = buildReport({
      sources: [
        {
          id: 'xueqiu_v1',
          label: '雪球 V1',
          ok: true,
          status: 'ready',
          required: true,
          capabilities: { historical_data: true },
          checked_at: '2026-05-14T07:59:30Z',
        },
      ],
      active_provider_count: 1,
      configured_provider_count: 1,
      configured_sources: ['xueqiu_v1'],
    });
    const model = formatMarketSourceHealthReport(report, { now: FIXED_NOW });
    expect(model.tone).toBe('healthy');
    expect(model.headline.missingKeys).toBe(0);
    expect(model.summary).toContain('1/1');
  });

  test('aggregate escalates to down when a required source is not ok', () => {
    const report = buildReport({
      sources: [
        {
          id: 'xueqiu_v1',
          label: '雪球 V1',
          ok: false,
          status: 'error',
          required: true,
          reason: '初始化失败',
          capabilities: { historical_data: true },
          checked_at: '2026-05-14T07:59:30Z',
        },
        {
          id: 'sina',
          label: '新浪财经',
          ok: true,
          status: 'ready',
          required: false,
          capabilities: { historical_data: true },
          checked_at: '2026-05-14T07:59:30Z',
        },
      ],
    });
    const model = formatMarketSourceHealthReport(report, { now: FIXED_NOW });
    expect(model.tone).toBe('down');
    const required = model.sources.find((entry) => entry.required);
    expect(required.tone).toBe('bad');
    expect(required.statusLabel).toBe('错误');
    expect(required.reason).toBe('初始化失败');
  });

  test('translates capabilities and status to human labels', () => {
    const model = formatMarketSourceHealthReport(buildReport(), { now: FIXED_NOW });
    const yahoo = model.sources.find((entry) => entry.id === 'yahoo_legacy');
    expect(yahoo.tone).toBe('warn');
    expect(yahoo.statusLabel).toBe('缺凭证');
    expect(yahoo.requiresKey).toBe(true);
    expect(yahoo.capabilityTags).toEqual(['历史数据']);
    const xueqiu = model.sources.find((entry) => entry.id === 'xueqiu_v1');
    expect(xueqiu.capabilityTags.sort()).toEqual(['历史数据', '实时报价']);
  });

  test('reports relative freshness label based on checked_at and provided now', () => {
    const recent = formatMarketSourceHealthReport(
      buildReport({ checked_at: '2026-05-14T07:59:30Z' }),
      { now: FIXED_NOW }
    );
    expect(recent.freshnessLabel).toBe('刚刚');
    const fiveMinAgo = formatMarketSourceHealthReport(
      buildReport({ checked_at: '2026-05-14T07:55:00Z' }),
      { now: FIXED_NOW }
    );
    expect(fiveMinAgo.freshnessLabel).toBe('5 分钟前');
    const hoursAgo = formatMarketSourceHealthReport(
      buildReport({ checked_at: '2026-05-14T04:00:00Z' }),
      { now: FIXED_NOW }
    );
    expect(hoursAgo.freshnessLabel).toBe('4 小时前');
  });

  test('falls back gracefully when checked_at is missing', () => {
    const model = formatMarketSourceHealthReport(
      buildReport({ checked_at: null }),
      { now: FIXED_NOW }
    );
    expect(model.freshnessLabel).toBe('未知');
  });
});

describe('formatQuantLabProviderHealthReport', () => {
  test('adapts Quant Lab provider rows into the shared source registry model', () => {
    const model = formatQuantLabProviderHealthReport(
      {
        checked_at: '2026-05-14T07:55:00Z',
        default_provider: 'akshare',
        fallback_enabled: true,
        providers: [
          {
            provider: 'akshare',
            status: 'available',
            latency_ms: 12.5,
            completeness_score: 0.98,
            audit_flags: [],
            required: true,
            capabilities: { historical_data: true },
          },
          {
            provider: 'yfinance',
            status: 'degraded',
            latency_ms: 220.2,
            completeness_score: 0.62,
            audit_flags: ['stale', 'fallback_used'],
            fallback: true,
            capabilities: { historical_data: true },
          },
        ],
      },
      { now: FIXED_NOW }
    );

    expect(model.tone).toBe('degraded');
    expect(model.summary).toContain('1/2 数据源就绪');
    expect(model.headline.defaultLabel).toBe('AKShare');
    expect(model.headline.fallbackEnabled).toBe(true);
    expect(model.sources[0]).toEqual(
      expect.objectContaining({
        id: 'akshare',
        label: 'AKShare',
        tone: 'ok',
        required: true,
        rateLimit: null,
      })
    );
    expect(model.sources[1]).toEqual(
      expect.objectContaining({
        id: 'yfinance',
        tone: 'warn',
        isFallback: true,
        reason: 'stale · fallback_used',
      })
    );
  });
});

describe('summarizeFetchSourceHealth', () => {
  test('returns null view-model when payload is missing or empty', () => {
    expect(summarizeFetchSourceHealth(null, { now: FIXED_NOW })).toBeNull();
    expect(summarizeFetchSourceHealth({}, { now: FIXED_NOW })).toBeNull();
    expect(summarizeFetchSourceHealth({ attempts: [] }, { now: FIXED_NOW })).toBeNull();
  });

  test('summarizes a successful single-attempt fetch with no fallback', () => {
    const summary = summarizeFetchSourceHealth(
      {
        checked_at: '2026-05-14T07:59:30Z',
        symbol: 'AAPL',
        interval: '1d',
        status: 'success',
        selected_source: 'xueqiu_v1',
        fallback_used: false,
        attempts: [
          {
            id: 'xueqiu_v1',
            ok: true,
            status: 'success',
            reason: null,
            row_count: 250,
            fallback: false,
            checked_at: '2026-05-14T07:59:30Z',
          },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(summary.tone).toBe('ok');
    expect(summary.headline).toContain('AAPL');
    expect(summary.headline).toContain('1d');
    expect(summary.headline).toContain('雪球 V1');
    expect(summary.fallbackUsed).toBe(false);
    expect(summary.attempts).toHaveLength(1);
    expect(summary.attempts[0]).toEqual(
      expect.objectContaining({
        id: 'xueqiu_v1',
        tone: 'ok',
        statusLabel: '成功',
        rowCount: 250,
        isFallback: false,
      })
    );
  });

  test('marks fetch as fallback-recovery when primary failed but fallback succeeded', () => {
    const summary = summarizeFetchSourceHealth(
      {
        checked_at: '2026-05-14T07:59:30Z',
        symbol: '600519',
        interval: '1d',
        status: 'success',
        selected_source: 'yahoo_legacy',
        fallback_used: true,
        attempts: [
          {
            id: 'xueqiu_v1',
            ok: false,
            status: 'error',
            reason: 'rate_limited',
            row_count: 0,
            fallback: false,
            checked_at: '2026-05-14T07:59:00Z',
          },
          {
            id: 'yahoo_legacy',
            ok: true,
            status: 'success',
            reason: null,
            row_count: 120,
            fallback: true,
            checked_at: '2026-05-14T07:59:30Z',
          },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(summary.tone).toBe('warn');
    expect(summary.fallbackUsed).toBe(true);
    expect(summary.headline).toContain('故障转移至');
    expect(summary.attempts[0]).toEqual(
      expect.objectContaining({ id: 'xueqiu_v1', tone: 'bad', statusLabel: '错误' })
    );
    expect(summary.attempts[1]).toEqual(
      expect.objectContaining({ id: 'yahoo_legacy', tone: 'ok', isFallback: true })
    );
  });

  test('marks fetch as failed when all attempts failed and no rows returned', () => {
    const summary = summarizeFetchSourceHealth(
      {
        checked_at: '2026-05-14T07:59:30Z',
        symbol: '600519',
        interval: '1d',
        status: 'empty',
        selected_source: null,
        fallback_used: true,
        attempts: [
          {
            id: 'xueqiu_v1',
            ok: false,
            status: 'error',
            reason: 'rate_limited',
            row_count: 0,
            fallback: false,
            checked_at: '2026-05-14T07:59:00Z',
          },
          {
            id: 'yahoo_legacy',
            ok: false,
            status: 'empty',
            reason: 'empty_frame',
            row_count: 0,
            fallback: true,
            checked_at: '2026-05-14T07:59:30Z',
          },
        ],
      },
      { now: FIXED_NOW }
    );
    expect(summary.tone).toBe('bad');
    expect(summary.headline).toContain('未取到行情');
    expect(summary.attempts.every((entry) => entry.tone === 'bad')).toBe(true);
  });

  test('uses source alias when selected source is not present in attempts', () => {
    const summary = summarizeFetchSourceHealth(
      {
        checked_at: '2026-05-14T07:59:30Z',
        symbol: '000001',
        interval: '1d',
        selected_source: 'sina',
        fallback_used: false,
        attempts: [
          {
            id: 'unknown_provider',
            ok: true,
            status: 'success',
            row_count: 12,
            fallback: false,
            checked_at: '2026-05-14T07:59:30Z',
          },
        ],
      },
      { now: FIXED_NOW }
    );

    expect(summary.selectedLabel).toBe('新浪财经');
    expect(summary.headline).toContain('主源 新浪财经');
  });
});
