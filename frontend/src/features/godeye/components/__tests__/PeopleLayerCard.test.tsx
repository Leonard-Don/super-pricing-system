// ---------------------------------------------------------------------------
// PeopleLayerCard tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeopleLayerCard } from '../PeopleLayerCard';

const minimalData = {
  stance: 'fragile',
  risk_level: 'high',
  confidence: 0.72,
  summary: 'buying activity low, management fragile',
  flags: ['insider selling', 'high turnover'],
  notes: ['管理层变动频繁，组织稳定性存疑'],
  executive_profile: {
    technical_authority_score: 0.6,
    capital_markets_pressure: 0.8,
    leadership_balance: 'neutral',
    average_tenure_years: 2.5,
    summary: 'fragile leadership structure',
  },
  insider_flow: {
    label: 'bearish insider signal',
    net_action: 'selling',
    transaction_count: 12,
    summary: '近期内部人持续减持',
  },
  hiring_signal: {
    signal: 'bearish',
    dilution_ratio: 2.1,
    tech_ratio: 0.3,
    alert_message: 'high dilution detected',
  },
};

const minimalOverlay = {
  label: '治理折价 8.5%',
  governance_discount_pct: 8.5,
  confidence: 0.68,
  summary: 'chaotic execution detected',
  executive_evidence: {},
  insider_evidence: {},
  hiring_evidence: {},
  source_mode_summary: {
    label: 'official-led',
    coverage: 5,
    official_share: 0.8,
    fallback_share: 0.2,
  },
  policy_execution_context: {
    label: 'chaotic',
    top_department: '市场部',
    reversal_count: 3,
    execution_status: 'lagging',
    lag_days: 14,
    summary: '政策执行混乱，频繁反转',
  },
};

describe('PeopleLayerCard', () => {
  it('renders null when both data and overlay are empty objects', () => {
    const { container } = render(<PeopleLayerCard data={{}} overlay={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the card title', () => {
    render(<PeopleLayerCard data={minimalData} />);
    // heading + governance_discount_pct badge both may contain "人的维度"
    expect(screen.getAllByText(/人的维度/).length).toBeGreaterThan(0);
  });

  it('renders stance tag', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getAllByText(/脆弱/).length).toBeGreaterThan(0);
  });

  it('renders risk level tag', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText(/组织风险/)).toBeDefined();
    // "高" appears in the risk badge + potentially dilution_ratio tag — just confirm existence
    expect(screen.getAllByText(/高/).length).toBeGreaterThan(0);
  });

  it('renders 管理层画像 column heading', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText('管理层画像')).toBeDefined();
  });

  it('renders 内部人交易 column heading', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText('内部人交易')).toBeDefined();
  });

  it('renders 招聘稀释度 column heading', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText('招聘稀释度')).toBeDefined();
  });

  it('renders insider summary text', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText(/近期内部人持续减持/)).toBeDefined();
  });

  it('renders insider transaction count', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText(/笔数/)).toBeDefined();
  });

  it('renders hiring dilution ratio', () => {
    render(<PeopleLayerCard data={minimalData} />);
    // badge text is "稀释度 2.10" (inside a Badge) — may appear as one or multiple nodes
    expect(screen.getAllByText(/稀释度/).length).toBeGreaterThan(0);
  });

  it('renders flags', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText('治理提示')).toBeDefined();
  });

  it('renders notes as alert', () => {
    render(<PeopleLayerCard data={minimalData} />);
    expect(screen.getByText(/管理层变动频繁/)).toBeDefined();
  });

  it('renders governance discount tag from overlay', () => {
    render(<PeopleLayerCard data={minimalData} overlay={minimalOverlay} />);
    // "治理折价" appears in both a top badge and label prop — multiple matches are fine
    expect(screen.getAllByText(/治理折价/).length).toBeGreaterThan(0);
  });

  it('renders source mode summary footer when overlay has source_mode_summary', () => {
    render(<PeopleLayerCard data={minimalData} overlay={minimalOverlay} />);
    expect(screen.getByText('证据来源治理')).toBeDefined();
  });

  it('renders policy execution context footer when overlay has policy_execution_context', () => {
    render(<PeopleLayerCard data={minimalData} overlay={minimalOverlay} />);
    expect(screen.getByText('政策执行上下文')).toBeDefined();
  });

  it('renders overlay summary when provided', () => {
    render(<PeopleLayerCard data={minimalData} overlay={minimalOverlay} />);
    // "chaotic" gets localized to "混乱"; match the localized fragment instead
    expect(screen.getByText(/混乱 execution detected/)).toBeDefined();
  });

  it('renders with only overlay (no top-level data)', () => {
    render(<PeopleLayerCard data={{}} overlay={minimalOverlay} />);
    expect(screen.getByText(/人的维度/)).toBeDefined();
  });
});
