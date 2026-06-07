import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before the import under test
// ---------------------------------------------------------------------------

const mockCreateResearchTask = vi.fn();
const mockAddResearchTaskSnapshot = vi.fn();

vi.mock('@/services/api/research', () => ({
  createResearchTask: (...args: unknown[]) => mockCreateResearchTask(...args),
  addResearchTaskSnapshot: (...args: unknown[]) => mockAddResearchTaskSnapshot(...args),
  getResearchTasks: vi.fn(),
  getResearchTask: vi.fn(),
  updateResearchTask: vi.fn(),
  deleteResearchTask: vi.fn(),
  getResearchTaskTimeline: vi.fn(),
  addResearchTaskComment: vi.fn(),
  deleteResearchTaskComment: vi.fn(),
  reorderResearchBoard: vi.fn(),
  getResearchTaskStats: vi.fn(),
  bulkUpdateResearchTasks: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import usePricingWorkbenchActions from '../usePricingWorkbenchActions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_DATA: Record<string, unknown> = {
  symbol: 'AAPL',
  gap_analysis: {
    gap_pct: 0.05,
    direction: 'undervalued',
    fair_value_mid: 185,
    current_price: 176,
  },
  valuation: {
    fair_value: { low: 175, mid: 185, high: 195, method: 'DCF/Comparable' },
    current_price_source: 'yahoo',
  },
  implications: {
    primary_view: 'undervalued',
    confidence: 'medium',
    risk_level: 'low',
    insights: ['Factor alpha positive', 'DCF supports upside'],
  },
  deviation_drivers: {
    drivers: [{ factor: 'CAPM', description: 'alpha significant' }],
    primary_driver: { factor: 'CAPM', description: 'alpha significant' },
  },
  factor_model: {
    period: '1y',
    capm: { alpha_pct: 2.1, beta: 1.05, r_squared: 0.82 },
    fama_french: { alpha_pct: 1.8, r_squared: 0.87 },
  },
};

const SAMPLE_CONTEXT: Record<string, unknown> = {
  symbol: 'AAPL',
  source: 'manual',
  note: '',
  period: '1y',
};

function makeProps(overrides: Partial<Parameters<typeof usePricingWorkbenchActions>[0]> = {}) {
  return {
    data: SAMPLE_DATA,
    mergedContext: SAMPLE_CONTEXT,
    period: '1y',
    playbook: null,
    onSaveSuccess: undefined,
    onUpdateSnapshotSuccess: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePricingWorkbenchActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveTask', () => {
    it('calls createResearchTask with a payload containing type: "pricing"', async () => {
      mockCreateResearchTask.mockResolvedValueOnce({ id: 'task-123' });

      const { result } = renderHook(() => usePricingWorkbenchActions(makeProps()));

      await act(async () => {
        await result.current.saveTask();
      });

      expect(mockCreateResearchTask).toHaveBeenCalledOnce();
      const [payload] = mockCreateResearchTask.mock.calls[0] as [Record<string, unknown>];
      expect(payload).toMatchObject({ type: 'pricing' });
      expect(typeof payload.title).toBe('string');
      expect(payload.symbol).toBe('AAPL');
    });

    it('sets savedTaskId from the response', async () => {
      mockCreateResearchTask.mockResolvedValueOnce({ id: 'task-abc' });

      const { result } = renderHook(() => usePricingWorkbenchActions(makeProps()));

      await act(async () => {
        await result.current.saveTask();
      });

      expect(result.current.savedTaskId).toBe('task-abc');
    });

    it('sets savingTask to true during the call, false after', async () => {
      let capturedDuringSave = false;
      mockCreateResearchTask.mockImplementationOnce(async () => {
        capturedDuringSave = true;
        return { id: 'task-xyz' };
      });

      const { result } = renderHook(() => usePricingWorkbenchActions(makeProps()));

      await act(async () => {
        await result.current.saveTask();
      });

      expect(capturedDuringSave).toBe(true);
      expect(result.current.savingTask).toBe(false);
    });

    it('does NOT call createResearchTask when data has no symbol', async () => {
      const props = makeProps({ data: { ...SAMPLE_DATA, symbol: undefined }, mergedContext: { ...SAMPLE_CONTEXT, symbol: '' } });
      const { result } = renderHook(() => usePricingWorkbenchActions(props));

      await act(async () => {
        await result.current.saveTask();
      });

      expect(mockCreateResearchTask).not.toHaveBeenCalled();
    });

    it('calls onSaveSuccess callback with the task id', async () => {
      const onSaveSuccess = vi.fn();
      mockCreateResearchTask.mockResolvedValueOnce({ id: 'task-cb' });

      const { result } = renderHook(() =>
        usePricingWorkbenchActions(makeProps({ onSaveSuccess })),
      );

      await act(async () => {
        await result.current.saveTask();
      });

      expect(onSaveSuccess).toHaveBeenCalledWith('task-cb');
    });
  });

  describe('updateSnapshot', () => {
    it('calls addResearchTaskSnapshot with savedTaskId after saveTask', async () => {
      mockCreateResearchTask.mockResolvedValueOnce({ id: 'task-snap' });
      mockAddResearchTaskSnapshot.mockResolvedValueOnce({});

      const { result } = renderHook(() => usePricingWorkbenchActions(makeProps()));

      // First save
      await act(async () => {
        await result.current.saveTask();
      });

      expect(result.current.savedTaskId).toBe('task-snap');

      // Then update snapshot
      await act(async () => {
        await result.current.updateSnapshot();
      });

      expect(mockAddResearchTaskSnapshot).toHaveBeenCalledOnce();
      const [taskId, snapshotPayload] = mockAddResearchTaskSnapshot.mock.calls[0] as [string, Record<string, unknown>];
      expect(taskId).toBe('task-snap');
      expect(snapshotPayload).toHaveProperty('snapshot');
    });

    it('does NOT call addResearchTaskSnapshot when savedTaskId is empty', async () => {
      const { result } = renderHook(() => usePricingWorkbenchActions(makeProps()));
      // savedTaskId is '' at start

      await act(async () => {
        await result.current.updateSnapshot();
      });

      expect(mockAddResearchTaskSnapshot).not.toHaveBeenCalled();
    });

    it('calls onUpdateSnapshotSuccess callback', async () => {
      const onUpdateSnapshotSuccess = vi.fn();
      mockCreateResearchTask.mockResolvedValueOnce({ id: 'task-ucb' });
      mockAddResearchTaskSnapshot.mockResolvedValueOnce({});

      const { result } = renderHook(() =>
        usePricingWorkbenchActions(makeProps({ onUpdateSnapshotSuccess })),
      );

      await act(async () => {
        await result.current.saveTask();
      });
      await act(async () => {
        await result.current.updateSnapshot();
      });

      expect(onUpdateSnapshotSuccess).toHaveBeenCalledWith('task-ucb');
    });
  });
});
