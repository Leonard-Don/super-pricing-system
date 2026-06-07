import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupplyChainHeatmap } from '../SupplyChainHeatmap';
import type { HeatmapModel } from '@/features/godeye/lib/overviewViewModels';

const minimalHeatmapModel: HeatmapModel = {
  cells: [
    {
      key: 'investment_activity',
      label: '投资活跃度',
      group: 'Supply Chain',
      groupLabel: '供应链',
      score: 0.5,
      tone: 'hot',
      count: 12,
      displayValue: '显著升温',
      displayHint: '原始分 0.50 · 样本 12 条',
      summary: '供应链 增强 · Δ+0.20',
      trendDelta: 0.2,
      momentum: 'strengthening',
    },
    {
      key: 'inventory',
      label: '库存压力',
      group: 'Macro HF',
      groupLabel: '宏观高频',
      score: -0.4,
      tone: 'cold',
      count: 8,
      displayValue: '显著承压',
      displayHint: '原始分 -0.40 · 样本 8 条',
      summary: '宏观高频 走弱 · Δ-0.25',
      trendDelta: -0.25,
      momentum: 'weakening',
    },
  ],
  anomalies: [
    {
      key: 'heat-investment_activity',
      title: '投资活跃度出现显著偏移',
      description: '供应链 原始分 0.500 · 增强 +0.20',
      type: 'hot',
    },
    {
      key: 'trend-customs',
      title: '海关/贸易 趋势增强',
      description: '最近窗口 Δ+0.15 · 高置信 3',
      type: 'hot',
    },
  ],
};

describe('SupplyChainHeatmap', () => {
  it('renders the card title', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('实体链路热区')).toBeDefined();
  });

  it('renders cell count badge', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText(/2.*热区/)).toBeDefined();
  });

  it('renders cell labels from heatmapModel', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('投资活跃度')).toBeDefined();
    expect(screen.getByText('库存压力')).toBeDefined();
  });

  it('renders group labels', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('供应链')).toBeDefined();
    expect(screen.getByText('宏观高频')).toBeDefined();
  });

  it('renders displayValue for each cell', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('显著升温')).toBeDefined();
    expect(screen.getByText('显著承压')).toBeDefined();
  });

  it('renders anomaly section header', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('最近异常点')).toBeDefined();
  });

  it('renders anomaly titles', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('投资活跃度出现显著偏移')).toBeDefined();
    expect(screen.getByText('海关/贸易 趋势增强')).toBeDefined();
  });

  it('renders anomaly type labels', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    // Both anomalies are type 'hot' → label '升温'
    const hotLabels = screen.getAllByText('升温');
    expect(hotLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('renders 暂无可用热区 when cells is empty', () => {
    render(<SupplyChainHeatmap heatmapModel={{ cells: [], anomalies: [] }} />);
    expect(screen.getByText('暂无可用热区')).toBeDefined();
  });

  it('renders 暂无显著异常 when anomalies is empty', () => {
    render(<SupplyChainHeatmap heatmapModel={{ cells: [], anomalies: [] }} />);
    expect(screen.getByText('暂无显著异常')).toBeDefined();
  });

  it('renders momentum trend chip for each cell', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    expect(screen.getByText('趋势增强')).toBeDefined();
    expect(screen.getByText('趋势走弱')).toBeDefined();
  });

  it('renders count per cell', () => {
    render(<SupplyChainHeatmap heatmapModel={minimalHeatmapModel} />);
    // getAllByText because count label "12 条" also appears inside displayHint text
    expect(screen.getAllByText(/12.*条/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/8.*条/).length).toBeGreaterThanOrEqual(1);
  });
});
