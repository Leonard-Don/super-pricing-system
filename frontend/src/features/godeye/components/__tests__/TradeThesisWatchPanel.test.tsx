// ---------------------------------------------------------------------------
// TradeThesisWatchPanel tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeThesisWatchPanel } from '../TradeThesisWatchPanel';
import type { TradeThesisWatchItem } from '@/features/godeye/lib/taskIntelligenceViewModels';

const noop = () => undefined;

const thesisItem: TradeThesisWatchItem = {
  key: 'thesis-watch-t1',
  taskId: 't1',
  symbol: 'TSLA',
  title: 'Tesla 交易假设',
  stance: '空头',
  horizon: '6-12个月',
  leadLeg: 'TSLA',
  tradeLegs: [
    { symbol: 'TSLA', side: 'short' },
    { symbol: 'SPY', side: 'long' },
  ],
  summary: '管理层风险持续累积，估值压缩空间大',
  resultsSummary: {},
  structuralDecay: {},
  peopleLayer: {},
  refreshLabel: '优先复核',
  refreshSeverity: 'high',
  driftLead: '交易论点主腿已漂移',
  driftEvidence: '内部交易减少 + 组织脆弱度上升',
  action: { target: 'workbench', label: '打开交易 Thesis', id: 't1', type: 'trade_thesis' },
  score: 0.6,
  severityRank: 3,
};

const stableThesisItem: TradeThesisWatchItem = {
  key: 'thesis-watch-t2',
  taskId: 't2',
  symbol: 'AMZN',
  title: 'Amazon 交易假设',
  stance: '多头',
  horizon: '12-24个月',
  leadLeg: 'AMZN',
  tradeLegs: [],
  summary: '',
  resultsSummary: {},
  structuralDecay: {},
  peopleLayer: {},
  refreshLabel: '保持观察',
  refreshSeverity: 'low',
  driftLead: '',
  driftEvidence: '',
  action: { target: 'workbench', label: '打开交易假设', id: 't2', type: 'trade_thesis' },
  score: 0.3,
  severityRank: 1,
};

describe('TradeThesisWatchPanel', () => {
  it('renders panel title 交易假设漂移观察', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('交易假设漂移观察')).toBeDefined();
  });

  it('renders empty state when no items', () => {
    render(<TradeThesisWatchPanel items={[]} onNavigate={noop} />);
    expect(screen.getByText(/当前还没有进入独立观察区的交易假设/)).toBeDefined();
  });

  it('renders item symbol / title', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('TSLA')).toBeDefined();
  });

  it('renders stance tag', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('空头')).toBeDefined();
  });

  it('renders horizon tag', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('6-12个月')).toBeDefined();
  });

  it('renders refreshLabel badge', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('优先复核')).toBeDefined();
  });

  it('renders score as percentage', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('60%')).toBeDefined();
  });

  it('renders summary text', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText(/管理层风险持续累积/)).toBeDefined();
  });

  it('renders leadLeg text', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText(/主表达腿：TSLA/)).toBeDefined();
  });

  it('renders trade legs summary', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText(/TSLA.*short/)).toBeDefined();
  });

  it('renders driftLead text', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText(/交易论点主腿已漂移/)).toBeDefined();
  });

  it('renders driftEvidence text', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText(/内部交易减少/)).toBeDefined();
  });

  it('renders action CTA button', () => {
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={noop} />);
    expect(screen.getByText('打开交易 Thesis')).toBeDefined();
  });

  it('calls onNavigate when CTA button clicked', async () => {
    const onNavigate = vi.fn();
    render(<TradeThesisWatchPanel items={[thesisItem]} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('打开交易 Thesis'));
    expect(onNavigate).toHaveBeenCalledWith(thesisItem.action);
  });

  it('renders multiple items', () => {
    render(<TradeThesisWatchPanel items={[thesisItem, stableThesisItem]} onNavigate={noop} />);
    expect(screen.getByText('TSLA')).toBeDefined();
    expect(screen.getByText('AMZN')).toBeDefined();
  });
});
