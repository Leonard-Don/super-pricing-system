import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
