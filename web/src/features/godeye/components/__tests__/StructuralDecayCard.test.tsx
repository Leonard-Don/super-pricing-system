// ---------------------------------------------------------------------------
// StructuralDecayCard tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StructuralDecayCard } from '../StructuralDecayCard';

const minimalData = {
  score: 0.72,
  label: '高衰败风险',
  action: 'structural_short' as const,
  summary: '长期竞争壁垒持续侵蚀，现金流质量下降',
  dominant_failure_label: '管理层不稳定性',
  evidence: ['内部人减持', '研发支出骤降'],
  components: [
    { key: 'mgmt', label: '管理层风险', delta: 0.35, status: 'positive', detail: '高层频繁更替' },
    { key: 'cf', label: '现金流质量', delta: -0.12, status: 'negative', detail: '自由现金流改善' },
  ],
  reversibility: '低',
  horizon: '6-12m',
};

describe('StructuralDecayCard', () => {
  it('renders null when data is empty object', () => {
    const { container } = render(<StructuralDecayCard data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the card title 结构衰败雷达', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('结构衰败雷达')).toBeDefined();
  });

  it('renders the label tag', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('高衰败风险')).toBeDefined();
  });

  it('renders the summary text', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText(/长期竞争壁垒持续侵蚀/)).toBeDefined();
  });

  it('renders decay certainty progress bar section heading', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('衰败确定性')).toBeDefined();
  });

  it('renders score as percentage text', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('72%')).toBeDefined();
  });

  it('renders dominant failure mode label', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('管理层不稳定性')).toBeDefined();
  });

  it('renders evidence tags', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('内部人减持')).toBeDefined();
    expect(screen.getByText('研发支出骤降')).toBeDefined();
  });

  it('renders components breakdown section heading', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('衰败拆解')).toBeDefined();
  });

  it('renders component labels', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('管理层风险')).toBeDefined();
    expect(screen.getByText('现金流质量')).toBeDefined();
  });

  it('renders component details', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText('高层频繁更替')).toBeDefined();
  });

  it('renders reversibility and horizon tags', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText(/可逆性/)).toBeDefined();
    expect(screen.getByText(/时间维度/)).toBeDefined();
  });

  it('renders without components when components array is empty', () => {
    const data = { ...minimalData, components: [] };
    render(<StructuralDecayCard data={data} />);
    expect(screen.queryByText('衰败拆解')).toBeNull();
  });

  it('renders without evidence section when evidence is empty', () => {
    const data = { ...minimalData, evidence: [] };
    render(<StructuralDecayCard data={data} />);
    expect(screen.getByText(/当前暂无足够证据/)).toBeDefined();
  });

  it('renders the action label', () => {
    render(<StructuralDecayCard data={minimalData} />);
    expect(screen.getByText(/结构性做空/)).toBeDefined();
  });
});
