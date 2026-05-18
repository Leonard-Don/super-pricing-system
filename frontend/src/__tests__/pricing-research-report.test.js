import {
  buildPricingResearchAuditPayload,
  buildPricingResearchReportHtml,
  openPricingResearchPrintWindow,
} from '../utils/pricingResearchReport';

describe('pricingResearchReport', () => {
  test('builds printable pricing research report html with core sections', () => {
    const html = buildPricingResearchReportHtml({
      symbol: 'AAPL',
      period: '1y',
      generatedAt: '2026-03-30 10:00:00',
      context: { source: 'research-workbench' },
      analysis: {
        symbol: 'AAPL',
        summary: '当前研究显示定价存在明显低估。',
        gap_analysis: {
          current_price: 102.4,
          fair_value_mid: 118.5,
          fair_value_low: 96.2,
          fair_value_high: 131.4,
          gap_pct: -13.6,
          direction: '低估',
        },
        factor_model: {
          period: '1y',
          data_points: 180,
          capm: { alpha_pct: 3.1, beta: 0.92 },
          fama_french: { alpha_pct: 2.4 },
          fama_french_five_factor: { alpha_pct: 2.1 },
        },
        valuation: {
          current_price_source: 'live',
          dcf: {
            intrinsic_value: 120.4,
            scenarios: [
              { label: '悲观', intrinsic_value: 96.2, premium_discount: 6.1, assumptions: { wacc: 0.093, initial_growth: 0.08 } },
              { label: '基准', intrinsic_value: 118.5, premium_discount: -13.6, assumptions: { wacc: 0.082, initial_growth: 0.12 } },
            ],
          },
          comparable: {
            fair_value: 116.2,
            benchmark_source: '动态同行中位数',
            methods: [
              { method: 'P/E 倍数法', current_multiple: 22.1, benchmark_multiple: 25.4, fair_value: 114.2 },
            ],
          },
          fair_value: {
            method: 'DCF + 可比估值加权',
          },
        },
        deviation_drivers: {
          primary_driver: {
            factor: 'P/E 倍数法折价',
            ranking_reason: '相对同行中位数折价最明显，说明市场给予的倍数仍偏保守。',
          },
        },
        implications: {
          primary_view: '低估',
          confidence: 'high',
          confidence_score: 0.84,
          factor_alignment: { label: '同向' },
          trade_setup: {
            stance: '关注做多修复',
            target_price: 118.5,
            stop_loss: 95.0,
            risk_reward: 1.9,
          },
          confidence_breakdown: [
            { label: '证据共振', delta: 0.12, status: 'positive', detail: '因子与估值方向一致' },
          ],
        },
      },
      snapshot: {
        audit_trail: {
          price_source: 'live',
          factor_source: 'ff3_live',
          comparable_benchmark_source: 'peer_median',
        },
      },
      sensitivity: {
        selected_case: { label: '自定义' },
      },
      history: {
        history: [
          { date: '2026-03-28', price: 100.1, gap_pct: -15.4 },
        ],
      },
      peerComparison: {
        target: { symbol: 'AAPL', current_price: 102.4, fair_value: 118.5, premium_discount: -13.6 },
        peers: [
          { symbol: 'MSFT', current_price: 410.1, fair_value: 399.8, premium_discount: 2.6 },
        ],
      },
    });

    expect(html).toContain('定价研究报告');
    expect(html).toContain('执行摘要');
    expect(html).toContain('估值细节');
    expect(html).toContain('置信度拆解');
    expect(html).toContain('AAPL');
    expect(html).toContain('关注做多修复');
    expect(html).toContain('动态同行中位数');
  });

  test('builds audit payload with snapshot and raw analysis', () => {
    const payload = buildPricingResearchAuditPayload({
      symbol: 'AAPL',
      period: '6mo',
      context: { source: 'pricing' },
      analysis: { summary: 'test' },
      snapshot: { audit_trail: { price_source: 'live' } },
      playbook: { stageLabel: '估值锚点' },
      sensitivity: { selected_case: { label: '乐观' } },
      history: { summary: { latest_gap_pct: -12.3 } },
      peerComparison: { sector: 'Technology' },
    });

    expect(payload.symbol).toBe('AAPL');
    expect(payload.period).toBe('6mo');
    expect(payload.snapshot.audit_trail.price_source).toBe('live');
    expect(payload.analysis.summary).toBe('test');
    expect(payload.peer_comparison.sector).toBe('Technology');
    expect(payload.exported_at).toBeTruthy();
  });

  test('sanitises non-finite audit payload numbers without mutating the source data', () => {
    const source = {
      symbol: 'BAD',
      period: '1y',
      context: { source: 'pricing', enabled: true, note: 'keep me' },
      analysis: {
        gap_analysis: {
          current_price: Number.NaN,
          fair_value_mid: Number.POSITIVE_INFINITY,
          fair_value_low: Number.NEGATIVE_INFINITY,
          fair_value_high: 0,
          gap_pct: -12.345,
        },
        implications: {
          confidence_breakdown: [
            { label: '零变化', delta: 0, status: 'neutral' },
            { label: '坏变化', delta: Number.NaN, status: 'warning' },
          ],
        },
      },
      snapshot: {
        audit_trail: {
          price_source: 'live',
          source_latency_ms: Number.POSITIVE_INFINITY,
          fallback_used: false,
        },
      },
      sensitivity: {
        selected_case: {
          label: '压力',
          assumptions: [0, Number.NaN, -0.25, Number.NEGATIVE_INFINITY],
        },
      },
      history: {
        history: [
          { date: '2026-03-30', price: 0, gap_pct: Number.POSITIVE_INFINITY },
          { date: '2026-03-29', price: -1.25, gap_pct: Number.NaN },
        ],
      },
    };

    const payload = buildPricingResearchAuditPayload(source);

    expect(payload.analysis.gap_analysis.current_price).toBeNull();
    expect(payload.analysis.gap_analysis.fair_value_mid).toBeNull();
    expect(payload.analysis.gap_analysis.fair_value_low).toBeNull();
    expect(payload.analysis.gap_analysis.fair_value_high).toBe(0);
    expect(payload.analysis.gap_analysis.gap_pct).toBe(-12.345);
    expect(payload.analysis.implications.confidence_breakdown).toEqual([
      { label: '零变化', delta: 0, status: 'neutral' },
      { label: '坏变化', delta: null, status: 'warning' },
    ]);
    expect(payload.snapshot.audit_trail).toEqual({
      price_source: 'live',
      source_latency_ms: null,
      fallback_used: false,
    });
    expect(payload.sensitivity.selected_case.assumptions).toEqual([0, null, -0.25, null]);
    expect(payload.history.history).toEqual([
      { date: '2026-03-30', price: 0, gap_pct: null },
      { date: '2026-03-29', price: -1.25, gap_pct: null },
    ]);
    expect(payload.context).toEqual({ source: 'pricing', enabled: true, note: 'keep me' });

    expect(source.analysis.gap_analysis.fair_value_high).toBe(0);
    expect(source.analysis.gap_analysis.gap_pct).toBe(-12.345);
    expect(Number.isNaN(source.analysis.gap_analysis.current_price)).toBe(true);
    expect(source.analysis.gap_analysis.fair_value_mid).toBe(Number.POSITIVE_INFINITY);
    expect(source.analysis.gap_analysis.fair_value_low).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isNaN(source.analysis.implications.confidence_breakdown[1].delta)).toBe(true);
    expect(source.snapshot.audit_trail.source_latency_ms).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(source.sensitivity.selected_case.assumptions[1])).toBe(true);
    expect(source.sensitivity.selected_case.assumptions[3]).toBe(Number.NEGATIVE_INFINITY);
    expect(source.history.history[0].gap_pct).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(source.history.history[1].gap_pct)).toBe(true);
  });

  test('sanitises JSON-unsafe audit payload values before export', () => {
    const source = {
      symbol: 'ODD',
      period: '1y',
      context: {
        revision: 1n,
        handler: () => 'ignore',
        marker: Symbol('audit-marker'),
        missing: undefined,
      },
      analysis: {
        values: [1n, undefined, () => 'ignore', Symbol('nested-marker')],
      },
    };

    const payload = buildPricingResearchAuditPayload(source);

    expect(payload.context).toEqual({
      revision: null,
      handler: null,
      marker: null,
      missing: null,
    });
    expect(payload.analysis.values).toEqual([null, null, null, null]);
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(source.context.revision).toBe(1n);
    expect(typeof source.context.handler).toBe('function');
    expect(typeof source.context.marker).toBe('symbol');
    expect(source.analysis.values[0]).toBe(1n);
  });

  test('renders dash placeholders for non-finite numeric fields instead of literal NaN or Infinity', () => {
    const html = buildPricingResearchReportHtml({
      symbol: 'BAD',
      period: '1y',
      generatedAt: '2026-03-30 10:00:00',
      analysis: {
        symbol: 'BAD',
        gap_analysis: {
          current_price: Number.NaN,
          fair_value_mid: Number.POSITIVE_INFINITY,
          fair_value_low: Number.NaN,
          fair_value_high: Number.NEGATIVE_INFINITY,
          gap_pct: Number.NaN,
        },
        factor_model: {
          period: '1y',
          capm: { alpha_pct: Number.NaN, beta: Number.POSITIVE_INFINITY },
          fama_french: { alpha_pct: Number.NaN },
          fama_french_five_factor: { alpha_pct: Number.NEGATIVE_INFINITY },
        },
        valuation: {
          dcf: {
            intrinsic_value: Number.NaN,
            scenarios: [
              {
                label: '坏数据',
                intrinsic_value: Number.NaN,
                premium_discount: Number.POSITIVE_INFINITY,
                assumptions: { wacc: Number.NaN, initial_growth: Number.NaN },
              },
            ],
          },
          comparable: {
            fair_value: Number.NaN,
            methods: [
              {
                method: '坏倍数',
                current_multiple: Number.NaN,
                benchmark_multiple: Number.POSITIVE_INFINITY,
                fair_value: Number.NaN,
              },
            ],
          },
        },
        implications: {
          primary_view: '观察',
          confidence: 'low',
          confidence_score: Number.NaN,
          confidence_breakdown: [
            { label: '坏变化', delta: Number.POSITIVE_INFINITY, status: 'neutral', detail: '缺失有限变化' },
          ],
          trade_setup: {
            stance: '观察',
            target_price: Number.NaN,
            stop_loss: Number.NEGATIVE_INFINITY,
            risk_reward: Number.NaN,
          },
        },
      },
      history: {
        history: [
          { date: '2026-03-29', price: Number.NaN, gap_pct: Number.NaN },
        ],
      },
      peerComparison: {
        target: {
          symbol: 'BAD',
          current_price: Number.NaN,
          fair_value: Number.NaN,
          premium_discount: Number.POSITIVE_INFINITY,
        },
        peers: [],
      },
    });

    expect(html).not.toMatch(/\$NaN/);
    expect(html).not.toMatch(/\$Infinity/);
    expect(html).not.toMatch(/\$-Infinity/);
    expect(html).not.toMatch(/NaN%/);
    expect(html).not.toMatch(/Infinity%/);
    expect(html).not.toMatch(/-Infinity%/);
    expect(html).not.toMatch(/>NaN</);
    expect(html).not.toMatch(/>Infinity</);
    expect(html).not.toMatch(/>-Infinity</);
    expect(html).toMatch(/<tr><td>坏数据<\/td><td>—<\/td><td>—<\/td><td>—<\/td><td>—<\/td><\/tr>/);
    expect(html).toMatch(/<tr><td>坏变化<\/td><td>—<\/td><td>neutral<\/td><td>缺失有限变化<\/td><\/tr>/);
    expect(html).toContain('<div class="metric-card__value">low / —</div>');
  });

  test('preserves real zero values while rendering missing rates as dash placeholders', () => {
    const html = buildPricingResearchReportHtml({
      symbol: 'ZERO',
      period: '1y',
      generatedAt: '2026-03-30 10:00:00',
      analysis: {
        symbol: 'ZERO',
        gap_analysis: {
          current_price: 0,
          fair_value_mid: 0,
          fair_value_low: 0,
          fair_value_high: 0,
          gap_pct: 0,
        },
        valuation: {
          dcf: {
            scenarios: [
              {
                label: '零假设',
                intrinsic_value: 0,
                premium_discount: 0,
                assumptions: { wacc: 0, initial_growth: 0 },
              },
              {
                label: '缺失假设',
                intrinsic_value: 0,
                premium_discount: 0,
                assumptions: { wacc: null, initial_growth: undefined },
              },
            ],
          },
        },
        implications: {
          primary_view: '观察',
          confidence: 'medium',
          confidence_score: 0,
          confidence_breakdown: [
            { label: '零变化', delta: 0, status: 'neutral', detail: '真实零值' },
            { label: '缺失变化', delta: undefined, status: 'neutral', detail: '缺失值' },
          ],
        },
      },
    });

    expect(html).toMatch(/<tr><td>零假设<\/td><td>\$0\.00<\/td><td>0\.0%<\/td><td>0\.0%<\/td><td>0\.0%<\/td><\/tr>/);
    expect(html).toMatch(/<tr><td>缺失假设<\/td><td>\$0\.00<\/td><td>—<\/td><td>—<\/td><td>0\.0%<\/td><\/tr>/);
    expect(html).toMatch(/<tr><td>零变化<\/td><td>0\.00<\/td><td>neutral<\/td><td>真实零值<\/td><\/tr>/);
    expect(html).toMatch(/<tr><td>缺失变化<\/td><td>—<\/td><td>neutral<\/td><td>缺失值<\/td><\/tr>/);
    expect(html).toContain('<div class="metric-card__value">medium / 0.00</div>');
  });

  test('opens a printable window for pricing report', () => {
    const write = jest.fn();
    const focus = jest.fn();
    const mockWindow = {
      opener: 'something',
      document: {
        open: jest.fn(),
        write,
        close: jest.fn(),
      },
      focus,
    };
    const windowOpenSpy = jest.spyOn(window, 'open').mockReturnValue(mockWindow);

    const result = openPricingResearchPrintWindow('<html><body>report</body></html>');

    expect(result).toBe(true);
    expect(windowOpenSpy).toHaveBeenCalledWith('', '_blank');
    expect(write).toHaveBeenCalledWith('<html><body>report</body></html>');
    expect(mockWindow.opener).toBeNull();

    windowOpenSpy.mockRestore();
  });
});
