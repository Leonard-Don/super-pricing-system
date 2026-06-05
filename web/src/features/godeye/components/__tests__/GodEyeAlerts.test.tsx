import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GodEyeAlerts } from '../GodEyeAlerts';

const noop = () => undefined;

describe('GodEyeAlerts', () => {
  it('renders nothing when all values are falsy/zero', () => {
    const { container } = render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{}}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders 战场提示 when macroSignal is 1', () => {
    render(
      <GodEyeAlerts
        macroSignal={1}
        degradedProviderCount={0}
        refreshCounts={{}}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('战场提示')).toBeDefined();
  });

  it('renders 数据治理提醒 when degradedProviderCount > 0', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={3}
        refreshCounts={{}}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('数据治理提醒')).toBeDefined();
    expect(screen.getByText(/3.*数据源/)).toBeDefined();
  });

  it('renders decay radar alert when score >= 0.68', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{}}
        structuralDecayRadar={{ score: 0.75, label: 'watch', display_label: '结构衰败警报' }}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('系统级结构衰败雷达进入警报区')).toBeDefined();
    expect(screen.getByText(/75%/)).toBeDefined();
  });

  it('renders decay radar alert when label is decay_alert', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{}}
        structuralDecayRadar={{ score: 0.1, label: 'decay_alert', display_label: '结构衰败警报' }}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('系统级结构衰败雷达进入警报区')).toBeDefined();
  });

  it('calls onNavigate with decay navigation payload when 查看防御方案 is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{}}
        structuralDecayRadar={{ score: 0.8, label: 'watch', display_label: '结构衰败警报' }}
        onNavigate={onNavigate}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '查看防御方案' }));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'cross-market', template: 'defensive_beta_hedge' })
    );
  });

  it('renders 研究任务更新优先级 banner when refreshCounts.high > 0', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{ high: 2, medium: 1 }}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('研究任务更新优先级')).toBeDefined();
  });

  it('renders 交易论点正在漂移 when refreshCounts.tradeThesis > 0', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{ tradeThesis: 1 }}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('交易论点正在漂移')).toBeDefined();
  });

  it('renders 结构性衰败任务正在继续恶化 when refreshCounts.structuralDecay > 0', () => {
    render(
      <GodEyeAlerts
        macroSignal={0}
        degradedProviderCount={0}
        refreshCounts={{ structuralDecay: 1 }}
        structuralDecayRadar={undefined}
        onNavigate={noop}
      />
    );
    expect(screen.getByText('结构性衰败任务正在继续恶化')).toBeDefined();
  });
});
