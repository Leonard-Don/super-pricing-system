// WorkbenchPage.test.tsx — TDD for Task 9.
// Written BEFORE implementation; should fail until WorkbenchPage is assembled.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mock the data hook — isolates WorkbenchPage from API calls
// ---------------------------------------------------------------------------

vi.mock('@/features/workbench/hooks/useResearchWorkbenchData', () => ({
  default: vi.fn(),
}));

import useResearchWorkbenchData from '@/features/workbench/hooks/useResearchWorkbenchData';
import WorkbenchPage from '../WorkbenchPage';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const EMPTY_REFRESH_STATS = {
  high: 0,
  medium: 0,
  low: 0,
  resonance: 0,
  biasQualityCore: 0,
  selectionQualityActive: 0,
  reviewContext: 0,
  structuralDecayRadar: 0,
  priorityNew: 0,
  priorityEscalated: 0,
  peopleLayer: 0,
  departmentChaos: 0,
  selectionQuality: 0,
  snapshotViewFiltered: 0,
  snapshotViewScoped: 0,
};

const EMPTY_FILTERS = {
  type: '',
  source: '',
  refresh: '',
  reason: '',
  snapshotView: '',
  snapshotFingerprint: '',
  snapshotSummary: '',
  keyword: '',
};

const EMPTY_REFRESH_SIGNALS = {
  prioritized: [],
  byTaskId: {},
  byTemplateId: {},
};

const EMPTY_BOARD_COLUMNS = [
  { status: 'new', title: '新建', tasks: [] },
  { status: 'in_progress', title: '研究中', tasks: [] },
  { status: 'blocked', title: '阻塞', tasks: [] },
  { status: 'complete', title: '完成', tasks: [] },
];

