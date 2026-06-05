import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock API modules BEFORE importing the hook
// ---------------------------------------------------------------------------

const mockGetResearchTasks = vi.fn();
const mockGetResearchTaskStats = vi.fn();
const mockGetResearchTask = vi.fn();
const mockGetResearchTaskTimeline = vi.fn();
const mockUpdateResearchTask = vi.fn();
const mockAddResearchTaskComment = vi.fn();
const mockDeleteResearchTaskComment = vi.fn();

vi.mock('@/services/api/research', () => ({
  getResearchTasks: (...args: unknown[]) => mockGetResearchTasks(...args),
  getResearchTaskStats: (...args: unknown[]) => mockGetResearchTaskStats(...args),
  getResearchTask: (...args: unknown[]) => mockGetResearchTask(...args),
  getResearchTaskTimeline: (...args: unknown[]) => mockGetResearchTaskTimeline(...args),
  updateResearchTask: (...args: unknown[]) => mockUpdateResearchTask(...args),
  addResearchTaskComment: (...args: unknown[]) => mockAddResearchTaskComment(...args),
  deleteResearchTaskComment: (...args: unknown[]) => mockDeleteResearchTaskComment(...args),
  createResearchTask: vi.fn(),
  deleteResearchTask: vi.fn(),
  addResearchTaskSnapshot: vi.fn(),
  reorderResearchBoard: vi.fn(),
  bulkUpdateResearchTasks: vi.fn(),
}));

const mockGetMacroOverview = vi.fn();
const mockGetAltDataSnapshot = vi.fn();

