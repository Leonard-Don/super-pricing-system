import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/api', () => ({
  __esModule: true,
  getAltDataNarrative: jest.fn(),
}));

import { getAltDataNarrative } from '../../../services/api';
import AltDataContextPanel from '../AltDataContextPanel';

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

afterEach(() => {
  jest.clearAllMocks();
});

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buildIndustryPayload(overrides = {}) {
  return {
    summary:
      '政策雷达本周捕获 8 条 新能源汽车 相关政策记录(ecb=4、fed=4 主导)，新能源汽车 行业影响力 avg_impact=-0.35, 偏空。 ' +
      '宏观高频库存信号（新能源汽车 相关金属）：SHFE 铜 destocking (库存去化)。 ' +
      '综合判读：铜 等能源金属库存去化，价格上行压力，新能源汽车 板块短期承压。',
    bullets: [
      '政策雷达本周捕获 8 条 新能源汽车 相关政策记录(ecb=4、fed=4 主导)，新能源汽车 行业影响力 avg_impact=-0.35, 偏空。',
      '宏观高频库存信号（新能源汽车 相关金属）：SHFE 铜 destocking (库存去化)。',
      '综合判读：铜 等能源金属库存去化，价格上行压力，新能源汽车 板块短期承压。',
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
    industry_scope: '新能源汽车',
    ...overrides,
  };
}

describe('<AltDataContextPanel />', () => {
  test('renders three-row narrative scoped to the industry, with evidence chips', async () => {
    getAltDataNarrative.mockResolvedValueOnce(buildIndustryPayload());

    render(<AltDataContextPanel ticker="300750.SZ" industry="新能源汽车" />);
    await flushAsync();

    // Verify the api was called with the industry-scoped param shape.
    expect(getAltDataNarrative).toHaveBeenCalledWith({ industry: '新能源汽车' });

    await waitFor(() => {
      expect(screen.getByTestId('pricing-alt-data-context-summary')).toBeInTheDocument();
    });

    // Industry-scoped framing surfaces in summary text.
    expect(screen.getByTestId('pricing-alt-data-context-summary').textContent).toContain(
      '新能源汽车 相关政策记录'
    );
    expect(screen.getByTestId('pricing-alt-data-context-summary').textContent).toContain(
      '新能源汽车 相关金属'
    );

    // 3-bullet breakdown: policy + macro WP + derived takeaway.
    expect(screen.getAllByTestId('pricing-alt-data-context-bullet-WORKING-PROTOTYPE')).toHaveLength(2);
    expect(screen.getAllByTestId('pricing-alt-data-context-bullet-DERIVED')).toHaveLength(1);

    // Evidence link rendering.
    expect(screen.getByTestId('pricing-alt-data-context-link-policy_radar')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-alt-data-context-link-macro_hf')).toBeInTheDocument();

    // Header subtitle shows the resolved industry + uppercased ticker.
    expect(screen.getByTestId('pricing-alt-data-context-scope').textContent).toContain('新能源汽车');
    expect(screen.getByTestId('pricing-alt-data-context-scope').textContent).toContain('300750.SZ');
  });

  test('no industry-scoped signal -> renders Empty state with degraded copy', async () => {
    getAltDataNarrative.mockResolvedValueOnce({
      summary: '本行业暂无显著另类数据信号',
      bullets: [],
      evidence_links: [],
      generated_at: '2026-05-16T11:55:00+00:00',
      audit_doc_url: 'docs/alt_data_audit.md',
      industry_scope: '风电',
    });

    render(<AltDataContextPanel ticker="601179" industry="风电" />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('pricing-alt-data-context-empty')).toBeInTheDocument();
    });

    // Degraded summary is shown verbatim inside the Empty component.
    expect(screen.getByText('本行业暂无显著另类数据信号')).toBeInTheDocument();
    // No summary paragraph rendered.
    expect(screen.queryByTestId('pricing-alt-data-context-summary')).not.toBeInTheDocument();
  });

  test('endpoint error -> Alert rendered without crashing the card', async () => {
    getAltDataNarrative.mockRejectedValueOnce(new Error('boom — narrative unreachable'));

    render(<AltDataContextPanel ticker="TSLA" industry="新能源汽车" />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('pricing-alt-data-context-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/无法加载另类数据上下文/)).toBeInTheDocument();
    expect(screen.getByText(/boom — narrative unreachable/)).toBeInTheDocument();
    // Card shell is still present so the page layout stays stable.
    expect(screen.getByTestId('pricing-alt-data-context')).toBeInTheDocument();
  });

  test('missing industry prop -> no api call, "未识别行业" empty state', async () => {
    render(<AltDataContextPanel ticker="UNK" industry={null} />);
    await flushAsync();

    // No network call when industry is unknown.
    expect(getAltDataNarrative).not.toHaveBeenCalled();
    expect(screen.getByTestId('pricing-alt-data-context-no-industry')).toBeInTheDocument();
    expect(screen.getByTestId('pricing-alt-data-context-scope').textContent).toContain('未识别行业');
  });
});
