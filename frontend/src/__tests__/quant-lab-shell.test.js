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
          label: '迁移候选',
          tone: 'migration',
        }}
        activeTab="optimizer"
        activeTabMeta={{
          key: 'optimizer',
          title: '策略优化器',
          summary: '把参数搜索、稳健性验证和候选策略筛选压缩到同一个执行台。',
          boundarySummary: '策略交易类能力，新功能迁往 quant-trading-system。',
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
            key: 'migration',
            label: '迁移候选',
            tone: 'migration',
            count: 6,
            description: '策略、回测、实时信号和行业轮动类能力只保留入口，后续主开发应放到 quant-trading-system。',
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
            title: '当前实验台',
            detail: '策略优化器 · 把参数搜索、稳健性验证和候选策略筛选压缩到同一个执行台。',
          },
        ]}
        heroMetrics={[
          { label: '工作区', value: '10 个' },
          { label: '策略模板', value: '5 个' },
        ]}
        onTabChange={handleTabChange}
        tabMeta={[
          { key: 'optimizer', title: '策略优化器', shortTitle: '优化', boundary: 'migration', boundarySummary: '策略交易类能力，新功能迁往 quant-trading-system。' },
          { key: 'ops', title: '研究运营中心', shortTitle: '运营', boundary: 'support', boundarySummary: '只做告警、数据质量和历史研究闭环支撑。' },
        ]}
      >
        <div>workspace content</div>
      </QuantLabShell>,
    );

    expect(screen.getByTestId('quantlab-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '定价实验台' })).toBeInTheDocument();
    expect(screen.getByTestId('quantlab-boundary-summary')).toBeInTheDocument();
    expect(screen.getByText('实验与运营工作区')).toBeInTheDocument();
    expect(screen.getByText('workspace content')).toBeInTheDocument();
    expect(screen.getAllByText('迁移候选').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/quant-trading-system/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /运\s*营/ }));

    expect(handleTabChange).toHaveBeenCalledWith('ops');
  });
});
