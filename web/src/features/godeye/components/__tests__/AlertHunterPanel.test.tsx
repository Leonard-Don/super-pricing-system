// ---------------------------------------------------------------------------
// AlertHunterPanel tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertHunterPanel } from '../AlertHunterPanel';
import type { HunterAlert } from '@/features/godeye/lib/taskIntelligenceViewModels';

const noop = () => undefined;

const highAlert: HunterAlert = {
  key: 'alert-1',
  title: '铜价紧张 主导叙事切换',
  severity: 'high',
  description: '主导驱动从 物流摩擦 切换到 贸易脉冲',
  action: { target: 'cross-market', template: 'copper_vs_semis', source: 'alert_hunter', note: '测试' },
};

const mediumAlert: HunterAlert = {
  key: 'alert-2',
  title: '能源基础设施 建议复核',
  severity: 'medium',
  description: '输入可靠度发生变化',
  action: { target: 'cross-market', template: 'energy_vs_ai_apps', source: 'alert_hunter', note: '测试' },
};

const observeAlert: HunterAlert = {
  key: 'alert-3',
  title: '防御 beta 对冲 继续观察',
  severity: 'low',
  description: '暂无显著变化',
  action: { target: 'observe', label: '继续观察' },
};

describe('AlertHunterPanel', () => {
  it('renders panel title 异常猎手', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={noop} />);
    expect(screen.getByText('异常猎手')).toBeDefined();
  });

  it('renders alert count badge', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert, mediumAlert]} onNavigate={noop} />);
    expect(screen.getByText(/2.*条候选/)).toBeDefined();
  });

  it('renders alert title', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={noop} />);
    expect(screen.getByText('铜价紧张 主导叙事切换')).toBeDefined();
  });

  it('renders high severity badge', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={noop} />);
    expect(screen.getByText('高')).toBeDefined();
  });

  it('renders medium severity badge', () => {
    render(<AlertHunterPanel hunterAlerts={[mediumAlert]} onNavigate={noop} />);
    expect(screen.getByText('中')).toBeDefined();
  });

  it('renders alert description', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={noop} />);
    expect(screen.getByText(/主导驱动从/)).toBeDefined();
  });

  it('renders action button for navigable action', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={noop} />);
    // action has target !== 'observe' so a button should appear
    const btn = screen.getByRole('button');
    expect(btn).toBeDefined();
  });

  it('calls onNavigate when action button is clicked', async () => {
    const onNavigate = vi.fn();
    render(<AlertHunterPanel hunterAlerts={[highAlert]} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith(highAlert.action);
  });

  it('renders 继续观察 text for observe action instead of button', () => {
    render(<AlertHunterPanel hunterAlerts={[observeAlert]} onNavigate={noop} />);
    expect(screen.getByText('继续观察')).toBeDefined();
    // no button (action.target === 'observe')
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders empty state when no alerts', () => {
    render(<AlertHunterPanel hunterAlerts={[]} onNavigate={noop} />);
    expect(screen.getByText('暂无需要猎杀的异常')).toBeDefined();
  });

  it('renders both high and medium alerts', () => {
    render(<AlertHunterPanel hunterAlerts={[highAlert, mediumAlert]} onNavigate={noop} />);
    expect(screen.getByText('铜价紧张 主导叙事切换')).toBeDefined();
    expect(screen.getByText('能源基础设施 建议复核')).toBeDefined();
    expect(screen.getByText('高')).toBeDefined();
    expect(screen.getByText('中')).toBeDefined();
  });
});
