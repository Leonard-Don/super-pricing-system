import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/api', () => ({
  __esModule: true,
  getAltDataNarrative: jest.fn(),
}));

import { getAltDataNarrative } from '../../../services/api';
import AltDataNarrativeTile, { formatGeneratedAt } from '../AltDataNarrativeTile';

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

function buildNarrativePayload(overrides = {}) {
  return {
    summary:
      '政策雷达本周捕获 12 条政策记录(fed=5、ecb=4 主导，CN 端 ndrc=3 贡献 3 条)，最高影响力指向 "新能源汽车"(avg_impact=-0.35, 偏空)。 ' +
      '宏观高频库存信号：SHFE 铜 destocking (库存去化); LME 铜/铝 destocking (库存去化)。 ' +
      '综合判读：铜/铝 等能源金属库存去化，价格上行压力，新能源汽车 板块短期承压。',
    bullets: [
      '政策雷达本周捕获 12 条政策记录(fed=5、ecb=4 主导，CN 端 ndrc=3 贡献 3 条)，最高影响力指向 "新能源汽车"(avg_impact=-0.35, 偏空)。',
      '宏观高频库存信号：SHFE 铜 destocking (库存去化); LME 铜/铝 destocking (库存去化)。',
      '综合判读：铜/铝 等能源金属库存去化，价格上行压力，新能源汽车 板块短期承压。',
    ],
    evidence_links: [
      {
        component: 'policy_radar',
        snapshot_path: 'cache/alt_data/providers/policy_radar.json',
        verdict: 'WORKING-PROTOTYPE',
        stale: false,
        last_refresh_at: '2026-05-16T11:30:00+00:00',
      },
      {
        component: 'macro_hf',
        snapshot_path: 'cache/alt_data/providers/macro_hf.json',
        verdict: 'WORKING-PROTOTYPE',
        stale: false,
        last_refresh_at: '2026-05-16T11:30:00+00:00',
      },
      {
        component: 'alt_data_audit',
        snapshot_path: 'docs/alt_data_audit.md',
        verdict: 'DERIVED',
        stale: false,
        last_refresh_at: null,
      },
    ],
    generated_at: '2026-05-16T11:55:00+00:00',
    audit_doc_url: 'docs/alt_data_audit.md',
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('formatGeneratedAt', () => {
  test('5 minutes ago renders as "5 min ago"', () => {
    const value = new Date(FIXED_NOW.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatGeneratedAt(value, FIXED_NOW)).toBe('5 min ago');
  });

  test('null renders placeholder', () => {
    expect(formatGeneratedAt(null, FIXED_NOW)).toBe('—');
  });
});

describe('<AltDataNarrativeTile />', () => {
  test('renders summary paragraph + bullets with verdict tags on happy path', async () => {
    getAltDataNarrative.mockResolvedValueOnce(buildNarrativePayload());

    render(<AltDataNarrativeTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-narrative-summary')).toBeInTheDocument();
    });

    // Summary paragraph rendered with the 3-sentence content.
    expect(screen.getByTestId('alt-data-narrative-summary').textContent).toContain('政策雷达');
    expect(screen.getByTestId('alt-data-narrative-summary').textContent).toContain('综合判读');

    // Three bullet rows (policy WP, macro WP, derived takeaway).
    expect(screen.getAllByTestId('alt-data-narrative-bullet-WORKING-PROTOTYPE')).toHaveLength(2);
    expect(screen.getAllByTestId('alt-data-narrative-bullet-DERIVED')).toHaveLength(1);

    // Evidence links present.
    expect(screen.getByTestId('alt-data-narrative-link-policy_radar')).toBeInTheDocument();
    expect(screen.getByTestId('alt-data-narrative-link-macro_hf')).toBeInTheDocument();
  });

  test('stale evidence renders the stale chip in red', async () => {
    const payload = buildNarrativePayload();
    payload.evidence_links[0].stale = true;
    getAltDataNarrative.mockResolvedValueOnce(payload);

    render(<AltDataNarrativeTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-narrative-summary')).toBeInTheDocument();
    });

    const staleChips = screen.getAllByTestId('alt-data-narrative-stale-stale');
    expect(staleChips.length).toBeGreaterThanOrEqual(1);
    expect(staleChips[0]).toHaveTextContent('[stale]');
  });

  test('endpoint error renders Alert without crashing', async () => {
    getAltDataNarrative.mockRejectedValueOnce(new Error('boom — narrative unreachable'));

    render(<AltDataNarrativeTile />);
    await flushAsync();

    await waitFor(() => expect(screen.getByTestId('alt-data-narrative-error')).toBeInTheDocument());

    expect(screen.getByText(/无法加载另类数据要点摘要/)).toBeInTheDocument();
    expect(screen.getByText(/boom — narrative unreachable/)).toBeInTheDocument();
    expect(screen.queryByTestId('alt-data-narrative-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('alt-data-narrative-tile')).toBeInTheDocument();
  });

  test('refresh button triggers a re-fetch', async () => {
    getAltDataNarrative.mockResolvedValueOnce(buildNarrativePayload());
    getAltDataNarrative.mockResolvedValueOnce(
      buildNarrativePayload({ summary: 'alt-data 暂无信号', bullets: [], evidence_links: [] })
    );

    render(<AltDataNarrativeTile />);
    await flushAsync();
    await waitFor(() => expect(screen.getByTestId('alt-data-narrative-summary')).toBeInTheDocument());

    expect(getAltDataNarrative).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('alt-data-narrative-refresh'));
    await flushAsync();

    await waitFor(() => expect(getAltDataNarrative).toHaveBeenCalledTimes(2));
  });

  test('empty narrative renders the empty-state Empty component', async () => {
    getAltDataNarrative.mockResolvedValueOnce({
      summary: 'alt-data 暂无信号',
      bullets: [],
      evidence_links: [],
      generated_at: '2026-05-16T11:55:00+00:00',
      audit_doc_url: 'docs/alt_data_audit.md',
    });

    render(<AltDataNarrativeTile />);
    await flushAsync();

    await waitFor(() => expect(screen.getByText('alt-data 暂无信号')).toBeInTheDocument());
    expect(screen.queryByTestId('alt-data-narrative-summary')).not.toBeInTheDocument();
  });
});
