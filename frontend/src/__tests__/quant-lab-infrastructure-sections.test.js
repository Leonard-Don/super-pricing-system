import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { QuantLabInfrastructureTaskQueueSection } from '../components/quant-lab/QuantLabInfrastructureSections';

describe('QuantLabInfrastructureTaskQueueSection', () => {
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

  test('renders queue rows and result-loading actions for completed quant tasks', () => {
    const handleCancelTask = jest.fn();
    const handleLoadTaskResult = jest.fn();
    const loadMoreInfrastructureTasks = jest.fn();

    render(
      <QuantLabInfrastructureTaskQueueSection
        formatDateTime={(value) => String(value || '--')}
        formatPct={(value) => `${Number(value || 0) * 100}%`}
        handleCancelTask={handleCancelTask}
        handleLoadTaskResult={handleLoadTaskResult}
        infrastructureTaskFilters={{
          taskView: 'active',
          status: 'all',
          executionBackend: 'all',
          sortBy: 'activity',
          sortDirection: 'desc',
        }}
        infrastructureTaskPagination={{
          hasMore: true,
          loadingMore: false,
          total: 12,
        }}
        infrastructureTaskRows={[
          {
            id: 'task-1',
            key: 'task-1',
            name: 'quant_strategy_optimizer',
            execution_backend: 'local',
            broker_state: 'SUCCESS',
            status: 'completed',
            stage: 'done',
            progress: 1,
            created_at: '2026-04-20T10:00:00Z',
            payload: {},
          },
        ]}
        loadMoreInfrastructureTasks={loadMoreInfrastructureTasks}
        onInfrastructureTaskFilterChange={jest.fn()}
        persistedTaskTotal={12}
      />
    );

    expect(screen.getByText('任务队列')).toBeInTheDocument();
    expect(screen.getByText('已加载 1/12')).toBeInTheDocument();
    expect(screen.getByText('最近活跃')).toBeInTheDocument();
    expect(screen.getByText('优先处理')).toBeInTheDocument();
    expect(screen.getByText('全部状态')).toBeInTheDocument();
    expect(screen.getByText('全部后端')).toBeInTheDocument();
    expect(screen.getByText('quant_strategy_optimizer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '载入结果' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多任务' }));
    expect(loadMoreInfrastructureTasks).toHaveBeenCalledTimes(1);
  });
});
