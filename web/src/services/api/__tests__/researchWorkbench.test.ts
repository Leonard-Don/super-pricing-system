import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: {} });
const get = vi.fn().mockResolvedValue({ data: {} });
const put = vi.fn().mockResolvedValue({ data: {} });
const del = vi.fn().mockResolvedValue({ data: {} });

vi.mock('@/services/api/core', () => ({
  default: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    delete: (...a: unknown[]) => del(...a),
  },
  withTimeoutProfile: (_p: string, c: object = {}) => c,
  API_TIMEOUT_PROFILES: { analysis: 120000, standard: 30000, dashboard: 45000, default: 300000, workbench: 30000 },
}));

import {
  getResearchTask,
  updateResearchTask,
  getResearchTaskTimeline,
  addResearchTaskComment,
  deleteResearchTaskComment,
  addResearchTaskSnapshot,
  reorderResearchBoard,
  getResearchTaskStats,
  deleteResearchTask,
  bulkUpdateResearchTasks,
} from '@/services/api/research';

describe('research workbench API — task CRUD / snapshot / timeline / comments / stats', () => {
  beforeEach(() => {
    post.mockClear();
    get.mockClear();
    put.mockClear();
    del.mockClear();
  });

  // ---- getResearchTask ----
  it('getResearchTask GETs /research-workbench/tasks/:id', async () => {
    await getResearchTask('task-123');
    expect(get.mock.calls[0][0]).toBe('/research-workbench/tasks/task-123');
  });

  it('getResearchTask encodes special chars in taskId', async () => {
    await getResearchTask('a/b');
    expect(get.mock.calls[0][0]).toBe('/research-workbench/tasks/a%2Fb');
  });

  // ---- updateResearchTask ----
  it('updateResearchTask PUTs to /research-workbench/tasks/:id', async () => {
    await updateResearchTask('task-456', { status: 'in_progress' });
    expect(put.mock.calls[0][0]).toBe('/research-workbench/tasks/task-456');
  });

  it('updateResearchTask sends payload as second arg', async () => {
    const payload = { status: 'complete' as const, title: 'Test' };
    await updateResearchTask('task-456', payload);
    expect(put.mock.calls[0][1]).toEqual(payload);
  });

  // ---- getResearchTaskTimeline ----
  it('getResearchTaskTimeline GETs /research-workbench/tasks/:id/timeline', async () => {
    await getResearchTaskTimeline('task-789');
    expect(get.mock.calls[0][0]).toBe('/research-workbench/tasks/task-789/timeline');
  });

  // ---- addResearchTaskComment ----
  it('addResearchTaskComment POSTs to /research-workbench/tasks/:id/comments', async () => {
    await addResearchTaskComment('task-111', { author: 'user', body: 'hello' });
    expect(post.mock.calls[0][0]).toBe('/research-workbench/tasks/task-111/comments');
  });

  it('addResearchTaskComment sends payload', async () => {
    const payload = { author: 'user', body: 'my comment' };
    await addResearchTaskComment('task-111', payload);
    expect(post.mock.calls[0][1]).toEqual(payload);
  });

  // ---- deleteResearchTaskComment ----
  it('deleteResearchTaskComment DELETEs /research-workbench/tasks/:id/comments/:cid', async () => {
    await deleteResearchTaskComment('task-222', 'cmt-333');
    expect(del.mock.calls[0][0]).toBe('/research-workbench/tasks/task-222/comments/cmt-333');
  });

  // ---- addResearchTaskSnapshot ----
  it('addResearchTaskSnapshot POSTs to /research-workbench/tasks/:id/snapshot', async () => {
    const snapshotPayload = {
      snapshot: { headline: 'h', summary: 's', saved_at: '2026-01-01T00:00:00Z' },
    };
    await addResearchTaskSnapshot('task-444', snapshotPayload);
    expect(post.mock.calls[0][0]).toBe('/research-workbench/tasks/task-444/snapshot');
  });

  it('addResearchTaskSnapshot sends payload', async () => {
    const payload = {
      snapshot: { headline: 'h', summary: 's', saved_at: '2026-01-01T00:00:00Z' },
    };
    await addResearchTaskSnapshot('task-444', payload);
    expect(post.mock.calls[0][1]).toEqual(payload);
  });

  // ---- reorderResearchBoard ----
  it('reorderResearchBoard POSTs to /research-workbench/board/reorder', async () => {
    await reorderResearchBoard({ items: [{ task_id: 'a', status: 'new', board_order: 0 }] });
    expect(post.mock.calls[0][0]).toBe('/research-workbench/board/reorder');
  });

  // ---- getResearchTaskStats ----
  it('getResearchTaskStats GETs /research-workbench/stats', async () => {
    await getResearchTaskStats();
    expect(get.mock.calls[0][0]).toBe('/research-workbench/stats');
  });

  // ---- deleteResearchTask ----
  it('deleteResearchTask DELETEs /research-workbench/tasks/:id', async () => {
    await deleteResearchTask('task-555');
    expect(del.mock.calls[0][0]).toBe('/research-workbench/tasks/task-555');
  });

  // ---- bulkUpdateResearchTasks ----
  it('bulkUpdateResearchTasks POSTs to /research-workbench/tasks/bulk-update', async () => {
    await bulkUpdateResearchTasks({ task_ids: ['a', 'b'], status: 'complete', comment: '', author: 'user' });
    expect(post.mock.calls[0][0]).toBe('/research-workbench/tasks/bulk-update');
  });

  it('bulkUpdateResearchTasks sends payload', async () => {
    const payload = { task_ids: ['a', 'b'], status: 'complete' as const, comment: '', author: 'user' };
    await bulkUpdateResearchTasks(payload);
    expect(post.mock.calls[0][1]).toEqual(payload);
  });
});
