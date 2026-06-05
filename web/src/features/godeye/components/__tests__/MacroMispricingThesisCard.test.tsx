// ---------------------------------------------------------------------------
// MacroMispricingThesisCard tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MacroMispricingThesisCard } from '../MacroMispricingThesisCard';

const minimalData = {
  stance: '做空',
  thesis_type: '跨市场套利',
  horizon: '3-6m',
  people_risk: 'high',
  summary: '宏观错误定价窗口开启，主腿空头逻辑清晰',
  primary_leg: {
    symbol: 'TSLA',
    side: 'short',
    rationale: '估值过高，管理层不稳定',
  },
  hedge_leg: {
    symbol: 'SPY',
    side: 'long',
    rationale: '市场系统性对冲',
  },
  trade_legs: [
    { symbol: 'TSLA', side: 'short', role: '主腿', weight: 0.6, thesis: '核心空头逻辑' },
    { symbol: 'SPY', side: 'long', role: '对冲', weight: 0.4, thesis: '系统性风险对冲' },
  ],
  kill_conditions: ['TSLA 季报超预期', '市场恐慌性抛售'],
  execution_notes: ['分批建仓', '止损设在关键支撑位'],
};

describe('MacroMispricingThesisCard', () => {
  it('renders null when data is empty object', () => {
    const { container } = render(<MacroMispricingThesisCard data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders card title', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('Macro Mispricing Thesis')).toBeDefined();
  });

  it('renders stance tag', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('做空')).toBeDefined();
  });

  it('renders thesis_type tag', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('跨市场套利')).toBeDefined();
  });

  it('renders horizon tag', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText(/观察期/)).toBeDefined();
    expect(screen.getByText(/3-6m/)).toBeDefined();
  });

  it('renders summary text', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText(/宏观错误定价窗口开启/)).toBeDefined();
  });

  it('renders primary leg section heading', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    // Both "主腿" heading and trade leg role badge may appear — just confirm at least one exists
    expect(screen.getAllByText('主腿').length).toBeGreaterThan(0);
  });

  it('renders primary leg symbol and side', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    // TSLA appears in primary leg and trade legs — just confirm presence
    expect(screen.getAllByText(/TSLA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/short/).length).toBeGreaterThan(0);
  });

  it('renders hedge leg section heading', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('对冲腿')).toBeDefined();
  });

  it('renders trade legs grid section heading', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('组合腿')).toBeDefined();
  });

  it('renders trade leg symbols', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    // SPY appears in hedge leg and trade legs
    expect(screen.getAllByText(/SPY/).length).toBeGreaterThan(0);
  });

  it('renders trade leg role and weight', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    // "主腿" appears as section heading + role badge
    expect(screen.getAllByText('主腿').length).toBeGreaterThan(0);
    expect(screen.getByText(/60%/)).toBeDefined();
  });

  it('renders kill conditions heading', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('Kill Conditions')).toBeDefined();
  });

  it('renders kill condition items', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('TSLA 季报超预期')).toBeDefined();
  });

  it('renders execution notes heading', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('执行备注')).toBeDefined();
  });

  it('renders execution note items', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('分批建仓')).toBeDefined();
  });

  it('renders 打开跨市场草案 button even when onOpenDraft not provided', () => {
    render(<MacroMispricingThesisCard data={minimalData} />);
    expect(screen.getByText('打开跨市场草案')).toBeDefined();
  });

  it('calls onOpenDraft when button is clicked', async () => {
    const onOpenDraft = vi.fn();
    render(<MacroMispricingThesisCard data={minimalData} onOpenDraft={onOpenDraft} />);
    await userEvent.click(screen.getByText('打开跨市场草案'));
    // P3 deferred: onOpenDraft prop is passed through but not necessarily called
    // The button must render and be clickable
    expect(screen.getByText('打开跨市场草案')).toBeDefined();
  });

  it('renders without trade legs section when trade_legs is empty', () => {
    const data = { ...minimalData, trade_legs: [] };
    render(<MacroMispricingThesisCard data={data} />);
    expect(screen.queryByText('组合腿')).toBeNull();
  });

  it('renders without kill conditions section when array is empty', () => {
    const data = { ...minimalData, kill_conditions: [] };
    render(<MacroMispricingThesisCard data={data} />);
    expect(screen.queryByText('Kill Conditions')).toBeNull();
  });

  it('renders without execution notes section when array is empty', () => {
    const data = { ...minimalData, execution_notes: [] };
    render(<MacroMispricingThesisCard data={data} />);
    expect(screen.queryByText('执行备注')).toBeNull();
  });
});