vi.mock('@/services/api/altDataAndMacro', () => ({
  getMacroOverview: (...args: unknown[]) => mockGetMacroOverview(...args),
  getAltDataSnapshot: (...args: unknown[]) => mockGetAltDataSnapshot(...args),
  getAltDataStatus: vi.fn(),
  refreshAltData: vi.fn(),
  getAltDataHistory: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import hook after mocks are wired
// ---------------------------------------------------------------------------

import useResearchWorkbenchData from '../useResearchWorkbenchData';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  title: 'Pricing Task',
  symbol: 'AAPL',
  type: 'pricing',
  source: 'godeye',
  status: 'new',
  board_order: 0,
  updated_at: '2026-06-05T08:00:00Z',
  created_at: '2026-06-05T07:00:00Z',
  snapshot: null,
  ...overrides,
});

const defaultTasksResponse = { data: [makeTask()] };
const defaultStatsResponse = { data: { total: 1 } };
const defaultMacroOverview = { macro_score: 0.5 };
const defaultAltSnapshot = { alt_score: 0.3 };

const defaultTaskDetail = {
  data: {
    id: 'task-1',
    title: 'Pricing Task',
    symbol: 'AAPL',
    type: 'pricing',
    source: 'godeye',
    status: 'new',
    notes: 'some notes',
  },
};

const defaultTimeline = { data: [{ id: 'tl-1', type: 'status_change', at: '2026-06-05T07:30:00Z' }] };

beforeEach(() => {
  // Reset all mocks
  mockGetResearchTasks.mockReset();
  mockGetResearchTaskStats.mockReset();
  mockGetResearchTask.mockReset();
  mockGetResearchTaskTimeline.mockReset();
  mockUpdateResearchTask.mockReset();
  mockAddResearchTaskComment.mockReset();
  mockDeleteResearchTaskComment.mockReset();
  mockGetMacroOverview.mockReset();
  mockGetAltDataSnapshot.mockReset();

  // Default resolved values
  mockGetResearchTasks.mockResolvedValue(defaultTasksResponse);
  mockGetResearchTaskStats.mockResolvedValue(defaultStatsResponse);
  mockGetResearchTask.mockResolvedValue(defaultTaskDetail);
  mockGetResearchTaskTimeline.mockResolvedValue(defaultTimeline);
  mockGetMacroOverview.mockResolvedValue(defaultMacroOverview);
  mockGetAltDataSnapshot.mockResolvedValue(defaultAltSnapshot);
});

describe('useResearchWorkbenchData', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useResearchWorkbenchData());
    expect(result.current.loading).toBe(true);
  });

  it('loading converges to false after board load', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
  });

  it('exposes tasks after successful load', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe('task-1');
  });

  it('exposes stats after successful load', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.stats).toEqual({ total: 1 });
  });

  it('exposes boardColumns grouped by status', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const newCol = result.current.boardColumns.find((c) => c.status === 'new');
    expect(newCol).toBeDefined();
    expect(newCol?.tasks).toHaveLength(1);
  });

  it('selecting a task loads its detail and timeline', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    // Let initial load finish
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // The hook auto-selects the first task — detail load should have fired
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.selectedTaskId).toBe('task-1');
    expect(mockGetResearchTask).toHaveBeenCalledWith('task-1');
    expect(mockGetResearchTaskTimeline).toHaveBeenCalledWith('task-1');
    expect(result.current.selectedTask).not.toBeNull();
    expect(result.current.timeline).toHaveLength(1);
  });

  it('setSelectedTaskId triggers detail load for the new task', async () => {
    const task2 = makeTask({ id: 'task-2', title: 'Task 2', status: 'in_progress' });
    mockGetResearchTasks.mockResolvedValue({ data: [makeTask(), task2] });
    mockGetResearchTask.mockResolvedValue(defaultTaskDetail);
    mockGetResearchTaskTimeline.mockResolvedValue(defaultTimeline);

    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Select task-2 explicitly
    await act(async () => {
      result.current.setSelectedTaskId('task-2');
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockGetResearchTask).toHaveBeenCalledWith('task-2');
    expect(mockGetResearchTaskTimeline).toHaveBeenCalledWith('task-2');
  });

  it('setFilters updates the filters state', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.setFilters((prev) => ({ ...prev, type: 'pricing' }));
    });

    expect(result.current.filters.type).toBe('pricing');
  });

  it('type filter narrows filteredTasks', async () => {
    const tasks = [
      makeTask({ id: 'task-1', type: 'pricing' }),
      makeTask({ id: 'task-2', type: 'cross_market' }),
    ];
    mockGetResearchTasks.mockResolvedValue({ data: tasks });

    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.setFilters((prev) => ({ ...prev, type: 'pricing' }));
    });

    expect(result.current.filteredTasks.every((t) => t.type === 'pricing')).toBe(true);
  });

  it('manual refresh re-calls API', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetResearchTasks.mock.calls.length;

    await act(async () => {
      await result.current.loadWorkbench({ trigger: 'manual' });
    });

    expect(mockGetResearchTasks.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('updateTaskStatus calls updateResearchTask', async () => {
    mockUpdateResearchTask.mockResolvedValue({ data: { id: 'task-1', status: 'complete' } });

    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.updateTaskStatus('task-1', 'complete');
    });

    expect(mockUpdateResearchTask).toHaveBeenCalledWith('task-1', { status: 'complete' });
  });

  it('addComment calls addResearchTaskComment', async () => {
    mockAddResearchTaskComment.mockResolvedValue({ data: { id: 'c-1', text: 'hello' } });

    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.addComment('task-1', 'hello');
    });

    // The generated API schema uses { author, body } — our hook maps the simple
    // `text` argument to the correct wire format.
    expect(mockAddResearchTaskComment).toHaveBeenCalledWith('task-1', {
      author: 'local',
      body: 'hello',
    });
  });

  it('deleteComment calls deleteResearchTaskComment', async () => {
    mockDeleteResearchTaskComment.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.deleteComment('task-1', 'c-1');
    });

    expect(mockDeleteResearchTaskComment).toHaveBeenCalledWith('task-1', 'c-1');
  });

  it('refreshSignals is an object with byTaskId and prioritized', async () => {
    const { result } = renderHook(() => useResearchWorkbenchData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.refreshSignals).toHaveProperty('byTaskId');
    expect(result.current.refreshSignals).toHaveProperty('prioritized');
  });
});
