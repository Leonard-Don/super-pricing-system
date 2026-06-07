import { describe, it, expect } from 'vitest';
import { filterWorkbenchTasks } from '../workbenchSelectors';

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  title: 'Test Task',
  symbol: 'AAPL',
  type: 'pricing',
  source: 'godeye',
  status: 'new',
  note: '',
  template: '',
  snapshot: null,
  timeline: [],
  ...overrides,
});

const emptyFilters = {
  type: '',
  source: '',
  refresh: '',
  reason: '',
  snapshotView: '',
  snapshotFingerprint: '',
  snapshotSummary: '',
  keyword: '',
};

describe('filterWorkbenchTasks', () => {
  it('returns all tasks when no filters are active', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    const result = filterWorkbenchTasks(tasks, emptyFilters, {});
    expect(result).toHaveLength(2);
  });

  it('filters by type', () => {
    const tasks = [
      makeTask({ id: 'a', type: 'pricing' }),
      makeTask({ id: 'b', type: 'cross_market' }),
    ];
    const result = filterWorkbenchTasks(tasks, { ...emptyFilters, type: 'pricing' }, {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('filters by source', () => {
    const tasks = [
      makeTask({ id: 'a', source: 'godeye' }),
      makeTask({ id: 'b', source: 'manual' }),
    ];
    const result = filterWorkbenchTasks(tasks, { ...emptyFilters, source: 'manual' }, {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('filters by refresh severity via refreshSignalsByTaskId', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
    ];
    const signals = {
      'a': { severity: 'high' },
      'b': { severity: 'low' },
    };
    const result = filterWorkbenchTasks(tasks, { ...emptyFilters, refresh: 'high' }, signals);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('filters by keyword on title', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'AAPL pricing analysis', symbol: 'AAPL' }),
      makeTask({ id: 'b', title: 'TSLA cross market', symbol: 'TSLA' }),
    ];
    const result = filterWorkbenchTasks(tasks, { ...emptyFilters, keyword: 'aapl' }, {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns empty array when no tasks match', () => {
    const tasks = [makeTask({ id: 'a', type: 'pricing' })];
    const result = filterWorkbenchTasks(tasks, { ...emptyFilters, type: 'cross_market' }, {});
    expect(result).toHaveLength(0);
  });

  it('handles empty tasks array', () => {
    const result = filterWorkbenchTasks([], emptyFilters, {});
    expect(result).toHaveLength(0);
  });
});
