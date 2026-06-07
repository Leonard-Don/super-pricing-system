import { describe, it, expect } from 'vitest';
import {
  buildHeatmapModel,
  buildFactorPanelModel,
  buildRadarModel,
  buildTimelineModel,
  getSignalLabel,
} from '@/features/godeye/lib/overviewViewModels';

describe('getSignalLabel', () => {
  it('returns 猎杀窗口 for signal 1', () => {
    expect(getSignalLabel(1)).toBe('猎杀窗口');
  });

  it('returns 观察中 for signal 0', () => {
    expect(getSignalLabel(0)).toBe('观察中');
  });

  it('returns 逆风区 for signal -1', () => {
    expect(getSignalLabel(-1)).toBe('逆风区');
  });

  it('returns 观察中 for unknown value', () => {
    expect(getSignalLabel(99)).toBe('观察中');
  });
});

describe('buildHeatmapModel', () => {
  it('returns cells and anomalies with empty inputs', () => {
    const result = buildHeatmapModel();
    expect(result).toHaveProperty('cells');
    expect(result).toHaveProperty('anomalies');
    expect(Array.isArray(result.cells)).toBe(true);
    expect(Array.isArray(result.anomalies)).toBe(true);
  });

  it('builds 6 cells from DIMENSION_META', () => {
    const result = buildHeatmapModel();
    expect(result.cells).toHaveLength(6);
  });

  it('cell keys match dimension meta keys', () => {
    const result = buildHeatmapModel();
    const keys = result.cells.map((c) => c.key);
    expect(keys).toContain('investment_activity');
    expect(keys).toContain('inventory');
    expect(keys).toContain('logistics');
  });

  it('cell has required fields', () => {
    const result = buildHeatmapModel();
    const cell = result.cells[0];
    expect(cell).toHaveProperty('key');
    expect(cell).toHaveProperty('label');
    expect(cell).toHaveProperty('group');
    expect(cell).toHaveProperty('score');
    expect(cell).toHaveProperty('tone');
    expect(cell).toHaveProperty('displayValue');
    expect(cell).toHaveProperty('displayHint');
    expect(cell).toHaveProperty('trendDelta');
    expect(cell).toHaveProperty('momentum');
  });

  it('uses snapshot signal data when provided', () => {
    const snapshot = {
      signals: {
        supply_chain: {
          dimensions: {
            investment_activity: { score: 0.8, count: 50 },
          },
          alerts: [],
        },
        macro_hf: { dimensions: {} },
      },
    };
    const result = buildHeatmapModel(snapshot, {});
    const cell = result.cells.find((c) => c.key === 'investment_activity');
    expect(cell).toBeDefined();
    expect(cell?.score).toBeCloseTo(0.8);
    expect(cell?.tone).toBe('hot');
  });

  it('adds supply chain alerts as anomalies', () => {
    const snapshot = {
      signals: {
        supply_chain: {
          dimensions: {},
          alerts: [
            { company: 'TestCorp', message: '人才流失', dilution_ratio: 0.3 },
          ],
        },
        macro_hf: { dimensions: {} },
      },
    };
    const result = buildHeatmapModel(snapshot, {});
    const alertAnomaly = result.anomalies.find((a) => a.key.startsWith('supply-alert-'));
    expect(alertAnomaly).toBeDefined();
    expect(alertAnomaly?.title).toBe('TestCorp');
  });

  it('tone is cold for negative score below threshold', () => {
    const snapshot = {
      signals: {
        supply_chain: {
          dimensions: { talent_structure: { score: -0.5, count: 30 } },
          alerts: [],
        },
        macro_hf: { dimensions: {} },
      },
    };
    const result = buildHeatmapModel(snapshot, {});
    const cell = result.cells.find((c) => c.key === 'talent_structure');
    expect(cell?.tone).toBe('cold');
  });
});

