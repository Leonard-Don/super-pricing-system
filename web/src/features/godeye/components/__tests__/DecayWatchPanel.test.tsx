// ---------------------------------------------------------------------------
// DecayWatchPanel tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecayWatchPanel } from '../DecayWatchPanel';
import type { DecayWatchItem } from '@/features/godeye/lib/taskIntelligenceViewModels';

const noop = () => undefined;

const decayItem: DecayWatchItem = {
  key: 'decay-task-1',
  taskId: 'task-1',
  macroTaskId: '',
  symbol: 'TSLA',
  title: 'Tesla 结构衰败',
  label: '结构衰退',
  actionLabel: 'structural_short',
  score: 0.75,
  summary: '管理层结构脆弱，长期定价证据走弱',
  evidence: ['人才稀释', '内部交易下降'],
  dominantFailureLabel: '管理层稳定性',
  peopleRisk: 'high',
  primaryView: 'bearish',
  peopleLayer: {},
  structuralDecay: {},
  macroMispricingThesis: {
    stance: '空头',
    primary_leg: { symbol: 'TSLA', side: 'short' },
    hedge_leg: null,
    trade_legs: [],
  },
  implications: {},
  gapAnalysis: {},
  sourceTaskTitle: 'Tesla 结构衰败',
  refreshLabel: '优先重看',
  action: { target: 'workbench', label: '打开任务', id: 'task-1', type: 'pricing' },
};

const watchItem: DecayWatchItem = {
  key: 'decay-task-2',
  taskId: 'task-2',
  macroTaskId: 'macro-1',
  symbol: 'NVDA',
  title: 'Nvidia 衰败观察',
  label: '观察中',
  actionLabel: 'watch',
  score: 0.55,
  summary: '定价证据分歧扩大',
  evidence: [],
  dominantFailureLabel: '',
  peopleRisk: '',
  primaryView: '',
  peopleLayer: {},
  structuralDecay: {},
  macroMispricingThesis: { trade_legs: [] },
  implications: {},
  gapAnalysis: {},
  sourceTaskTitle: 'Nvidia 衰败观察',
  refreshLabel: '重点观察',
  action: { target: 'workbench', label: '打开衰败任务', id: 'macro-1', type: 'macro_mispricing' },
};

describe('DecayWatchPanel', () => {
  it('renders panel title 结构衰败观察', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('结构衰败观察')).toBeDefined();
  });

  it('renders empty state when no items', () => {
    render(<DecayWatchPanel items={[]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText(/当前还没有进入结构性衰败观察名单/)).toBeDefined();
  });

  it('renders item symbol / title', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    // symbol or title should appear
    expect(screen.getByText('TSLA')).toBeDefined();
  });

  it('renders decay score as percentage', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('75%')).toBeDefined();
  });

  it('renders item summary text', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText(/管理层结构脆弱/)).toBeDefined();
  });

  it('renders action button 打开任务', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('打开任务')).toBeDefined();
  });

  it('calls onNavigate when action button is clicked', async () => {
    const onNavigate = vi.fn();
    render(<DecayWatchPanel items={[decayItem]} onNavigate={onNavigate} onOpenDraft={noop} onSaveTask={noop} />);
    await userEvent.click(screen.getByText('打开任务'));
    expect(onNavigate).toHaveBeenCalledWith(decayItem.action);
  });

  // P3 deferred: save button renders but handler is a no-op
  it('renders 保存到工作台 button when item has no macroTaskId', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('保存到工作台')).toBeDefined();
  });

  it('does NOT render 保存到工作台 button when item already has macroTaskId', () => {
    render(<DecayWatchPanel items={[watchItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.queryByText('保存到工作台')).toBeNull();
  });

  it('save button does NOT call onSaveTask (P3 no-op)', async () => {
    const onSaveTask = vi.fn();
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={onSaveTask} />);
    await userEvent.click(screen.getByText('保存到工作台'));
    // P3 deferred: handler is a no-op, must NOT be called
    expect(onSaveTask).not.toHaveBeenCalled();
  });

  it('renders multiple items', () => {
    render(<DecayWatchPanel items={[decayItem, watchItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('TSLA')).toBeDefined();
    expect(screen.getByText('NVDA')).toBeDefined();
  });

  it('renders refreshLabel badge', () => {
    render(<DecayWatchPanel items={[decayItem]} onNavigate={noop} onOpenDraft={noop} onSaveTask={noop} />);
    expect(screen.getByText('优先重看')).toBeDefined();
  });
});
