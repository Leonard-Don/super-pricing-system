import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/api', () => ({
  __esModule: true,
  getAltDataHealth: jest.fn(),
}));

import { getAltDataHealth } from '../../../services/api';
import AltDataHealthTile, { formatRelativeRefresh } from '../AltDataHealthTile';

const FIXED_NOW = new Date('2026-05-16T12:00:00Z');

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

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

function buildHealthPayload(overrides = {}) {
  // 30 分钟前与 11 天前的快照时间戳，覆盖 fresh / stale 分支
  const thirtyMinAgo = new Date(FIXED_NOW.getTime() - 30 * 60 * 1000).toISOString();
  const elevenDaysAgo = new Date(FIXED_NOW.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString();
  const sevenHoursAgo = new Date(FIXED_NOW.getTime() - 7 * 60 * 60 * 1000).toISOString();

  return {
    manifest: [
      {
        name: 'policy_radar',
        sub_package: 'policy_radar',
        source: 'fed/ecb RSS',
        cadence_minutes: 60,
        persistence_target: 'cache/alt_data/providers/policy_radar.json',
        verdict: 'WORKING-PROTOTYPE',
        audit_section_ref: 'docs/alt_data_audit.md#policy_radar',
        last_refresh_at: thirtyMinAgo,
        notes: 'Phase D selectors',
      },
      {
        name: 'policy_execution',
        sub_package: 'policy_radar/policy_execution',
        source: 'derived',
        cadence_minutes: 60,
        persistence_target: 'cache/alt_data/providers/policy_execution.json',
        verdict: 'WORKING-PROTOTYPE',
        audit_section_ref: 'docs/alt_data_audit.md#policy_execution',
        last_refresh_at: sevenHoursAgo,
        notes: 'derived',
      },
      {
        name: 'lme_inventory',
        sub_package: 'macro_hf',
        source: 'lme proxy',
        cadence_minutes: 360,
        persistence_target: 'cache/alt_data/providers/lme_inventory.json',
        verdict: 'WORKING-PROTOTYPE',
        audit_section_ref: 'docs/alt_data_audit.md#lme_inventory',
        last_refresh_at: elevenDaysAgo,
        notes: 'US side proxy',
      },
      {
        name: 'shfe_inventory',
        sub_package: 'macro_hf',
        source: 'shfe live',
        cadence_minutes: 360,
        persistence_target: 'cache/alt_data/providers/shfe_inventory.json',
        verdict: 'WORKING-PROTOTYPE',
        audit_section_ref: 'docs/alt_data_audit.md#shfe_inventory',
        last_refresh_at: thirtyMinAgo,
        notes: 'Phase B live CN side',
      },
      {
        name: 'people_layer',
        sub_package: 'people_layer',
        source: 'curated',
        cadence_minutes: 1440,
        persistence_target: 'cache/alt_data/providers/people_layer.json',
        verdict: 'PRODUCTION',
        audit_section_ref: 'docs/alt_data_audit.md#people_layer',
        last_refresh_at: thirtyMinAgo,
        notes: 'lag_days=21',
      },
      {
        name: 'entity_resolution',
        sub_package: 'entity_resolution',
        source: 'utility',
        cadence_minutes: null,
        persistence_target: '',
        verdict: 'PRODUCTION',
        audit_section_ref: 'docs/alt_data_audit.md#entity_resolution',
        last_refresh_at: null,
        notes: 'utility module',
      },
      {
        name: 'governance',
        sub_package: 'governance',
        source: 'infrastructure',
        cadence_minutes: null,
        persistence_target: '',
        verdict: 'PRODUCTION',
        audit_section_ref: 'docs/alt_data_audit.md#governance',
        last_refresh_at: null,
        notes: 'infra',
      },
    ],
    generated_at: '2026-05-16T11:52:00+00:00',
    audit_doc_url: 'docs/alt_data_audit.md',
    total_components: 7,
    production_count: 3,
    working_prototype_count: 4,
    scaffolding_only_count: 0,
    dead_count: 0,
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('formatRelativeRefresh', () => {
  test('30 minutes ago renders as fresh', () => {
    const value = new Date(FIXED_NOW.getTime() - 30 * 60 * 1000).toISOString();
    expect(formatRelativeRefresh(value, FIXED_NOW)).toEqual({ label: '30 min ago', tone: 'fresh' });
  });

  test('11 days ago renders as stale', () => {
    const value = new Date(FIXED_NOW.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeRefresh(value, FIXED_NOW)).toEqual({ label: 'stale 11 days', tone: 'stale' });
  });

  test('null renders placeholder', () => {
    expect(formatRelativeRefresh(null, FIXED_NOW)).toEqual({ label: '—', tone: 'placeholder' });
  });
});

describe('<AltDataHealthTile />', () => {
  test('renders 7 manifest rows with correct verdict tags', async () => {
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload());

    render(<AltDataHealthTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-health-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('alt-data-health-table');
    // 7 rows + 1 header row
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBe(8);

    // 3 PRODUCTION + 4 WORKING-PROTOTYPE verdict tags
    expect(within(table).getAllByTestId('alt-data-health-verdict-PRODUCTION')).toHaveLength(3);
    expect(within(table).getAllByTestId('alt-data-health-verdict-WORKING-PROTOTYPE')).toHaveLength(4);
  });

  test('renders summary counts (3 PROD / 4 WORKING / 0 / 0)', async () => {
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload());

    render(<AltDataHealthTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-health-summary')).toBeInTheDocument();
    });

    const summary = screen.getByTestId('alt-data-health-summary');
    expect(within(screen.getByTestId('alt-data-health-stat-production_count')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('alt-data-health-stat-working_prototype_count')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('alt-data-health-stat-scaffolding_only_count')).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('alt-data-health-stat-dead_count')).getByText('0')).toBeInTheDocument();
    expect(summary).toBeInTheDocument();
  });

  test('11-day-old refresh classified as stale (red), 30-min-old classified as fresh (green)', async () => {
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload());

    render(<AltDataHealthTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-health-table')).toBeInTheDocument();
    });

    // lme_inventory: 11 days ago → stale
    expect(screen.getByText('stale 11 days')).toBeInTheDocument();
    const stale = screen.getByText('stale 11 days');
    expect(stale).toHaveStyle({ color: '#ff4d4f' });

    // Multiple rows are 30 min ago (policy_radar, shfe_inventory, people_layer)
    const freshLabels = screen.getAllByText('30 min ago');
    expect(freshLabels.length).toBeGreaterThanOrEqual(1);
    freshLabels.forEach((node) => expect(node).toHaveStyle({ color: '#52c41a' }));
  });

  test('null last_refresh_at renders the — placeholder', async () => {
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload());

    render(<AltDataHealthTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-health-table')).toBeInTheDocument();
    });

    // entity_resolution + governance both have null last_refresh_at → 2 placeholders
    const placeholders = screen.getAllByTestId('alt-data-health-refresh-placeholder');
    expect(placeholders.length).toBe(2);
    placeholders.forEach((node) => expect(node).toHaveTextContent('—'));
  });

  test('refresh button triggers a re-fetch', async () => {
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload());
    getAltDataHealth.mockResolvedValueOnce(buildHealthPayload({ production_count: 5, total_components: 8 }));

    render(<AltDataHealthTile />);
    await flushAsync();
    await waitFor(() => expect(screen.getByTestId('alt-data-health-table')).toBeInTheDocument());

    expect(getAltDataHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('alt-data-health-refresh'));
    await flushAsync();

    await waitFor(() => expect(getAltDataHealth).toHaveBeenCalledTimes(2));
  });

  test('endpoint error renders Alert without crashing', async () => {
    getAltDataHealth.mockRejectedValueOnce(new Error('boom — endpoint unreachable'));

    render(<AltDataHealthTile />);
    await flushAsync();

    await waitFor(() => expect(screen.getByTestId('alt-data-health-error')).toBeInTheDocument());

    expect(screen.getByText(/无法加载另类数据健康清单/)).toBeInTheDocument();
    expect(screen.getByText(/boom — endpoint unreachable/)).toBeInTheDocument();
    // 列表不渲染、组件没崩
    expect(screen.queryByTestId('alt-data-health-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('alt-data-health-tile')).toBeInTheDocument();
  });
});
