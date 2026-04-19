import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import WorkbenchShell from '../components/research-workbench/WorkbenchShell';

describe('WorkbenchShell', () => {
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

  it('renders the shell and wires context actions', () => {
    const handleCopy = jest.fn();
    const handleBulkQueue = jest.fn();
    const handleBulkComment = jest.fn();

    render(
      <WorkbenchShell
        bulkCommentCount={4}
        bulkQueueCount={2}
        contextItems={[
          { title: '视图摘要', detail: '快速视图：自动排序升档 · 类型：Pricing' },
          { title: '当前定位', detail: '当前定位：rw_msft' },
        ]}
        heroBriefItems={[
          { label: '共享视图', value: '快速视图：自动排序升档 · 类型：Pricing' },
          { label: '复盘节奏', value: '建议更新 2 · 建议复核 1 · 继续观察 3' },
          { label: '当前焦点', value: 'MSFT 防御型主题' },
        ]}
        heroMetrics={[
          { label: '当前视图任务', value: '12' },
          { label: '进行中', value: '4' },
        ]}
        onBulkComment={handleBulkComment}
        onBulkQueue={handleBulkQueue}
        onCopyViewLink={handleCopy}
        saving={false}
        viewSummary={{
          hasActiveFilters: true,
          note: '打开这个链接后，工作台会恢复到同一组筛选条件和当前任务焦点。',
        }}
      >
        <div>workbench-content</div>
      </WorkbenchShell>,
    );

    const hero = screen.getByTestId('workbench-hero');
    const contextRail = screen.getByText('当前共享视图').closest('.app-page-context-rail');

    expect(screen.getByTestId('workbench-page')).toBeInTheDocument();
    expect(screen.getByText('研究工作台')).toBeInTheDocument();
    expect(screen.getByText('当前共享视图')).toBeInTheDocument();
    expect(screen.getByText('workbench-content')).toBeInTheDocument();
    expect(within(hero).getByText('快速视图：自动排序升档 · 类型：Pricing')).toBeInTheDocument();
    expect(within(contextRail).getByText('当前定位：rw_msft')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制当前视图链接' }));
    fireEvent.click(screen.getByRole('button', { name: '批量推进到进行中 (2)' }));
    fireEvent.click(screen.getByRole('button', { name: '批量写入复盘评论 (4)' }));

    expect(handleCopy).toHaveBeenCalledTimes(1);
    expect(handleBulkQueue).toHaveBeenCalledTimes(1);
    expect(handleBulkComment).toHaveBeenCalledTimes(1);
  });
});
