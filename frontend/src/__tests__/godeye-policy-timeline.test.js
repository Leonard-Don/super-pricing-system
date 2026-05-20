import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import CrossMarketOverview from '../components/GodEyeDashboard/CrossMarketOverview';
import PolicyTimelineBar from '../components/GodEyeDashboard/PolicyTimelineBar';
import { buildTimelineModel } from '../components/GodEyeDashboard/overviewViewModels';

describe('GodEye policy timeline', () => {
  beforeAll(() => {
    const matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
    Object.defineProperty(global, 'matchMedia', { writable: true, value: matchMedia });
  });

  it('localizes policy source and Federal Reserve headline copy', () => {
    const items = buildTimelineModel({
      records: [
        {
          record_id: 'policy-1',
          timestamp: '2026-05-16T05:00:00Z',
          source: 'policy_radar:fed',
          confidence: 0.72,
          raw_value: {
            title:
              'Federal Reserve Board names Jerome H. Powell as chair pro tempore; Powell will serve as chair pro tempore until Kevin M. Warsh is sworn in as the new chair',
            policy_shift: 0,
            industry_impact: { AI算力: 0.12 },
          },
        },
        {
          record_id: 'policy-2',
          timestamp: '2026-05-16T06:00:00Z',
          source: 'policy_radar:fed',
          confidence: 0.66,
          raw_value: {
            title: 'Federal Reserve Board announces approval of application by the Stephen M. Calk 2025 Trust',
            policy_shift: 0.04,
            industry_impact: {},
          },
        },
      ],
    });

    expect(items[0]).toMatchObject({
      title: '美联储任命 Jerome H. Powell 为临时主席，直至新主席宣誓就任',
      source: '政策雷达 / 美联储',
      directionLabel: '中性',
    });
    expect(items[1].title).toBe('美联储批准 Stephen M. Calk 2025 Trust 的申请');

    const { container } = render(<PolicyTimelineBar items={items} />);

    expect(screen.getAllByText('美联储任命 Jerome H. Powell 为临时主席，直至新主席宣誓就任').length).toBeGreaterThan(0);
    expect(screen.getByText('美联储批准 Stephen M. Calk 2025 Trust 的申请')).toBeInTheDocument();
    expect(screen.getAllByText('政策雷达 / 美联储').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Federal Reserve|chair pro|policy_radar:fed/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('the Stephen');
  });

  it('localizes cross-market policy execution status copy', () => {
    const { container } = render(
      <CrossMarketOverview
        cards={[
          {
            id: 'utilities_vs_growth',
            recommendationTier: '候选方案',
            recommendationTone: 'blue',
            construction_mode: 'equal_weight',
            longCount: 1,
            shortCount: 1,
            recommendationScore: 0.72,
            policyExecutionReason: '反转 6 次，正文覆盖 0.65，执行状态 reversal_cluster',
            policyExecutionTopDepartment: 'ECB',
            policyExecutionRiskBudgetScale: 0.84,
            taskRefreshSelectionQualityRunState: {
              active: true,
              label: 'auto_downgraded',
              baseScore: 0.75,
              effectiveScore: 0.52,
              reason: 'selection quality unstable',
            },
            taskRefreshBiasCompressionShift: {
              currentReason: 'rate_curve_pressure',
              savedScale: 1,
              currentScale: 0.82,
            },
            matchedDrivers: [{ key: 'reversal', type: 'resonance', label: 'reversal_cluster' }],
            latestThemeCore: 'NDRC_TZ',
            latestThemeSupport: 'ECB',
            stance: '观察中',
            action: { label: '查看方案', target: 'pricing' },
          },
        ]}
      />
    );

    expect(container.textContent).toContain('执行状态 反转共振');
    expect(container.textContent).toContain('欧洲央行');
    expect(container.textContent).toContain('自动降级');
    expect(container.textContent).toContain('筛选质量 不稳定');
    expect(container.textContent).toContain('强度 1.00x→0.82x');
    expect(container.textContent).toContain('核心腿：发改委体改司 ｜ 辅助腿：欧洲央行');
    expect(container.textContent).not.toMatch(/reversal_cluster|ECB|auto_downgraded|selection quality|scale/i);
  });
});