const BASE_HOOK_RETURN = {
  // board
  tasks: [],
  filteredTasks: [],
  boardColumns: EMPTY_BOARD_COLUMNS,
  archivedTasks: [],
  stats: null,
  setTasks: vi.fn(),

  // filters
  filters: EMPTY_FILTERS,
  setFilters: vi.fn(),
  sourceOptions: [{ label: '全部来源', value: '' }],
  snapshotSummaryOptions: [],

  // selected task
  selectedTaskId: '',
  setSelectedTaskId: vi.fn(),
  selectedTask: null,
  detailLoading: false,
  timeline: [],
  timelineItems: [],
  missingTaskNotice: null,

  // loading
  loading: false,

  // refresh
  refreshSignals: EMPTY_REFRESH_SIGNALS,
  refreshStats: EMPTY_REFRESH_STATS,
  refreshCurrentTask: vi.fn(),
  loadWorkbench: vi.fn(),
  loadTaskDetail: vi.fn(),
  autoRefreshSummary: {
    enabled: true,
    intervalMs: 300000,
    intervalLabel: '5 分钟',
    intervalOptions: [],
    lastRefreshAt: '',
    lastRefreshLabel: '等待首次刷新',
    lastRefreshTrigger: 'initial',
    lastRefreshTriggerLabel: '首次载入',
    lastAutoRefreshAt: '',
    lastAutoRefreshLabel: '',
    nextRefreshAt: '',
    nextRefreshLabel: '自动刷新已暂停',
    runCount: 0,
    documentVisible: true,
    isRefreshing: false,
    statusLabel: '5 分钟 自动刷新中',
  },
  setAutoRefreshEnabled: vi.fn(),
  setAutoRefreshIntervalMs: vi.fn(),

  // morning preset
  applyMorningPreset: vi.fn(),
  morningPresetActive: false,
  morningPresetCandidate: null,
  morningPresetSummary: null,

  // UI toggles
  showAllTimeline: false,
  setShowAllTimeline: vi.fn(),
  showArchived: false,
  setShowArchived: vi.fn(),

  // mutations
  updateTaskStatus: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),

  // task intelligence (from useSelectedTaskIntelligence spread)
  selectedTaskRefreshSignal: null,
  openTaskPriorityLabel: '' as string,
  openTaskPriorityNote: '' as string,
  selectedTaskPriorityMeta: null,
  selectedTaskPriorityEventPayload: null,
  latestSnapshotComparison: null,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const mockHook = vi.mocked(useResearchWorkbenchData);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkbenchPage', () => {
  // ── 1. Loading state ──────────────────────────────────────────────────────

  it('renders skeleton while loading (no data)', () => {
    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: true,
      tasks: [],
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // Should show a skeleton element, not the board
    expect(screen.getByTestId('workbench-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-board')).not.toBeInTheDocument();
  });

  // ── 2. Board renders with data ────────────────────────────────────────────

  it('renders the workbench board columns when tasks are present', () => {
    const tasks = [
      { id: 't1', title: 'Task Alpha', type: 'pricing', source: 'manual', status: 'new', updated_at: '2026-06-05T10:00:00Z' },
      { id: 't2', title: 'Task Beta', type: 'pricing', source: 'manual', status: 'in_progress', updated_at: '2026-06-05T10:00:00Z' },
    ];

    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      tasks,
      filteredTasks: tasks,
      boardColumns: [
        { status: 'new', title: '新建', tasks: [tasks[0]] },
        { status: 'in_progress', title: '研究中', tasks: [tasks[1]] },
        { status: 'blocked', title: '阻塞', tasks: [] },
        { status: 'complete', title: '完成', tasks: [] },
      ],
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // Board columns should be visible
    expect(screen.getByTestId('board-column-new')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-complete')).toBeInTheDocument();

    // Task cards should appear in correct columns
    expect(screen.getByTestId('board-column-new')).toHaveTextContent('Task Alpha');
    expect(screen.getByTestId('board-column-in_progress')).toHaveTextContent('Task Beta');
  });

  // ── 3. Detail panel shows when task is selected ───────────────────────────

  it('shows detail panel when a task is selected', () => {
    const selectedTask = {
      id: 't1',
      title: 'Task Alpha',
      type: 'pricing',
      source: 'manual',
      status: 'new',
      updated_at: '2026-06-05T10:00:00Z',
      comments: [],
    };

    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      tasks: [selectedTask],
      filteredTasks: [selectedTask],
      boardColumns: [
        { status: 'new', title: '新建', tasks: [selectedTask] },
        { status: 'in_progress', title: '研究中', tasks: [] },
        { status: 'blocked', title: '阻塞', tasks: [] },
        { status: 'complete', title: '完成', tasks: [] },
      ],
      selectedTaskId: 't1',
      selectedTask,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    expect(screen.getByTestId('workbench-detail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-detail-panel')).toHaveTextContent('Task Alpha');
  });

  // ── 4. Empty state / no tasks ────────────────────────────────────────────

  it('renders board with empty columns when tasks array is empty (loaded)', () => {
    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      tasks: [],
      filteredTasks: [],
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // Board should render (with empty columns) — not skeleton
    expect(screen.queryByTestId('workbench-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-column-new')).toBeInTheDocument();
  });

  // ── 5. Shell (page chrome) renders ──────────────────────────────────────

  it('renders the workbench shell (page chrome)', () => {
    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // WorkbenchShell renders data-testid="workbench-page"
    expect(screen.getByTestId('workbench-page')).toBeInTheDocument();
  });

  // ── 6. Filters render ────────────────────────────────────────────────────

  it('renders the filters strip', () => {
    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    expect(screen.getByTestId('workbench-filters')).toBeInTheDocument();
  });

  // ── 7. Detail panel empty state when no task selected ────────────────────

  it('shows detail panel empty state when no task is selected', () => {
    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      tasks: [{ id: 't1', title: 'Task Alpha', type: 'pricing', source: 'manual', status: 'new' }],
      filteredTasks: [{ id: 't1', title: 'Task Alpha', type: 'pricing', source: 'manual', status: 'new' }],
      boardColumns: [
        { status: 'new', title: '新建', tasks: [{ id: 't1', title: 'Task Alpha', type: 'pricing', source: 'manual', status: 'new' }] },
        { status: 'in_progress', title: '研究中', tasks: [] },
        { status: 'blocked', title: '阻塞', tasks: [] },
        { status: 'complete', title: '完成', tasks: [] },
      ],
      selectedTaskId: '',
      selectedTask: null,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // Detail panel renders but shows empty-state message
    expect(screen.getByTestId('workbench-detail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-detail-panel')).toHaveTextContent('请选择一个研究任务');
  });

  // ── 8. Snapshot comparison slot filled when latestSnapshotComparison ─────

  it('renders snapshot compare panel when latestSnapshotComparison is present', () => {
    const selectedTask = {
      id: 't1',
      title: 'Task With Snapshot',
      type: 'pricing',
      source: 'manual',
      status: 'in_progress',
      updated_at: '2026-06-05T10:00:00Z',
      comments: [],
    };

    const snapshotComparison = {
      rows: [
        { label: '公允价值', left: '100.00', right: '110.00', delta: '+10.00%' },
      ],
      summary: ['↑ 价值重估'],
    };

    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      tasks: [selectedTask],
      filteredTasks: [selectedTask],
      boardColumns: [
        { status: 'new', title: '新建', tasks: [] },
        { status: 'in_progress', title: '研究中', tasks: [selectedTask] },
        { status: 'blocked', title: '阻塞', tasks: [] },
        { status: 'complete', title: '完成', tasks: [] },
      ],
      selectedTaskId: 't1',
      selectedTask,
      latestSnapshotComparison: snapshotComparison,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    // The snapshot compare panel should appear inside the snapshot-slot
    expect(screen.getByTestId('workbench-snapshot-compare')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-slot')).toBeInTheDocument();
  });

  // ── 9. Manual refresh button ──────────────────────────────────────────────

  it('calls refreshCurrentTask when refresh button is clicked', async () => {
    const refreshCurrentTask = vi.fn().mockResolvedValue(true);

    mockHook.mockReturnValue({
      ...BASE_HOOK_RETURN,
      loading: false,
      refreshCurrentTask,
    } as unknown as ReturnType<typeof useResearchWorkbenchData>);

    render(<WorkbenchPage />);

    const refreshBtn = screen.getByTestId('manual-refresh-btn');
    await userEvent.click(refreshBtn);

    expect(refreshCurrentTask).toHaveBeenCalledOnce();
  });
});
