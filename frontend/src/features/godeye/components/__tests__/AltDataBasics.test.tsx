// ---------------------------------------------------------------------------
// AltDataBasics tests (Task 11) — TDD: write first, run → fail, implement → pass
// Covers: PeopleLayerWatchlistPanel, DepartmentChaosBoard, PhysicalWorldTrackerPanel
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeopleLayerWatchlistPanel } from '../PeopleLayerWatchlistPanel';
import { DepartmentChaosBoard } from '../DepartmentChaosBoard';
import { PhysicalWorldTrackerPanel } from '../PhysicalWorldTrackerPanel';

const noop = () => undefined;

// ---------------------------------------------------------------------------
// PeopleLayerWatchlistPanel
// ---------------------------------------------------------------------------

const watchlistOverview = {
  people_layer_summary: {
    label: 'fragile',
    summary: '核心执行层高度脆弱，存在人事断层风险',
    watchlist: [
      {
        symbol: 'TSLA',
        company_name: '特斯拉',
        risk_level: 'high',
        stance: 'fragile',
        people_fragility_score: 0.87,
        people_quality_score: 0.32,
        source_modes: ['official', 'proxy'],
        summary: 'CEO 减持且高管流失加速',
      },
      {
        symbol: 'NIO',
        company_name: '蔚来',
        risk_level: 'medium',
        stance: 'watch',
        people_fragility_score: 0.55,
        people_quality_score: 0.61,
        source_modes: ['market'],
        summary: '管理层变动观察中',
      },
    ],
  },
};

describe('PeopleLayerWatchlistPanel', () => {
  it('renders panel title 人的维度观察名单', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText('人的维度观察名单')).toBeDefined();
  });

  it('renders company symbol TSLA', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText('TSLA')).toBeDefined();
  });

  it('renders company name 特斯拉', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText('特斯拉')).toBeDefined();
  });

  it('renders second company symbol NIO', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText('NIO')).toBeDefined();
  });

  it('renders overall label badge', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    // label 'fragile' should produce a 脆弱 badge — at least one occurrence
    const matches = screen.getAllByText(/脆弱/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders summary text', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText(/核心执行层高度脆弱/)).toBeDefined();
  });

  it('renders fragility score for TSLA', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    expect(screen.getByText(/0\.87/)).toBeDefined();
  });

  it('renders navigation action button for an item', () => {
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={noop} />);
    // at least one action button should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onNavigate when action button clicked', async () => {
    const onNavigate = vi.fn();
    render(<PeopleLayerWatchlistPanel overview={watchlistOverview} onNavigate={onNavigate} />);
    const [firstBtn] = screen.getAllByRole('button');
    await userEvent.click(firstBtn);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('renders empty state when no watchlist items', () => {
    render(
      <PeopleLayerWatchlistPanel
        overview={{ people_layer_summary: { watchlist: [] } }}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText(/暂无人的维度观察名单/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DepartmentChaosBoard
// ---------------------------------------------------------------------------

const chaosOverview = {
  department_chaos_summary: {
    label: 'chaotic',
    summary: '多个政策主体出现执行混乱信号',
    top_departments: [
      {
        department: 'ndrc',
        department_label: '发改委',
        label: 'chaotic',
        chaos_score: 0.78,
        policy_reversal_count: 3,
        full_text_ratio: 0.55,
        lag_days: 5,
        execution_status: 'lagging',
        reason: '多轮政策反转，执行信号延迟',
      },
      {
        department: 'pboc_mpd',
        department_label: '人民银行货币政策司',
        label: 'watch',
        chaos_score: 0.41,
        policy_reversal_count: 1,
        full_text_ratio: 0.72,
        lag_days: 2,
        execution_status: 'active',
        reason: '',
      },
    ],
  },
};

describe('DepartmentChaosBoard', () => {
  it('renders panel title 部门执行混乱看板', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    expect(screen.getByText('部门执行混乱看板')).toBeDefined();
  });

  it('renders department label 发改委', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    expect(screen.getByText(/发改委/)).toBeDefined();
  });

  it('renders chaos score for first department', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    expect(screen.getByText(/0\.78/)).toBeDefined();
  });

  it('renders overall label badge', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    // label 'chaotic' should produce 混乱 badge — at least one occurrence
    const matches = screen.getAllByText(/混乱/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('renders summary text', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    expect(screen.getByText(/多个政策主体出现执行混乱信号/)).toBeDefined();
  });

  it('renders second department 人民银行货币政策司', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    expect(screen.getByText(/人民银行货币政策司/)).toBeDefined();
  });

  it('renders action button for department items', () => {
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={noop} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onNavigate when action button clicked', async () => {
    const onNavigate = vi.fn();
    render(<DepartmentChaosBoard overview={chaosOverview} onNavigate={onNavigate} />);
    const [firstBtn] = screen.getAllByRole('button');
    await userEvent.click(firstBtn);
    expect(onNavigate).toHaveBeenCalled();
  });

  it('renders empty state with CTA when no departments', () => {
    render(
      <DepartmentChaosBoard
        overview={{ department_chaos_summary: { top_departments: [] } }}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText(/暂无部门执行混乱数据/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PhysicalWorldTrackerPanel
// ---------------------------------------------------------------------------

const physicalSnapshot = {
  signals: {
    macro_hf: {
      dimensions: {
        trade: { score: 0.65, summary: '海关数据显示贸易流量下行压力' },
        inventory: { score: 0.42, summary: 'LME 库存维持偏低' },
        logistics: { score: 0.71, summary: '港口拥堵指数大幅上升' },
      },
      latest_readings: {
        customs_data: { freshness: '2h', source_mode: 'official', fallback_reason: '' },
        lme_inventory: { freshness: '4h', source_mode: 'market', fallback_reason: '' },
        port_congestion: { freshness: '1h', source_mode: 'proxy', fallback_reason: '官方延迟' },
      },
    },
  },
};

describe('PhysicalWorldTrackerPanel', () => {
  it('renders panel title 实体世界追踪', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText('实体世界追踪')).toBeDefined();
  });

  it('renders 海关 / 贸易脉冲 card title', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText('海关 / 贸易脉冲')).toBeDefined();
  });

  it('renders LME / 库存压力 card title', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText('LME / 库存压力')).toBeDefined();
  });

  it('renders 港口 / 物流摩擦 card title', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText('港口 / 物流摩擦')).toBeDefined();
  });

  it('renders trade score 0.65', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText(/0\.65/)).toBeDefined();
  });

  it('renders trade summary text', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText(/海关数据显示贸易流量下行压力/)).toBeDefined();
  });

  it('renders logistics summary text', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText(/港口拥堵指数大幅上升/)).toBeDefined();
  });

  it('renders fallback reason text', () => {
    render(<PhysicalWorldTrackerPanel snapshot={physicalSnapshot} />);
    expect(screen.getByText(/官方延迟/)).toBeDefined();
  });

  it('renders empty state when no signals', () => {
    render(<PhysicalWorldTrackerPanel snapshot={{}} />);
    expect(screen.getByText(/暂无物理世界高频数据/)).toBeDefined();
  });
});
