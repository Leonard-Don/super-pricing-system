// Tests for WorkbenchDetailPanel and SelectedTaskRefreshPanel (Task 7).
// TDD approach: written before implementation — will fail until components exist.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import WorkbenchDetailPanel, {
  type WorkbenchDetailPanelProps,
} from '../WorkbenchDetailPanel';
import SelectedTaskRefreshPanel, {
  type SelectedTaskRefreshPanelProps,
} from '../SelectedTaskRefreshPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimalTask = {
  id: 'task-42',
  title: '测试定价任务',
  type: 'pricing',
  source: 'manual',
  status: 'in_progress',
  symbol: 'AAPL',
  template: 'base',
  updated_at: '2026-06-05T08:00:00Z',
  context: { mode: 'dcf' },
  comments: [] as Array<{ id: string; body: string; author: string; created_at: string }>,
};

const minimalTimeline = [
  {
    id: 'tl-1',
    type: 'created',
    meta: {},
    created_at: '2026-06-05T07:00:00Z',
  },
  {
    id: 'tl-2',
    type: 'status_changed',
    meta: { from: 'new', to: 'in_progress' },
    created_at: '2026-06-05T08:00:00Z',
  },
];

// Minimal timelineItems already computed (as passed down from hook)
const minimalTimelineItems = [
  {
    color: 'blue',
    dot: 'clock',
    children: {
      label: '任务创建',
      type: '创建',
      color: 'blue',
      createdAt: '2026-06-05T07:00:00Z',
    },
  },
  {
    color: 'orange',
    dot: 'clock',
    children: {
      label: '状态变更',
      type: '状态',
      color: 'orange',
      changeLabel: 'new→in_progress',
      changeColor: 'gold',
      createdAt: '2026-06-05T08:00:00Z',
    },
  },
];

