import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/api', () => ({
  __esModule: true,
  getAltSignalDiagnostics: jest.fn(),
}));

import { getAltSignalDiagnostics } from '../../../services/api';
import AltSignalDiagnosticsTile from '../AltSignalDiagnosticsTile';

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

afterEach(() => {
  jest.clearAllMocks();
});

function buildDiagnosticsPayload(overrides = {}) {
  return {
    status: 'ok',
    category: null,
    timeframe: '90d',
    limit: 300,
    half_life_days: 14,
    record_count: 42,
    realized_outcome_count: 6,
    hit_rate_note: '存在已实现 outcome/realized_return 字段时使用真实命中率；否则使用 strength*confidence 阈值作为 proxy hit rate。',
    overall: {
      count: 42,
      avg_strength: 0.34,
      avg_abs_strength: 0.47,
      avg_confidence: 0.72,
      hit_rate: 0.667,
      hit_rate_type: 'realized',
    },
    providers: [
      {
        provider: 'policy_radar',
        count: 12,
        avg_strength: 0.42,
        avg_abs_strength: 0.5,
        avg_confidence: 0.81,
        hit_rate: 0.75,
        hit_rate_type: 'realized',
      },
      {
        provider: 'people_layer',
        count: 8,
        avg_strength: -0.18,
        avg_abs_strength: 0.3,
        avg_confidence: 0.61,
        hit_rate: 0.5,
        hit_rate_type: 'proxy',
      },
    ],
    categories: [
      {
        category: 'policy',
        count: 20,
        avg_strength: 0.38,
        avg_abs_strength: 0.44,
        avg_confidence: 0.74,
        hit_rate: 0.7,
        hit_rate_type: 'realized',
      },
    ],
    decay_curve: [
      { age_days: 0, decay_weight: 1, avg_decayed_signal: 0.31 },
      { age_days: 14, decay_weight: 0.5, avg_decayed_signal: 0.155 },
    ],
    recent_records: [
      {
        record_id: 'r1',
        source: 'policy_radar',
        category: 'policy',
        strength: 0.8,
        confidence: 0.9,
        age_days: 1.2,
        decay_weight: 0.94,
        decayed_strength: 0.6768,
        outcome: true,
        proxy_outcome: true,
      },
    ],
    snapshot_timestamp: '2026-05-16T11:52:00Z',
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('<AltSignalDiagnosticsTile />', () => {
  test('renders backend signal diagnostics summary, providers, decay curve, and recent records', async () => {
    getAltSignalDiagnostics.mockResolvedValueOnce(buildDiagnosticsPayload());

    render(<AltSignalDiagnosticsTile />);
    await flushAsync();

    await waitFor(() => {
      expect(screen.getByTestId('alt-signal-diagnostics-tile')).toBeInTheDocument();
    });

    expect(getAltSignalDiagnostics).toHaveBeenCalledWith({ timeframe: '90d', limit: 300, half_life_days: 14 });
    expect(screen.getByText('信号命中率与衰减诊断')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getAllByText('真实命中').length).toBeGreaterThan(0);
    expect(screen.getByText('6 条真实 outcome')).toBeInTheDocument();

    const providers = screen.getByTestId('alt-signal-diagnostics-provider-table');
    expect(within(providers).getByText('政策雷达')).toBeInTheDocument();
    expect(within(providers).getByText('人的维度')).toBeInTheDocument();
    expect(within(providers).getByText('proxy')).toBeInTheDocument();

    const decay = screen.getByTestId('alt-signal-diagnostics-decay-table');
    expect(within(decay).getByText('14 天')).toBeInTheDocument();
    expect(within(decay).getByText('0.155')).toBeInTheDocument();

    const records = screen.getByTestId('alt-signal-diagnostics-recent-table');
    expect(within(records).getByText('r1')).toBeInTheDocument();
    expect(within(records).getByText('0.677')).toBeInTheDocument();
  });

  test('keeps recent-record table row keys unique when backend returns repeated record ids', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getAltSignalDiagnostics.mockResolvedValueOnce(buildDiagnosticsPayload({
      recent_records: [
        {
          record_id: 'duplicate-record',
          source: 'policy_radar',
          category: 'policy',
          age_days: 1,
          decayed_strength: 0.5,
        },
        {
          record_id: 'duplicate-record',
          source: 'people_layer',
          category: 'people',
          age_days: 2,
          decayed_strength: 0.4,
        },
      ],
    }));

    try {
      render(<AltSignalDiagnosticsTile />);
      await flushAsync();

      const records = await screen.findByTestId('alt-signal-diagnostics-recent-table');
      expect(within(records).getAllByText('duplicate-record')).toHaveLength(2);
      const duplicateKeyWarnings = consoleErrorSpy.mock.calls
        .map((args) => args.join(' '))
        .filter((message) => message.includes('Encountered two children with the same key'));
      expect(duplicateKeyWarnings).toEqual([]);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('keeps provider/category row keys unique when backend returns repeated group names', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getAltSignalDiagnostics.mockResolvedValueOnce(buildDiagnosticsPayload({
      providers: [
        {
          provider: 'policy_radar',
          count: 8,
          avg_strength: 0.31,
          avg_confidence: 0.7,
          hit_rate: 0.62,
          hit_rate_type: 'realized',
        },
        {
          provider: 'policy_radar',
          count: 3,
          avg_strength: 0.22,
          avg_confidence: 0.66,
          hit_rate: 0.5,
          hit_rate_type: 'proxy',
        },
      ],
      categories: [
        {
          category: 'policy',
          count: 6,
          avg_strength: 0.2,
          avg_confidence: 0.64,
          hit_rate: 0.45,
          hit_rate_type: 'realized',
        },
        {
          category: 'policy',
          count: 2,
          avg_strength: 0.15,
          avg_confidence: 0.55,
          hit_rate: 0.4,
          hit_rate_type: 'proxy',
        },
      ],
    }));

    try {
      render(<AltSignalDiagnosticsTile />);
      await flushAsync();

      const providers = await screen.findByTestId('alt-signal-diagnostics-provider-table');
      expect(within(providers).getAllByText('政策雷达')).toHaveLength(2);
      expect(within(providers).getAllByText('政策')).toHaveLength(2);
      const duplicateKeyWarnings = consoleErrorSpy.mock.calls
        .map((args) => args.join(' '))
        .filter((message) => message.includes('Encountered two children with the same key'));
      expect(duplicateKeyWarnings).toEqual([]);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('refresh button refetches with the fixed advanced diagnostics params', async () => {
    getAltSignalDiagnostics
      .mockResolvedValueOnce(buildDiagnosticsPayload({ record_count: 1 }))
      .mockResolvedValueOnce(buildDiagnosticsPayload({ record_count: 2 }));

    render(<AltSignalDiagnosticsTile />);
    await flushAsync();

    await waitFor(() => expect(within(screen.getByTestId('alt-signal-diagnostics-record-count')).getByText('1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('alt-signal-diagnostics-refresh'));
    await flushAsync();

    await waitFor(() => expect(within(screen.getByTestId('alt-signal-diagnostics-record-count')).getByText('2')).toBeInTheDocument());
    expect(getAltSignalDiagnostics).toHaveBeenCalledTimes(2);
    expect(getAltSignalDiagnostics).toHaveBeenLastCalledWith({ timeframe: '90d', limit: 300, half_life_days: 14 });
  });
});
