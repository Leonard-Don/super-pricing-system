import { fireEvent, render, screen } from '@testing-library/react';

import DepartmentChaosBoard from '../components/GodEyeDashboard/DepartmentChaosBoard';
import PeopleLayerWatchlistPanel from '../components/GodEyeDashboard/PeopleLayerWatchlistPanel';
import PhysicalWorldTrackerPanel from '../components/GodEyeDashboard/PhysicalWorldTrackerPanel';

describe('GodEye product panels', () => {
  beforeAll(() => {
    const createMediaQueryList = (query) => {
      const listeners = new Set();
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
        addEventListener: (_event, listener) => listeners.add(listener),
        removeEventListener: (_event, listener) => listeners.delete(listener),
        dispatchEvent: (event) => {
          listeners.forEach((listener) => listener(event || { matches: false, media: query }));
          return true;
        },
      };
    };
    const matchMedia = (query) => createMediaQueryList(query);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
    Object.defineProperty(global, 'matchMedia', { writable: true, value: matchMedia });
  });

  it('routes people-layer watchlist actions into pricing and cross-market flows', () => {
    const onNavigate = jest.fn();

    render(
      <PeopleLayerWatchlistPanel
        overview={{
          people_layer_summary: {
            label: 'fragile',
            summary: '人的维度进入重点观察区。',
            watchlist: [
              {
                symbol: 'BABA',
                company_name: '阿里巴巴',
                risk_level: 'high',
                stance: 'fragile',
                people_fragility_score: 0.79,
                people_quality_score: 0.33,
                source_modes: ['official', 'proxy'],
                summary: '技术权威继续被非技术 KPI 稀释。',
              },
            ],
          },
        }}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText('人的维度观察名单')).toBeTruthy();
    expect(screen.getByText('BABA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '定价' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ target: 'pricing', symbol: 'BABA' }));
    fireEvent.click(screen.getByRole('button', { name: '跨市场' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ target: 'cross-market' }));
  });

  it('renders string-based source modes without crashing', () => {
    render(
      <PeopleLayerWatchlistPanel
        overview={{
          people_layer_summary: {
            label: 'watch',
            summary: '人的维度口径回退到了单值来源。',
            watchlist: [
              {
                symbol: 'PDD',
                company_name: '拼多多',
                risk_level: 'medium',
                stance: 'balanced',
                people_fragility_score: 0.41,
                people_quality_score: 0.58,
                source_modes: 'official',
                summary: '单值 source mode 也应该稳定渲染。',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('PDD')).toBeTruthy();
    expect(screen.getByText('来源 official')).toBeTruthy();
  });

  it('surfaces department chaos board with direct policy-template action', () => {
    const onNavigate = jest.fn();

    render(
      <DepartmentChaosBoard
        overview={{
          department_chaos_summary: {
            label: 'chaotic',
            summary: '部门级执行混乱继续升温。',
            top_departments: [
              {
                department: 'ndrc',
                department_label: '发改委',
                label: 'chaotic',
                chaos_score: 0.74,
                policy_reversal_count: 2,
                full_text_ratio: 0.41,
                lag_days: 14,
                execution_status: 'lagging',
                reason: '方向反复与执行滞后同步上升。',
              },
            ],
          },
        }}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText('部门执行混乱看板')).toBeTruthy();
    expect(screen.getByText('发改委')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '政策模板' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ target: 'cross-market', template: 'utilities_vs_growth' }));
  });

  it('keeps the policy-template entry available when department chaos is empty', () => {
    const onNavigate = jest.fn();

    render(
      <DepartmentChaosBoard
        overview={{
          department_chaos_summary: {
            label: 'watch',
            summary: '当前没有足够的部门样本，但仍建议先看默认政策模板。',
            top_departments: [],
          },
        }}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '政策模板' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({
      target: 'cross-market',
      template: 'utilities_vs_growth',
      note: '当前没有足够的部门样本，但仍建议先看默认政策模板。',
    }));
  });

  it('shows physical world tracker freshness, source mode, and fallback reason', () => {
    render(
      <PhysicalWorldTrackerPanel
        snapshot={{
          signals: {
            macro_hf: {
              dimensions: {
                trade: { score: 0.34, summary: '贸易脉冲偏弱。' },
                inventory: { score: 0.58, summary: '库存压力偏紧。' },
                logistics: { score: 0.21, summary: '港口拥堵有所抬升。' },
              },
              latest_readings: {
                customs_data: { freshness: '2h', source_mode: 'official' },
                lme_inventory: { freshness: '6h', source_mode: 'proxy', fallback_reason: '官方库存接口短暂不可用' },
                port_congestion: { freshness: '4h', source_mode: 'curated' },
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByText('实体世界追踪')).toBeTruthy();
    expect(screen.getByText('海关 / 贸易脉冲')).toBeTruthy();
    expect(screen.getByText('LME / 库存压力')).toBeTruthy();
    expect(screen.getByText('港口 / 物流摩擦')).toBeTruthy();
    expect(screen.getByText('回退原因：官方库存接口短暂不可用')).toBeTruthy();
  });
});
