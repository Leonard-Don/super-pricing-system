// ---------------------------------------------------------------------------
// CrossMarketOverview tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrossMarketOverview } from '../CrossMarketOverview';

const noop = () => undefined;

const minimalCard = {
  id: 'copper_vs_semis',
  recommendationTier: '重点跟踪',
  recommendationTone: 'gold',
  recommendationScore: 1.85,
  construction_mode: 'ols_hedge',
  longCount: 2,
  shortCount: 1,
  stance: '做多铜价 / 做空半导体',
  action: { target: 'cross-market', template: 'copper_vs_semis', label: '查看方案', source: 'godeye' },
};

const fullCard = {
  ...minimalCard,
  id: 'utilities_vs_growth',
  recommendationTier: '优先部署',
  recommendationTone: 'volcano',
  recommendationScore: 2.72,
  construction_mode: 'equal_weight',
  executionPosture: 'defensive_spread',
  longCount: 3,
  shortCount: 2,
  resonanceLabel: 'bullish_cluster',
  policySourceHealthLabel: 'healthy',
  inputReliabilityLabel: 'healthy',
  sourceModeLabel: 'official-led',
  policyExecutionLabel: 'stable',
  trendLabel: '驱动增强',
  trendTone: 'green',
  trendSummary: '公用事业驱动持续增强',
  taskRefreshLabel: '建议复核',
  taskRefreshTone: 'gold',
  taskRefreshResonanceDriven: true,
  rankingPenalty: false,
  themeCore: '政策脆弱防御',
  themeSupport: '成长 beta',
  driverHeadline: '官僚摩擦升温，防御资金承压',
  matchedDrivers: [
    { key: 'bureaucratic_friction', label: '官僚摩擦', type: 'factor' },
    { key: 'alert-1', label: '铜价警报', type: 'alert' },
  ],
  stance: '做多公用事业 / 做空成长 beta',
  action: {
    target: 'cross-market',
    template: 'utilities_vs_growth',
    label: '查看方案',
    source: 'godeye',
  },
  taskAction: {
    target: 'workbench',
    label: '打开任务',
    taskId: 'task-123',
    type: 'cross_market',
    refresh: 'high',
    reason: 'resonance',
    sourceFilter: '',
  },
};

describe('CrossMarketOverview', () => {
  it('renders panel title 跨市场方案总览', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByText('跨市场方案总览')).toBeDefined();
  });

  it('renders card count badge', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard, fullCard]} onNavigate={noop} />);
    expect(screen.getByText(/2.*个方案/)).toBeDefined();
  });

  it('renders recommendation tier badge', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByText('重点跟踪')).toBeDefined();
  });

  it('renders recommendation score', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByText(/评分.*1\.85/)).toBeDefined();
  });

  it('renders construction mode label', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByText('OLS 对冲')).toBeDefined();
  });

  it('renders template label via getGodEyeTemplateLabel', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    // copper_vs_semis → '铜价紧张 vs 半导体 beta'
    expect(screen.getByText('铜价紧张 vs 半导体 beta')).toBeDefined();
  });

  it('renders stance text', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByText('做多铜价 / 做空半导体')).toBeDefined();
  });

  it('renders primary CTA button', () => {
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={noop} />);
    expect(screen.getByRole('button', { name: '查看方案' })).toBeDefined();
  });

  it('calls onNavigate with action when primary button clicked', async () => {
    const onNavigate = vi.fn();
    render(<CrossMarketOverview crossMarketCards={[minimalCard]} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: '查看方案' }));
    expect(onNavigate).toHaveBeenCalledWith(minimalCard.action);
  });

  it('renders task action button when taskAction present', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByRole('button', { name: '打开任务' })).toBeDefined();
  });

  it('renders resonance badge for bullish_cluster', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByText(/正向共振/)).toBeDefined();
  });

  it('renders taskRefresh badge when present', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByText('建议复核')).toBeDefined();
  });

  it('renders matchedDrivers chips', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByText('官僚摩擦')).toBeDefined();
    expect(screen.getByText('铜价警报')).toBeDefined();
  });

  it('renders trendSummary when present', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByText('公用事业驱动持续增强')).toBeDefined();
  });

  it('renders empty state when no cards', () => {
    render(<CrossMarketOverview crossMarketCards={[]} onNavigate={noop} />);
    expect(screen.getByText('暂无跨市场方案')).toBeDefined();
  });

  it('renders themeCore and themeSupport when present', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    // themeCore '政策脆弱防御' appears in the theme legs row; may also appear in template theme string
    const coreMatches = screen.getAllByText(/政策脆弱防御/);
    expect(coreMatches.length).toBeGreaterThan(0);
    const supportMatches = screen.getAllByText(/成长 beta/);
    expect(supportMatches.length).toBeGreaterThan(0);
  });

  it('renders equal_weight construction mode label', () => {
    render(<CrossMarketOverview crossMarketCards={[fullCard]} onNavigate={noop} />);
    expect(screen.getByText('等权配对')).toBeDefined();
  });
});
