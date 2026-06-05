import { describe, it, expect } from 'vitest';
import {
  buildHunterModel,
  buildDecayWatchModel,
  buildTradeThesisWatchModel,
  buildCrossMarketCards,
} from '@/features/godeye/lib/taskIntelligenceViewModels';

describe('buildHunterModel', () => {
  it('returns empty array with empty inputs', () => {
    const result = buildHunterModel({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('adds provider-degraded alerts from refresh_status', () => {
    const snapshot = {
      refresh_status: {
        akshare: { status: 'degraded', error: '超时' },
        tushare: { status: 'error', error: '连接失败' },
      },
    };
    const result = buildHunterModel({ snapshot });
    expect(result.some((a) => a.key === 'provider-akshare')).toBe(true);
    expect(result.some((a) => a.key === 'provider-tushare')).toBe(true);
    const tushareAlert = result.find((a) => a.key === 'provider-tushare');
    expect(tushareAlert?.severity).toBe('high');
  });

  it('adds supply chain alerts', () => {
    const snapshot = {
      signals: {
        supply_chain: {
          alerts: [
            { company: 'TestCo', message: '人才外流', dilution_ratio: 0.4 },
          ],
        },
      },
    };
    const result = buildHunterModel({ snapshot });
    expect(result.some((a) => a.key.startsWith('supply-'))).toBe(true);
  });

  it('adds structural decay high alert when score >= 0.68', () => {
    const overview = {
      structural_decay_radar: {
        label: 'decay_alert',
        score: 0.75,
        display_label: '高衰败警报',
        action_hint: '建议查看防御方案',
      },
      factors: [],
    };
    const result = buildHunterModel({ overview });
    expect(result.some((a) => a.key === 'structural-decay-radar')).toBe(true);
    const alert = result.find((a) => a.key === 'structural-decay-radar');
    expect(alert?.severity).toBe('high');
  });

  it('limits output to 8 alerts', () => {
    // Provide many signal sources to exceed 8
    const overview = {
      structural_decay_radar: { label: 'decay_alert', score: 0.8 },
      factors: Array.from({ length: 10 }, (_, i) => ({
        name: `factor_${i}`,
        signal: 1,
        z_score: 1.5,
        value: 0.5,
      })),
      resonance_summary: {},
      people_layer_summary: { fragile_companies: [] },
      department_chaos_summary: { top_departments: [] },
    };
    const result = buildHunterModel({ overview });
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('sorts alerts: high severity before medium', () => {
    const snapshot = {
      refresh_status: {
        source_a: { status: 'degraded', error: '' },
        source_b: { status: 'error', error: '' },
      },
    };
    const result = buildHunterModel({ snapshot });
    if (result.length >= 2) {
      const severityOrder = result.map((a) => a.severity);
      const highIdx = severityOrder.indexOf('high');
      const mediumIdx = severityOrder.indexOf('medium');
      if (highIdx !== -1 && mediumIdx !== -1) {
        expect(highIdx).toBeLessThan(mediumIdx);
      }
    }
  });
});

describe('buildDecayWatchModel', () => {
  it('returns empty array with no tasks', () => {
    expect(buildDecayWatchModel([])).toEqual([]);
  });

  it('filters to pricing tasks with structural_decay score', () => {
    const tasks = [
      {
        id: 'p1',
        type: 'pricing',
        status: 'active',
        symbol: 'BABA',
        title: 'BABA定价',
        snapshot: {
          payload: {
            structural_decay: { score: 0.6, label: '走弱', summary: 'decay summary' },
            people_layer: {},
          },
        },
      },
      {
        id: 'cm1',
        type: 'cross_market',
        status: 'active',
        symbol: 'SPY',
        title: 'Cross Market',
      },
    ];
    const result = buildDecayWatchModel(tasks);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BABA');
  });

  it('returns empty array if pricing task has no structural decay score', () => {
    const tasks = [
      {
        id: 'p2',
        type: 'pricing',
        status: 'active',
        symbol: 'NVDA',
        snapshot: {
          payload: {
            structural_decay: { score: 0, label: 'stable' },
          },
        },
      },
    ];
    const result = buildDecayWatchModel(tasks);
    expect(result).toHaveLength(0);
  });

  it('sorts by score descending', () => {
    const tasks = [
      {
        id: 'p1',
        type: 'pricing',
        status: 'active',
        symbol: 'AAA',
        snapshot: { payload: { structural_decay: { score: 0.5 }, people_layer: {} } },
      },
      {
        id: 'p2',
        type: 'pricing',
        status: 'active',
        symbol: 'BBB',
        snapshot: { payload: { structural_decay: { score: 0.8 }, people_layer: {} } },
      },
    ];
    const result = buildDecayWatchModel(tasks);
    expect(result[0].symbol).toBe('BBB');
    expect(result[1].symbol).toBe('AAA');
  });

  it('sets refreshLabel based on score', () => {
    const tasks = [
      {
        id: 'p1',
        type: 'pricing',
        status: 'active',
        symbol: 'TST',
        snapshot: { payload: { structural_decay: { score: 0.75 } } },
      },
    ];
    const result = buildDecayWatchModel(tasks);
    expect(result[0].refreshLabel).toBe('优先重看');
  });

  it('limits to 5 items', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      type: 'pricing',
      status: 'active',
      symbol: `SYM${i}`,
      snapshot: { payload: { structural_decay: { score: 0.5 + i * 0.01 } } },
    }));
    const result = buildDecayWatchModel(tasks);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe('buildTradeThesisWatchModel', () => {
  it('returns empty array with no tasks', () => {
    expect(buildTradeThesisWatchModel([], [])).toEqual([]);
  });

  it('filters to trade_thesis tasks', () => {
    const tasks = [
      {
        id: 'tt1',
        type: 'trade_thesis',
        status: 'active',
        symbol: 'BABA',
        title: 'BABA Thesis',
        snapshot: {
          payload: {
            trade_thesis: {
              thesis: { stance: 'bearish', summary: 'test', trade_legs: [] },
              structural_decay: {},
              people_layer: {},
              results_summary: {},
            },
          },
        },
      },
      {
        id: 'p1',
        type: 'pricing',
        status: 'active',
        symbol: 'NVDA',
      },
    ];
    const result = buildTradeThesisWatchModel(tasks, []);
    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe('tt1');
  });

  it('has required output fields', () => {
    const tasks = [
      {
        id: 'tt1',
        type: 'trade_thesis',
        status: 'active',
        symbol: 'TSM',
        title: 'TSM Thesis',
        snapshot: {
          payload: {
            trade_thesis: {
              thesis: {
                stance: 'long',
                summary: 'long tsm',
                expected_horizon: '3-6m',
                trade_legs: [{ symbol: 'TSM', side: 'long', weight: 1 }],
              },
              structural_decay: {},
              people_layer: {},
            },
          },
        },
      },
    ];
    const result = buildTradeThesisWatchModel(tasks, []);
    const item = result[0];
    expect(item).toHaveProperty('key');
    expect(item).toHaveProperty('taskId');
    expect(item).toHaveProperty('symbol');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('stance');
    expect(item).toHaveProperty('horizon');
    expect(item).toHaveProperty('tradeLegs');
    expect(item).toHaveProperty('refreshLabel');
    expect(item).toHaveProperty('action');
  });

  it('limits to 5 items', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `tt${i}`,
      type: 'trade_thesis',
      status: 'active',
      symbol: `SYM${i}`,
      snapshot: {
        payload: {
          trade_thesis: {
            thesis: { stance: 'long', trade_legs: [] },
            structural_decay: {},
            people_layer: {},
          },
        },
      },
    }));
    const result = buildTradeThesisWatchModel(tasks, []);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe('buildCrossMarketCards', () => {
  it('returns empty array with no templates', () => {
    const result = buildCrossMarketCards({}, {}, {}, []);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns cards sorted by recommendationScore descending', () => {
    const payload = {
      templates: [
        {
          id: 'utilities_vs_growth',
          name: 'Utilities vs Growth',
          assets: [
            { symbol: 'DUK', side: 'long', weight: 0.6, asset_class: 'EQUITY' },
            { symbol: 'QQQ', side: 'short', weight: 0.4 },
          ],
          linked_factors: ['bureaucratic_friction'],
          linked_dimensions: [],
          preferred_signal: null,
        },
        {
          id: 'copper_vs_semis',
          name: 'Copper vs Semis',
          assets: [
            { symbol: 'COPPER', side: 'long', weight: 0.5, asset_class: 'COMMODITY_FUTURES' },
          ],
          linked_factors: ['baseload_mismatch'],
          linked_dimensions: [],
          preferred_signal: null,
        },
      ],
    };
    const overview = {
      factors: [
        { name: 'bureaucratic_friction', z_score: 1.5, value: 0.5, signal: 1, confidence: 0.8 },
        { name: 'baseload_mismatch', z_score: 0.1, value: 0.1, signal: 0, confidence: 0.5 },
      ],
    };
    const result = buildCrossMarketCards(payload, overview, {}, []);
    expect(result.length).toBe(2);
    // utilities_vs_growth should score higher given bureaucratic_friction z_score=1.5
    expect(Number(result[0].recommendationScore)).toBeGreaterThanOrEqual(Number(result[1].recommendationScore));
  });
});
