import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AlertCenter from '../components/AlertCenter';
import * as api from '../services/api';

jest.mock('../services/api', () => ({
  getQuantAlertOrchestration: jest.fn(),
  updateQuantAlertOrchestration: jest.fn(),
  resolveQuantAlertAction: jest.fn(),
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
    api.resolveQuantAlertAction.mockRejectedValue({ response: { status: 404 } });
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

    expect(api.getQuantAlertOrchestration).not.toHaveBeenCalled();
    expect(document.querySelector('.ant-badge-count')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '打开研究告警中心' }));

    await waitFor(() => {
      expect(api.getQuantAlertOrchestration).toHaveBeenCalledTimes(1);
    });
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

  it('renders alert digest next actions and resolves falsy alert ids', async () => {
    api.getQuantAlertOrchestration.mockResolvedValueOnce({
      summary: {
        reviewed_events: 1,
      },
      alert_center: {
        current_alerts: [
          {
            ...baseAlert,
            id: false,
            status: 'active',
          },
        ],
        timeline: [],
        counts: {
          open_current: 1,
          by_severity: { warning: 1 },
        },
        digest: {
          headline: '1 个待处理告警，最高级别 warning，主要来源 macro',
          urgency: 'warning',
          next_actions: [
            {
              id: 'review_alert:False',
              target_alert_id: false,
              label: '复盘 warning 告警：宏观信号偏强',
              reason: 'macro · active · warning',
            },
          ],
        },
      },
    });

    render(<AlertCenter />);

    fireEvent.click(screen.getByRole('button', { name: '打开研究告警中心' }));

    expect(await screen.findByText('告警摘要')).toBeInTheDocument();
    expect(screen.getByText('1 个待处理告警，最高级别 warning，主要来源 macro')).toBeInTheDocument();
    expect(screen.getByText('复盘 warning 告警：宏观信号偏强')).toBeInTheDocument();
    expect(screen.getByText('macro · active · warning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /解决/ }));

    await waitFor(() => {
      expect(api.updateQuantAlertOrchestration).toHaveBeenCalledWith({
        history_updates: [
          expect.objectContaining({
            id: false,
            review_status: 'resolved',
          }),
        ],
      });
    });
  });

  it('maps snoozed digest actions to the same snooze lifecycle used by the backend', async () => {
    api.resolveQuantAlertAction.mockResolvedValueOnce({
      orchestration: {
        alert_center: {
          current_alerts: [
            {
              ...baseAlert,
              id: 'alert_1',
              status: 'snoozed',
              snoozed_until: '2026-04-19T13:42:00',
            },
          ],
          timeline: [],
          counts: { open_current: 1 },
          digest: {
            headline: '1 个暂缓告警待检查',
            urgency: 'warning',
            next_actions: [
              {
                id: 'check_snoozed_alert:alert_1',
                target_alert_id: 'alert_1',
                action_type: 'check_snoozed_alert',
                label: '检查暂缓告警：宏观信号偏强',
                reason: 'macro · snoozed · warning',
              },
            ],
          },
        },
      },
    });
    api.getQuantAlertOrchestration.mockResolvedValueOnce({
      alert_center: {
        current_alerts: [
          {
            ...baseAlert,
            id: 'alert_1',
            status: 'snoozed',
            snoozed_until: '2026-04-19T13:40:00',
          },
        ],
        timeline: [],
        counts: { open_current: 1 },
        digest: {
          headline: '1 个暂缓告警待检查',
          urgency: 'warning',
          next_actions: [
            {
              id: 'check_snoozed_alert:alert_1',
              target_alert_id: 'alert_1',
              action_type: 'check_snoozed_alert',
              label: '检查暂缓告警：宏观信号偏强',
              reason: 'macro · snoozed · warning',
            },
          ],
        },
      },
    });

    render(<AlertCenter />);

    fireEvent.click(screen.getByRole('button', { name: '打开研究告警中心' }));

    expect(await screen.findByText('检查暂缓告警：宏观信号偏强')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '暂缓下一步动作 检查暂缓告警：宏观信号偏强' }));

    await waitFor(() => {
      expect(api.resolveQuantAlertAction).toHaveBeenCalledWith({
        alert_id: 'alert_1',
        action: 'snooze',
        note: '检查暂缓告警：宏观信号偏强',
        source_action_id: 'check_snoozed_alert:alert_1',
        snoozed_until: expect.any(String),
      });
    });
  });

  it('uses the alert action endpoint from digest controls when available', async () => {
    api.resolveQuantAlertAction.mockResolvedValueOnce({
      orchestration: {
        summary: {
          reviewed_events: 1,
        },
        alert_center: {
          current_alerts: [
            {
              ...baseAlert,
              id: false,
              status: 'acknowledged',
              acknowledged_at: '2026-04-19T09:42:00',
            },
          ],
          timeline: [],
          counts: {
            open_current: 1,
            by_severity: { warning: 1 },
          },
          digest: {
            headline: '1 个待处理告警，最高级别 warning，主要来源 macro',
            urgency: 'warning',
            next_actions: [
              {
                id: 'resolve_acknowledged_alert:False',
                target_alert_id: false,
                action_type: 'resolve_acknowledged_alert',
                label: '关闭已确认告警：宏观信号偏强',
                reason: 'macro · acknowledged · warning',
              },
            ],
          },
        },
      },
    });
    api.getQuantAlertOrchestration.mockResolvedValueOnce({
      summary: {
        reviewed_events: 0,
      },
      alert_center: {
        current_alerts: [
          {
            ...baseAlert,
            id: false,
            status: 'acknowledged',
            acknowledged_at: '2026-04-19T09:40:00',
          },
        ],
        timeline: [],
        counts: {
          open_current: 1,
          by_severity: { warning: 1 },
        },
        digest: {
          headline: '1 个待处理告警，最高级别 warning，主要来源 macro',
          urgency: 'warning',
          next_actions: [
            {
              id: 'resolve_acknowledged_alert:False',
              target_alert_id: false,
              action_type: 'resolve_acknowledged_alert',
              label: '关闭已确认告警：宏观信号偏强',
              reason: 'macro · acknowledged · warning',
            },
          ],
        },
      },
    });

    render(<AlertCenter />);

    fireEvent.click(screen.getByRole('button', { name: '打开研究告警中心' }));

    expect(await screen.findByText('关闭已确认告警：宏观信号偏强')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '解决下一步动作 关闭已确认告警：宏观信号偏强' }));

    await waitFor(() => {
      expect(api.resolveQuantAlertAction).toHaveBeenCalledWith({
        alert_id: false,
        action: 'resolve',
        note: '关闭已确认告警：宏观信号偏强',
        source_action_id: 'resolve_acknowledged_alert:False',
      });
    });
    expect(api.updateQuantAlertOrchestration).not.toHaveBeenCalled();
    expect(await screen.findByText('macro · acknowledged · warning')).toBeInTheDocument();
  });
});
