// ---------------------------------------------------------------------------
// StructuralDecayRadarPanel tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StructuralDecayRadarPanel } from '../StructuralDecayRadarPanel';

const noop = () => undefined;

const minimalModel = {
  score: 0.72,
  label: 'decay_alert',
  display_label: '衰败警报',
  action_hint: 'defensive_hedge_mode',
  axes: [
    { key: 'axis-1', label: '供应链人才', score: 0.8, status: 'critical', summary: 'talent dilution critical' },
    { key: 'axis-2', label: '政策执行', score: 0.5, status: 'watch', summary: 'policy noise elevated' },
    { key: 'axis-3', label: '组织稳定', score: 0.2, status: 'stable', summary: '' },
  ],
  top_signals: [
    { key: 'sig-1', label: '人才稀释', score: 0.9 },
    { key: 'sig-2', label: '政策反复', score: 0.6 },
  ],
};

const watchModel = {
  score: 0.5,
  label: 'decay_watch',
  display_label: '衰败观察',
  action_hint: '',
  axes: [
    { key: 'axis-w1', label: '供应链', score: 0.5, status: 'watch', summary: 'watch' },
  ],
  top_signals: [],
};

describe('StructuralDecayRadarPanel', () => {
  it('renders panel title 结构衰败雷达', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('结构衰败雷达')).toBeDefined();
  });

  it('renders empty state when no model axes', () => {
    render(<StructuralDecayRadarPanel model={{}} onNavigate={noop} />);
    expect(screen.getByText(/暂缺结构衰败雷达数据/)).toBeDefined();
  });

  it('renders decay score as percentage', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    // score 0.72 → 72%
    expect(screen.getByText('72%')).toBeDefined();
  });

  it('renders display_label badge', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('衰败警报')).toBeDefined();
  });

  it('renders axis labels', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('供应链人才')).toBeDefined();
    expect(screen.getByText('政策执行')).toBeDefined();
    expect(screen.getByText('组织稳定')).toBeDefined();
  });

  it('renders axis score percentages', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('80%')).toBeDefined();
    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText('20%')).toBeDefined();
  });

  it('renders top signal tags', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText(/人才稀释/)).toBeDefined();
    expect(screen.getByText(/政策反复/)).toBeDefined();
  });

  it('renders 查看防御方案 button', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('查看防御方案')).toBeDefined();
  });

  it('renders 查看衰败任务 button', () => {
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={noop} />);
    expect(screen.getByText('查看衰败任务')).toBeDefined();
  });

  it('calls onNavigate with cross-market payload when 查看防御方案 clicked', async () => {
    const onNavigate = vi.fn();
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('查看防御方案'));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'cross-market', template: 'defensive_beta_hedge' })
    );
  });

  it('calls onNavigate with workbench payload when 查看衰败任务 clicked', async () => {
    const onNavigate = vi.fn();
    render(<StructuralDecayRadarPanel model={minimalModel} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('查看衰败任务'));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'workbench' })
    );
  });

  it('renders decay_watch model without top signals', () => {
    render(<StructuralDecayRadarPanel model={watchModel} onNavigate={noop} />);
    expect(screen.getByText('衰败观察')).toBeDefined();
    // score 0.5 → 50% — may appear more than once (overall + axis), use getAllByText
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1);
  });
});
