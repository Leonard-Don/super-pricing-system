import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AlertCenter from '../components/AlertCenter';
import * as api from '../services/api';

jest.mock('../services/api', () => ({
  getQuantAlertOrchestration: jest.fn(),
  updateQuantAlertOrchestration: jest.fn(),
}));

const baseAlert = {
  id: 'alert_1',
  rule_name: '宏观信号偏强',
  source_module: 'macro',
  severity: 'warning',
  symbol: 'SPY',
  message: '10D horizon 命中率 68%',
  trigger_time: '2026-04-19T09:30:00',
  review_status: 'pending',
};

describe('AlertCenter', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    api.getQuantAlertOrchestration.mockResolvedValue({
      summary: {
        reviewed_events: 3,
      },
      history_stats: {
        pending_queue: [baseAlert],
      },
      event_bus: {
        history: [
          baseAlert,
          {
            ...baseAlert,
            id: 'alert_2',
            rule_name: '旧告警',
            review_status: 'resolved',
          },
        ],
      },
    });
    api.updateQuantAlertOrchestration.mockResolvedValue({
      summary: {
        reviewed_events: 4,
      },
      history_stats: {
        pending_queue: [],
      },
      event_bus: {
        history: [
          {
            ...baseAlert,
            review_status: 'resolved',
            acknowledged_at: '2026-04-19T09:42:00',
          },
        ],
      },
    });
  });

  it('loads orchestration alerts and resolves pending items from the drawer', async () => {
    render(<AlertCenter />);

    await waitFor(() => {
      expect(api.getQuantAlertOrchestration).toHaveBeenCalled();
    });

    expect(document.querySelector('.ant-badge-count')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '打开研究告警中心' }));

    expect(await screen.findByText('研究告警中心')).toBeInTheDocument();
    expect(await screen.findByText('当前有 1 个待复盘告警')).toBeInTheDocument();
    expect(screen.getByText('宏观信号偏强')).toBeInTheDocument();
    expect(screen.getByText('待处理: 1')).toBeInTheDocument();
    expect(screen.getByText('已复盘: 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /解决/ }));

    await waitFor(() => {
      expect(api.updateQuantAlertOrchestration).toHaveBeenCalledWith({
        history_updates: [
          expect.objectContaining({
            id: 'alert_1',
            review_status: 'resolved',
          }),
        ],
      });
    });

    expect(await screen.findByText('当前没有待处理告警')).toBeInTheDocument();
  });
});
