import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarketSourceHealthCard from '../components/MarketSourceHealthCard';
import { formatMarketSourceHealthReport } from '../utils/marketSourceHealth';

const FIXED_NOW = new Date('2026-05-14T08:00:00Z');

beforeAll(() => {
  const matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });

  Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
  Object.defineProperty(global, 'matchMedia', { writable: true, value: matchMedia });
});

const buildReport = () => ({
  checked_at: '2026-05-14T07:55:00Z',
  default_source: 'xueqiu_v1',
  fallback_enabled: true,
  configured_sources: ['xueqiu_v1', 'yahoo_legacy'],
  sources: [
    {
      id: 'xueqiu_v1',
      label: '雪球 V1',
      ok: true,
      status: 'ready',
      required: true,
      fallback: false,
      requires_api_key: false,
      priority: 1,
      rate_limit: null,
      capabilities: { historical_data: true, latest_quote: true },
      checked_at: '2026-05-14T07:55:00Z',
    },
    {
      id: 'yahoo_legacy',
      label: 'Yahoo legacy',
      ok: false,
      status: 'missing',
      reason: '未配置 YAHOO_API_KEY',
      required: false,
      fallback: true,
      requires_api_key: true,
      priority: 2,
      rate_limit: '5 r/s',
      capabilities: { historical_data: true },
      checked_at: '2026-05-14T07:55:00Z',
    },
  ],
  last_fetch: {
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
});

describe('<MarketSourceHealthCard />', () => {
  test('renders empty state when no model provided', () => {
    render(<MarketSourceHealthCard model={null} />);
    expect(screen.getByText('暂无数据源健康信息')).toBeInTheDocument();
  });

  test('renders aggregate tone, per-source rows and fallback last-fetch summary', () => {
    const model = formatMarketSourceHealthReport(buildReport(), { now: FIXED_NOW });
    render(<MarketSourceHealthCard model={model} />);

    expect(screen.getByTestId('market-source-health-tone')).toHaveTextContent('部分降级');
    expect(screen.getByText(/1\/2 数据源就绪/)).toBeInTheDocument();
    expect(screen.getByText(/故障转移已启用/)).toBeInTheDocument();
    expect(screen.getByText(/缺 1 个 key/)).toBeInTheDocument();
    expect(screen.getByText(/主源：雪球 V1/)).toBeInTheDocument();

    expect(screen.getAllByText('雪球 V1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Yahoo legacy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('需 API key')).toBeInTheDocument();
    expect(screen.getByText('5 r/s')).toBeInTheDocument();
    expect(screen.getByText('未配置 YAHOO_API_KEY')).toBeInTheDocument();

    const lastFetch = screen.getByTestId('market-source-health-last-fetch');
    expect(within(lastFetch).getByText(/故障转移至 Yahoo legacy/)).toBeInTheDocument();
    expect(within(lastFetch).getByText('120 行')).toBeInTheDocument();
  });

  test('renders a degraded tone with no last-fetch block when missing', () => {
    const model = formatMarketSourceHealthReport(buildReport(), { now: FIXED_NOW });
    model.lastFetch = null;
    render(<MarketSourceHealthCard model={model} title="自定义标题" />);

    expect(screen.getByText('自定义标题')).toBeInTheDocument();
    expect(screen.queryByTestId('market-source-health-last-fetch')).not.toBeInTheDocument();
  });
});
