import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import AltDataCandidateQueue from '../AltDataCandidateQueue';

const FIXED_NOW = new Date('2026-05-16T12:00:00Z');

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

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

function buildCandidates() {
  return [
    {
      candidate_id: 'altcand_policy_radar_policy_radar_industry_新能源汽车',
      source_component: 'policy_radar',
      signal_type: 'policy_radar_industry',
      industry: '新能源汽车',
      headline: '政策雷达：新能源汽车 偏空 (avg_impact=-0.35, mentions=8)',
      impact_score: -0.35,
      mentions: 8,
      generated_at: '2026-05-16T11:30:00+00:00',
      state: 'pending',
      snoozed_until: null,
      evidence_link: {
        component: 'policy_radar',
        snapshot_path: 'cache/alt_data/providers/policy_radar.json',
      },
      last_seen_at: '2026-05-16T11:30:00+00:00',
      converted_task_id: null,
    },
    {
      candidate_id: 'altcand_macro_hf_shfe_inventory_weekly_铜',
      source_component: 'macro_hf',
      signal_type: 'shfe_inventory_weekly',
      industry: '铜',
      headline: 'SHFE 库存：铜 周环比 -7.50%（去化）',
      impact_score: -7.5,
      mentions: 1,
      generated_at: '2026-05-16T11:30:00+00:00',
      state: 'pending',
      snoozed_until: null,
      evidence_link: {
        component: 'macro_hf',
        snapshot_path: 'cache/alt_data/providers/macro_hf.json',
      },
      last_seen_at: '2026-05-16T11:30:00+00:00',
      converted_task_id: null,
    },
    {
      candidate_id: 'altcand_policy_radar_policy_radar_industry_AI算力',
      source_component: 'policy_radar',
      signal_type: 'policy_radar_industry',
      industry: 'AI算力',
      headline: '政策雷达：AI算力 偏多 (avg_impact=+0.45, mentions=6)',
      impact_score: 0.45,
      mentions: 6,
      generated_at: '2026-05-16T11:30:00+00:00',
      state: 'pending',
      snoozed_until: null,
      evidence_link: {
        component: 'policy_radar',
        snapshot_path: 'cache/alt_data/providers/policy_radar.json',
      },
      last_seen_at: '2026-05-16T11:30:00+00:00',
      converted_task_id: null,
    },
  ];
}

function buildApiOverrides(initialCandidates) {
  return {
    list: jest.fn().mockResolvedValue({ success: true, data: initialCandidates, total: initialCandidates.length }),
    refresh: jest.fn().mockResolvedValue({
      success: true,
      data: {
        stats: { added: 1, updated: 2, pruned: 0, total: 3 },
        pending: initialCandidates,
      },
      total: initialCandidates.length,
    }),
    convert: jest.fn().mockResolvedValue({
      success: true,
      data: { candidate: initialCandidates[0], task: { id: 'rw_new_task' }, task_id: 'rw_new_task' },
    }),
    dismiss: jest.fn().mockResolvedValue({ success: true, data: { ...initialCandidates[0], state: 'dismissed' } }),
    snooze: jest.fn().mockResolvedValue({
      success: true,
      data: { ...initialCandidates[0], state: 'snoozed', snoozed_until: '2026-05-17T11:00:00Z' },
    }),
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  });
}

