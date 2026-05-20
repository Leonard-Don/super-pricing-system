import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import QuantLabShell from '../components/quant-lab/QuantLabShell';

describe('QuantLabShell', () => {
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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
    Object.defineProperty(global, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
    if (!window.ResizeObserver) {
      window.ResizeObserver = class ResizeObserver {
        observe() {}

        unobserve() {}

        disconnect() {}
      };
    }
    if (!global.ResizeObserver) {
      global.ResizeObserver = window.ResizeObserver;
    }
  });

  it('renders the structured shell and forwards shortcut clicks', () => {
    const handleTabChange = jest.fn();

    render(
      <QuantLabShell
        activeBoundary={{
          label: '定价内核',
          tone: 'pricing',
        }}
        activeTab="valuation"
        activeTabMeta={{
          key: 'valuation',
          title: '估值历史与集成',
          summary: '统一历史估值、模型集成和市场偏离。',
          boundarySummary: '估值历史与模型集成是本仓定价核心。',
        }}
        boundarySummary={[
          {
            key: 'pricing',
            label: '定价内核',
            tone: 'pricing',
            count: 2,
            description: '直接服务估值、模型解释和定价判断，是 super-pricing-system 的核心能力。',
          },
          {
            key: 'migrated',
            label: '已迁移',
            tone: 'migrated',
            count: 6,
            description: '策略、回测、实时信号和行业轮动类能力已从本页移出，由 quant-trading-system 承接。',
          },
          {
            key: 'support',
            label: '内部支撑',
            tone: 'support',
            count: 2,
            description: '用于任务队列、告警、数据质量和历史快照兼容，不扩成独立交易产品面。',
          },
        ]}
        focusItems={[
          {
            title: '当前工作区',
            detail: '估值历史与集成 · 定价内核 · 估值历史与模型集成是本仓定价核心。',
          },
        ]}
        heroMetrics={[
          { label: '工作区', value: '10 个' },
          { label: '策略模板', value: '5 个' },
        ]}
        onTabChange={handleTabChange}
        tabMeta={[
          { key: 'valuation', title: '估值历史与集成', shortTitle: '估值', boundary: 'pricing', boundarySummary: '估值历史与模型集成是本仓定价核心。' },
          { key: 'ops', title: '研究运营中心', shortTitle: '运营', boundary: 'support', boundarySummary: '只做告警、数据质量和历史研究闭环支撑。' },
        ]}
      >
        <div>workspace content</div>
      </QuantLabShell>,
    );

    expect(screen.getByTestId('quantlab-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '定价实验台' })).toBeInTheDocument();
    expect(screen.getByTestId('quantlab-boundary-summary')).toBeInTheDocument();
    expect(screen.getByText(/当前仓的定价实验和运行支撑/)).toBeInTheDocument();
    expect(screen.getByText('workspace content')).toBeInTheDocument();
    expect(screen.getAllByText('已迁移').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/quant-trading-system/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /运\s*营/ }));

    expect(handleTabChange).toHaveBeenCalledWith('ops');
  });
});
