import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkbenchBoard from '../WorkbenchBoard';
import type { WorkbenchBoardProps } from '../WorkbenchBoard';

const makeTask = (id: string, status: string) => ({
  id,
  title: `Task ${id}`,
  type: 'pricing' as const,
  source: 'manual',
  status,
  updated_at: '2026-06-05T10:00:00Z',
  board_order: 0,
});

const tasks = [
  makeTask('t1', 'new'),
  makeTask('t2', 'new'),
  makeTask('t3', 'in_progress'),
  makeTask('t4', 'blocked'),
  makeTask('t5', 'complete'),
  makeTask('t6', 'archived'),
];

const defaultProps: WorkbenchBoardProps = {
  tasks,
  selectedTaskId: null,
  refreshSignalsByTaskId: {},
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  selectedTaskIds: [],
  onBulkSelect: vi.fn(),
  onBulkClear: vi.fn(),
  onBulkStatusChange: vi.fn(),
  onDrop: vi.fn(),
};

describe('WorkbenchBoard', () => {
  it('renders all 4 main status columns', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    expect(screen.getByTestId('board-column-new')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-in_progress')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('board-column-complete')).toBeInTheDocument();
  });

  it('renders the archived section', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    expect(screen.getByTestId('board-archived-section')).toBeInTheDocument();
  });

  it('renders task cards in correct columns', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    const newCol = screen.getByTestId('board-column-new');
    expect(newCol).toHaveTextContent('Task t1');
    expect(newCol).toHaveTextContent('Task t2');

    const inProgressCol = screen.getByTestId('board-column-in_progress');
    expect(inProgressCol).toHaveTextContent('Task t3');

    const blockedCol = screen.getByTestId('board-column-blocked');
    expect(blockedCol).toHaveTextContent('Task t4');

    const completeCol = screen.getByTestId('board-column-complete');
    expect(completeCol).toHaveTextContent('Task t5');
  });

  it('renders archived tasks in the archived section after expanding', async () => {
    render(<WorkbenchBoard {...defaultProps} />);
    // Archived section is collapsed by default; click expand to reveal tasks
    const expandBtn = screen.getByRole('button', { name: /展开/i });
    await userEvent.click(expandBtn);
    const archivedSection = screen.getByTestId('board-archived-section');
    expect(archivedSection).toHaveTextContent('Task t6');
  });

  it('shows column task count in column header', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    const newCol = screen.getByTestId('board-column-new');
    // 2 tasks in 'new'
    expect(newCol).toHaveTextContent('2');
  });

  it('shows empty state when a column has no tasks', () => {
    const tasksNoBlocked = tasks.filter((t) => t.status !== 'blocked');
    render(<WorkbenchBoard {...defaultProps} tasks={tasksNoBlocked} />);
    const blockedCol = screen.getByTestId('board-column-blocked');
    expect(blockedCol).toHaveTextContent(/暂无任务/);
  });

  it('calls onSelect when a task card is clicked', async () => {
    const onSelect = vi.fn();
    render(<WorkbenchBoard {...defaultProps} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('workbench-task-card-t1'));
    expect(onSelect).toHaveBeenCalledWith('t1');
  });

  it('passes selectedTaskId to highlight the correct card', () => {
    render(<WorkbenchBoard {...defaultProps} selectedTaskId="t1" />);
    const selectedCard = screen.getByTestId('workbench-task-card-t1');
    // selected card should have ring-2 highlight class
    expect(selectedCard.className).toMatch(/ring-/);
  });

  // -------------------------------------------------------------------------
  // Bulk selection tests
  // -------------------------------------------------------------------------

  it('renders bulk-select checkbox for each task card', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    // Each card should have a bulk-select checkbox
    expect(screen.getByTestId('bulk-select-t1')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-select-t2')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-select-t3')).toBeInTheDocument();
  });

  it('calls onBulkSelect when a task checkbox is toggled', async () => {
    const onBulkSelect = vi.fn();
    render(<WorkbenchBoard {...defaultProps} onBulkSelect={onBulkSelect} />);
    const checkbox = screen.getByTestId('bulk-select-t1');
    await userEvent.click(checkbox);
    expect(onBulkSelect).toHaveBeenCalledWith('t1');
  });

  it('marks checkbox as checked for tasks in selectedTaskIds', () => {
    render(<WorkbenchBoard {...defaultProps} selectedTaskIds={['t1', 't3']} />);
    const cb1 = screen.getByTestId('bulk-select-t1') as HTMLInputElement;
    const cb2 = screen.getByTestId('bulk-select-t2') as HTMLInputElement;
    const cb3 = screen.getByTestId('bulk-select-t3') as HTMLInputElement;
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(false);
    expect(cb3.checked).toBe(true);
  });

  it('shows bulk-action toolbar when selectedTaskIds is non-empty', () => {
    render(<WorkbenchBoard {...defaultProps} selectedTaskIds={['t1']} />);
    expect(screen.getByTestId('bulk-action-toolbar')).toBeInTheDocument();
  });

  it('does not show bulk-action toolbar when selectedTaskIds is empty', () => {
    render(<WorkbenchBoard {...defaultProps} selectedTaskIds={[]} />);
    expect(screen.queryByTestId('bulk-action-toolbar')).not.toBeInTheDocument();
  });

  it('calls onBulkStatusChange with status "complete" when bulk-complete button clicked', async () => {
    const onBulkStatusChange = vi.fn();
    render(
      <WorkbenchBoard
        {...defaultProps}
        selectedTaskIds={['t1', 't2']}
        onBulkStatusChange={onBulkStatusChange}
      />,
    );
    const btn = screen.getByTestId('bulk-action-complete');
    await userEvent.click(btn);
    expect(onBulkStatusChange).toHaveBeenCalledWith(['t1', 't2'], 'complete');
  });

  it('calls onBulkClear when the bulk-clear button is clicked', async () => {
    const onBulkClear = vi.fn();
    render(
      <WorkbenchBoard
        {...defaultProps}
        selectedTaskIds={['t1']}
        onBulkClear={onBulkClear}
      />,
    );
    const clearBtn = screen.getByTestId('bulk-action-clear');
    await userEvent.click(clearBtn);
    expect(onBulkClear).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Drag-and-drop tests (HTML5 native events)
  // -------------------------------------------------------------------------

  it('makes task card wrappers draggable', () => {
    render(<WorkbenchBoard {...defaultProps} />);
    // The outer draggable wrapper has testid board-card-wrapper-{id}
    const wrapper = screen.getByTestId('board-card-wrapper-t1');
    expect(wrapper).toHaveAttribute('draggable', 'true');
  });

  it('calls onDrop when a card is dropped onto a different column dropzone', () => {
    const onDrop = vi.fn();
    render(<WorkbenchBoard {...defaultProps} onDrop={onDrop} />);

    const cardWrapper = screen.getByTestId('board-card-wrapper-t1');
    const inProgressDropzone = screen.getByTestId('board-column-dropzone-in_progress');

    // Simulate drag start on wrapper for t1 (status=new)
    fireEvent.dragStart(cardWrapper, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    });

    // Simulate dragover on the in_progress dropzone
    fireEvent.dragOver(inProgressDropzone);

    // Simulate drop on the in_progress dropzone
    fireEvent.drop(inProgressDropzone);

    // onDrop should be called with { taskId: 't1', targetStatus: 'in_progress' }
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't1', targetStatus: 'in_progress' }),
    );
  });

  it('does not call onDrop when a card is dropped onto its own column dropzone', () => {
    const onDrop = vi.fn();
    render(<WorkbenchBoard {...defaultProps} onDrop={onDrop} />);

    const cardWrapper = screen.getByTestId('board-card-wrapper-t1');
    const newDropzone = screen.getByTestId('board-column-dropzone-new');

    fireEvent.dragStart(cardWrapper, {
      dataTransfer: { setData: vi.fn(), effectAllowed: 'move' },
    });
    fireEvent.dragOver(newDropzone);
    fireEvent.drop(newDropzone);

    // Should not call onDrop because status didn't change
    expect(onDrop).not.toHaveBeenCalled();
  });
});