describe('buildFactorPanelModel', () => {
  it('returns required top-level fields with empty inputs', () => {
    const result = buildFactorPanelModel();
    expect(result).toHaveProperty('topFactors');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('providerHealth');
    expect(result).toHaveProperty('staleness');
    expect(result).toHaveProperty('macroTrend');
    expect(result).toHaveProperty('resonanceSummary');
    expect(result).toHaveProperty('evidenceSummary');
    expect(result).toHaveProperty('confidenceAdjustment');
    expect(result).toHaveProperty('inputReliabilitySummary');
    expect(result).toHaveProperty('departmentChaosSummary');
    expect(result).toHaveProperty('peopleLayerSummary');
    expect(result).toHaveProperty('primaryAction');
  });

  it('enriches factors with displayName and trendDelta', () => {
    const overview = {
      factors: [
        { name: 'bureaucratic_friction', value: 0.4, z_score: 0.6, signal: 0 },
      ],
      trend: {
        factor_deltas: {
          bureaucratic_friction: { z_score_delta: 0.1, value_delta: 0.05, signal_changed: false },
        },
      },
    };
    const result = buildFactorPanelModel(overview);
    expect(result.factors).toHaveLength(1);
    const f = result.factors[0];
    expect(f.displayName).toBe('官僚摩擦');
    expect(f.trendDelta).toBeCloseTo(0.1);
  });

  it('topFactors is sorted by abs z_score descending', () => {
    const overview = {
      factors: [
        { name: 'tech_dilution', value: 0.1, z_score: 0.2, signal: 0 },
        { name: 'bureaucratic_friction', value: 0.5, z_score: 1.2, signal: 1 },
        { name: 'baseload_mismatch', value: 0.3, z_score: 0.8, signal: -1 },
        { name: 'fx_mismatch', value: 0.1, z_score: 0.05, signal: 0 },
      ],
      trend: { factor_deltas: {} },
    };
    const result = buildFactorPanelModel(overview);
    expect(result.topFactors).toHaveLength(3);
    expect(result.topFactors[0].name).toBe('bureaucratic_friction');
    expect(result.topFactors[1].name).toBe('baseload_mismatch');
  });

  it('builds cross-market action for signal=1 factor', () => {
    const overview = {
      factors: [
        { name: 'bureaucratic_friction', value: 0.5, z_score: 1.0, signal: 1 },
      ],
      trend: { factor_deltas: {} },
    };
    const result = buildFactorPanelModel(overview);
    const f = result.factors[0];
    expect(f.action).not.toBeNull();
    expect(f.action?.target).toBe('cross-market');
  });

  it('builds pricing action for signal=-1 factor', () => {
    const overview = {
      factors: [
        { name: 'tech_dilution', value: 0.5, z_score: -1.0, signal: -1 },
      ],
      trend: { factor_deltas: {} },
    };
    const result = buildFactorPanelModel(overview);
    expect(result.factors[0].action?.target).toBe('pricing');
  });
});

describe('buildRadarModel', () => {
  it('returns empty array for empty overview', () => {
    const result = buildRadarModel();
    expect(result).toEqual([]);
  });

  it('maps factor to radar item', () => {
    const overview = {
      factors: [
        { name: 'bureaucratic_friction', value: 0.4, z_score: 0.5, signal: 1, confidence: 0.8 },
      ],
    };
    const result = buildRadarModel(overview);
    expect(result).toHaveLength(1);
    expect(result[0].factor).toBe('官僚摩擦');
    expect(result[0]).toHaveProperty('intensity');
    expect(result[0]).toHaveProperty('confidence');
    expect(result[0].rawValue).toBeCloseTo(0.4);
    expect(result[0].zScore).toBeCloseTo(0.5);
  });
});

describe('buildTimelineModel', () => {
  it('returns empty array for empty policyHistory', () => {
    const result = buildTimelineModel();
    expect(result).toEqual([]);
  });

  it('maps policy record to timeline item', () => {
    const policyHistory = {
      records: [
        {
          record_id: 'rec1',
          source: 'xinhua',
          timestamp: '2024-01-15T10:00:00Z',
          confidence: 0.9,
          raw_value: {
            title: '国家发展政策',
            policy_shift: 0.3,
            industry_impact: { AI算力: 0.8 },
          },
        },
      ],
    };
    const result = buildTimelineModel(policyHistory);
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.key).toBe('rec1');
    expect(item.direction).toBe('stimulus');
    expect(item.directionLabel).toBe('偏刺激');
    expect(item.score).toBeCloseTo(0.3);
    expect(item.tags).toContain('AI算力');
  });

  it('marks tightening for negative policy_shift', () => {
    const policyHistory = {
      records: [
        {
          record_id: 'rec2',
          source: 'csrc',
          timestamp: '2024-02-01T00:00:00Z',
          confidence: 0.7,
          raw_value: {
            title: '收紧政策',
            policy_shift: -0.4,
            industry_impact: {},
          },
        },
      ],
    };
    const result = buildTimelineModel(policyHistory);
    expect(result[0].direction).toBe('tightening');
    expect(result[0].directionLabel).toBe('偏收紧');
  });
});
