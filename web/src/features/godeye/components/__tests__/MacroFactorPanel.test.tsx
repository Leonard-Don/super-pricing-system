// ---------------------------------------------------------------------------
// MacroFactorPanel tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MacroFactorPanel } from '../MacroFactorPanel';
import type { FactorPanelModel } from '@/features/godeye/lib/overviewViewModels';

const minimalFactor = {
  name: 'inventory',
  displayName: '库存压力',
  trendDelta: 0.123,
  trendValueDelta: 0.01,
  signalChanged: false,
  previousSignal: 0,
  evidenceSummary: {},
  action: null,
  z_score: 1.5,
  confidence: 0.7,
  signal: 1,
};

const minimalModel: FactorPanelModel = {
  topFactors: [minimalFactor],
  factors: [minimalFactor],
  providerHealth: { healthy_providers: 5, degraded_providers: 1, error_providers: 0 },
  staleness: { label: 'fresh' },
  macroTrend: { macro_score_delta: 0.055 },
  resonanceSummary: { label: 'bullish_cluster', reason: '多因子同向', positive_cluster: ['inventory'] },
  evidenceSummary: { source_count: 8, record_count: 120 },
  confidenceAdjustment: { penalized_factor_count: 1 },
  inputReliabilitySummary: {},
  departmentChaosSummary: {},
  peopleLayerSummary: {},
  primaryAction: null,
};

describe('MacroFactorPanel', () => {
  it('renders panel title 宏观因子面板', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    expect(screen.getByText('宏观因子面板')).toBeDefined();
  });

  it('renders factor display name', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    // FactorCard renders displayName; FactorTable also renders it
    const items = screen.getAllByText('库存压力');
    expect(items.length).toBeGreaterThan(0);
  });

  it('renders resonance label chip', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    const items = screen.getAllByText(/共振/);
    expect(items.length).toBeGreaterThan(0);
  });

  it('renders provider health metadata', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    expect(screen.getByText(/健康.*5/)).toBeDefined();
  });

  it('renders evidence source count', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    expect(screen.getByText(/8.*源/)).toBeDefined();
  });

  it('renders macro trend delta', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    expect(screen.getByText(/宏观分变化.*\+0\.055/)).toBeDefined();
  });

  it('renders empty state when no factors', () => {
    const emptyModel: FactorPanelModel = { ...minimalModel, factors: [], topFactors: [] };
    render(<MacroFactorPanel factorPanelModel={emptyModel} />);
    expect(screen.getByText('暂无宏观因子')).toBeDefined();
  });

  it('renders staleness badge', () => {
    render(<MacroFactorPanel factorPanelModel={minimalModel} />);
    expect(screen.getByText('新鲜')).toBeDefined();
  });
});
