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
        activeTab="optimizer"
        activeTabMeta={{
          key: 'optimizer',
          title: '策略优化器',
          summary: '把参数搜索、稳健性验证和候选策略筛选压缩到同一个执行台。',
        }}
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
          { key: 'optimizer', shortTitle: '优化' },
          { key: 'ops', shortTitle: '运营' },
        ]}
      >
        <div>workspace content</div>
      </QuantLabShell>,
    );

    expect(screen.getByTestId('quantlab-page')).toBeInTheDocument();
    expect(screen.getByText('量化实验与运营工作台')).toBeInTheDocument();
    expect(screen.getByText('实验与运营工作区')).toBeInTheDocument();
    expect(screen.getByText('workspace content')).toBeInTheDocument();
    expect(screen.getByText('把参数搜索、稳健性验证和候选策略筛选压缩到同一个执行台。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /运\s*营/ }));

    expect(handleTabChange).toHaveBeenCalledWith('ops');
  });
});