describe('AltDataCandidateQueue', () => {
  test('renders three candidates with source tags + count badge', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-candidate-queue')).toBeInTheDocument();
    });

    candidates.forEach((candidate) => {
      expect(
        screen.getByTestId(`alt-data-candidate-row-${candidate.candidate_id}`),
      ).toBeInTheDocument();
    });

    const policyTags = screen.getAllByTestId('alt-data-candidate-source-policy_radar');
    expect(policyTags.length).toBe(2);
    expect(screen.getAllByTestId('alt-data-candidate-source-macro_hf').length).toBe(1);

    const badge = screen.getByTestId('alt-data-candidate-queue-count');
    expect(badge.textContent).toContain('3');
  });

  test('convert action triggers convert API + onTaskCreated callback', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);
    const onTaskCreated = jest.fn();

    render(
      <AltDataCandidateQueue
        apiOverrides={apis}
        onTaskCreated={onTaskCreated}
        messageApi={null}
      />,
    );
    await flushAsync();

    const convertBtn = await screen.findByTestId(
      `alt-data-candidate-convert-${candidates[0].candidate_id}`,
    );
    await act(async () => {
      fireEvent.click(convertBtn);
    });
    await flushAsync();

    expect(apis.convert).toHaveBeenCalledWith(candidates[0].candidate_id);
    await waitFor(() => {
      expect(onTaskCreated).toHaveBeenCalledTimes(1);
    });
    expect(apis.list).toHaveBeenCalled();
  });

  test('dismiss action triggers dismiss API', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    const dismissBtn = await screen.findByTestId(
      `alt-data-candidate-dismiss-${candidates[1].candidate_id}`,
    );
    await act(async () => {
      fireEvent.click(dismissBtn);
    });
    await flushAsync();

    expect(apis.dismiss).toHaveBeenCalledWith(candidates[1].candidate_id);
  });

  test('refresh button triggers refresh API and re-renders pending list', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    const refreshBtn = screen.getByTestId('alt-data-candidate-queue-refresh');
    await act(async () => {
      fireEvent.click(refreshBtn);
    });
    await flushAsync();

    expect(apis.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      // Three rows still rendered after refresh.
      expect(
        screen.getByTestId(`alt-data-candidate-row-${candidates[0].candidate_id}`),
      ).toBeInTheDocument();
    });
  });

  test('renders empty state when API returns zero candidates', async () => {
    const apis = {
      list: jest.fn().mockResolvedValue({ success: true, data: [], total: 0 }),
      refresh: jest.fn(),
      convert: jest.fn(),
      dismiss: jest.fn(),
      snooze: jest.fn(),
    };

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-candidate-queue-empty')).toBeInTheDocument();
    });
    const badge = screen.getByTestId('alt-data-candidate-queue-count');
    expect(badge.textContent).toContain('0');
  });

  test('prefers userMessage when pending list request is rejected', async () => {
    const apis = {
      list: jest.fn().mockRejectedValue(
        Object.assign(new Error('raw backend detail'), {
          userMessage: '候选队列暂时不可用',
        }),
      ),
      refresh: jest.fn(),
      convert: jest.fn(),
      dismiss: jest.fn(),
      snooze: jest.fn(),
    };

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-data-candidate-queue-error')).toHaveTextContent(
        '候选队列暂时不可用',
      );
    });
    expect(screen.queryByText('raw backend detail')).not.toBeInTheDocument();
  });

  test('prefers userMessage when an action is rejected', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);
    apis.convert.mockRejectedValue(
      Object.assign(new Error('HTTP 409'), {
        userMessage: '只能转换待处理候选',
      }),
    );
    const messageApi = { error: jest.fn(), success: jest.fn() };

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={messageApi} />);
    await flushAsync();

    const convertBtn = await screen.findByTestId(
      `alt-data-candidate-convert-${candidates[0].candidate_id}`,
    );
    await act(async () => {
      fireEvent.click(convertBtn);
    });
    await flushAsync();

    expect(messageApi.error).toHaveBeenCalledWith('只能转换待处理候选');
    expect(screen.getByTestId('alt-data-candidate-queue-error')).toHaveTextContent(
      '只能转换待处理候选',
    );
    expect(screen.queryByText('HTTP 409')).not.toBeInTheDocument();
  });

  test('snooze menu exposes one-hour action and calls snooze API', async () => {
    const candidates = buildCandidates();
    const apis = buildApiOverrides(candidates);

    render(<AltDataCandidateQueue apiOverrides={apis} messageApi={null} />);
    await flushAsync();

    const snoozeBtn = await screen.findByTestId(
      `alt-data-candidate-snooze-${candidates[2].candidate_id}`,
    );
    await act(async () => {
      fireEvent.click(snoozeBtn);
      jest.runOnlyPendingTimers();
    });

    const oneHourAction = await screen.findByText('延后 1 小时');
    await act(async () => {
      fireEvent.click(oneHourAction);
    });
    await flushAsync();

    expect(apis.snooze).toHaveBeenCalledWith(candidates[2].candidate_id, 1);
  });
});