const defaultProps: WorkbenchDetailPanelProps = {
  selectedTask: minimalTask,
  timeline: minimalTimeline,
  timelineItems: minimalTimelineItems,
  onStatusChange: vi.fn(),
  onAddComment: vi.fn(),
  onDeleteComment: vi.fn(),
  saving: false,
};

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — empty state
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — empty state', () => {
  it('renders empty state when selectedTask is null', () => {
    render(
      <WorkbenchDetailPanel
        {...defaultProps}
        selectedTask={null}
      />,
    );
    expect(screen.getByTestId('workbench-detail-panel')).toBeInTheDocument();
    expect(screen.getByText(/请选择一个研究任务/)).toBeInTheDocument();
  });

  it('does not render task title when selectedTask is null', () => {
    render(
      <WorkbenchDetailPanel
        {...defaultProps}
        selectedTask={null}
      />,
    );
    expect(screen.queryByText('测试定价任务')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — task meta display
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — task meta display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders task title', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByText('测试定价任务')).toBeInTheDocument();
  });

  it('renders task type badge', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('detail-type-badge')).toBeInTheDocument();
    expect(screen.getByTestId('detail-type-badge')).toHaveTextContent('pricing');
  });

  it('renders task status badge', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('detail-status-badge')).toBeInTheDocument();
    expect(screen.getByTestId('detail-status-badge')).toHaveTextContent('in_progress');
  });

  it('renders symbol when present', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('detail-symbol-badge')).toBeInTheDocument();
    expect(screen.getByTestId('detail-symbol-badge')).toHaveTextContent('AAPL');
  });

  it('renders the panel wrapper with correct data-testid', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('workbench-detail-panel')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — timeline display
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — timeline', () => {
  it('renders timeline events', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByText('任务创建')).toBeInTheDocument();
    expect(screen.getByText('状态变更')).toBeInTheDocument();
  });

  it('renders empty-timeline state when timeline is empty', () => {
    render(
      <WorkbenchDetailPanel
        {...defaultProps}
        timeline={[]}
        timelineItems={[]}
      />,
    );
    expect(screen.getByText(/暂无时间线事件/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — comment operations
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — comments', () => {
  it('renders comment input and submit button', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('comment-input')).toBeInTheDocument();
    expect(screen.getByTestId('add-comment-button')).toBeInTheDocument();
  });

  it('add-comment button is disabled when input is empty', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('add-comment-button')).toBeDisabled();
  });

  it('calls onAddComment with the typed text when submitted', async () => {
    const onAddComment = vi.fn();
    render(<WorkbenchDetailPanel {...defaultProps} onAddComment={onAddComment} />);
    await userEvent.type(screen.getByTestId('comment-input'), '很好的发现');
    await userEvent.click(screen.getByTestId('add-comment-button'));
    expect(onAddComment).toHaveBeenCalledWith('很好的发现');
  });

  it('renders existing comments list', () => {
    const taskWithComments = {
      ...minimalTask,
      comments: [
        {
          id: 'c1',
          body: '第一条评论内容',
          author: 'alice',
          created_at: '2026-06-05T09:00:00Z',
        },
      ],
    };
    render(<WorkbenchDetailPanel {...defaultProps} selectedTask={taskWithComments} />);
    expect(screen.getByText('第一条评论内容')).toBeInTheDocument();
  });

  it('calls onDeleteComment when delete is clicked on a comment', async () => {
    const onDeleteComment = vi.fn();
    const taskWithComments = {
      ...minimalTask,
      comments: [
        {
          id: 'c1',
          body: '可以删除的评论',
          author: 'bob',
          created_at: '2026-06-05T09:30:00Z',
        },
      ],
    };
    render(
      <WorkbenchDetailPanel
        {...defaultProps}
        selectedTask={taskWithComments}
        onDeleteComment={onDeleteComment}
      />,
    );
    await userEvent.click(screen.getByTestId('delete-comment-c1'));
    expect(onDeleteComment).toHaveBeenCalledWith('c1');
  });
});

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — status change
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — status change', () => {
  it('renders status-change buttons', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    expect(screen.getByTestId('status-btn-new')).toBeInTheDocument();
    expect(screen.getByTestId('status-btn-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('status-btn-complete')).toBeInTheDocument();
    expect(screen.getByTestId('status-btn-archived')).toBeInTheDocument();
  });

  it('calls onStatusChange with "complete" when complete button is clicked', async () => {
    const onStatusChange = vi.fn();
    render(<WorkbenchDetailPanel {...defaultProps} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByTestId('status-btn-complete'));
    expect(onStatusChange).toHaveBeenCalledWith('complete');
  });

  it('renders restore button for archived task', () => {
    const archivedTask = { ...minimalTask, status: 'archived' };
    render(<WorkbenchDetailPanel {...defaultProps} selectedTask={archivedTask} />);
    expect(screen.getByTestId('status-btn-restore')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// WorkbenchDetailPanel — snapshot placeholder slot
// ---------------------------------------------------------------------------

describe('WorkbenchDetailPanel — snapshot placeholder', () => {
  it('renders the snapshot slot placeholder', () => {
    render(<WorkbenchDetailPanel {...defaultProps} />);
    // Task 8 will plug into this slot; for now just assert the placeholder exists
    expect(screen.getByTestId('snapshot-slot')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SelectedTaskRefreshPanel
// ---------------------------------------------------------------------------

describe('SelectedTaskRefreshPanel', () => {
  it('renders the no-signal fallback text when signal is null', () => {
    const props: SelectedTaskRefreshPanelProps = { priorityMeta: null };
    render(<SelectedTaskRefreshPanel {...props} />);
    expect(screen.getByTestId('refresh-panel')).toBeInTheDocument();
    expect(screen.getByText(/还没有足够的输入快照/)).toBeInTheDocument();
  });

  it('renders recommendation when signal is present', () => {
    const props: SelectedTaskRefreshPanelProps = {
      priorityMeta: {
        refreshLabel: '建议更新',
        refreshTone: 'red',
        recommendation: '请重新打开研究页进行复核',
        summary: '宏观分数漂移超过阈值',
        resonanceDriven: false,
      },
    };
    render(<SelectedTaskRefreshPanel {...props} />);
    expect(screen.getByText('请重新打开研究页进行复核')).toBeInTheDocument();
    expect(screen.getByText('宏观分数漂移超过阈值')).toBeInTheDocument();
  });

  it('renders resonance badge when resonanceDriven is true', () => {
    const props: SelectedTaskRefreshPanelProps = {
      priorityMeta: {
        refreshLabel: '建议更新',
        refreshTone: 'red',
        recommendation: '共振驱动更新建议',
        summary: '多维度共振',
        resonanceDriven: true,
      },
    };
    render(<SelectedTaskRefreshPanel {...props} />);
    expect(screen.getByTestId('refresh-badge-resonance')).toBeInTheDocument();
  });

  it('renders refreshLabel badge', () => {
    const props: SelectedTaskRefreshPanelProps = {
      priorityMeta: {
        refreshLabel: '建议更新',
        refreshTone: 'orange',
        recommendation: '推荐操作',
        summary: '摘要',
      },
    };
    render(<SelectedTaskRefreshPanel {...props} />);
    expect(screen.getByTestId('refresh-label-badge')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-label-badge')).toHaveTextContent('建议更新');
  });
});
