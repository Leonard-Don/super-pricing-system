import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkbenchTaskCard from '../WorkbenchTaskCard';
import type { WorkbenchTaskCardProps } from '../WorkbenchTaskCard';

// Minimal task fixture
const task: WorkbenchTaskCardProps['task'] = {
  id: 'task-1',
  title: 'Test Pricing Task',
  type: 'pricing',
  source: 'manual',
  status: 'new',
  updated_at: '2026-06-05T10:00:00Z',
};

const defaultProps: WorkbenchTaskCardProps = {
  task,
  isSelected: false,
  refreshSignal: null,
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
};

describe('WorkbenchTaskCard', () => {
  it('renders the task title', () => {
    render(<WorkbenchTaskCard {...defaultProps} />);
    expect(screen.getByText('Test Pricing Task')).toBeInTheDocument();
  });

  it('renders a type badge', () => {
    render(<WorkbenchTaskCard {...defaultProps} />);
    expect(screen.getByTestId('task-type-badge-task-1')).toBeInTheDocument();
    expect(screen.getByTestId('task-type-badge-task-1')).toHaveTextContent('pricing');
  });

  it('applies selected highlight class when isSelected=true', () => {
    render(<WorkbenchTaskCard {...defaultProps} isSelected={true} />);
    const card = screen.getByTestId('workbench-task-card-task-1');
    expect(card.className).toMatch(/ring-/);
  });

  it('does not apply selected highlight class when isSelected=false', () => {
    render(<WorkbenchTaskCard {...defaultProps} isSelected={false} />);
    const card = screen.getByTestId('workbench-task-card-task-1');
    expect(card.className).not.toMatch(/ring-2/);
  });

  it('calls onSelect when the card is clicked', async () => {
    const onSelect = vi.fn();
    render(<WorkbenchTaskCard {...defaultProps} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('workbench-task-card-task-1'));
    expect(onSelect).toHaveBeenCalledWith('task-1');
  });

  it('renders a refresh-signal badge when refreshSignal has a refreshLabel', () => {
    const refreshSignal = { refreshLabel: '更新中', severity: 'high' };
    render(<WorkbenchTaskCard {...defaultProps} refreshSignal={refreshSignal} />);
    expect(screen.getByTestId('task-refresh-signal-badge-task-1')).toBeInTheDocument();
    expect(screen.getByTestId('task-refresh-signal-badge-task-1')).toHaveTextContent('更新中');
  });

  it('does not render refresh-signal badge when refreshSignal is null', () => {
    render(<WorkbenchTaskCard {...defaultProps} refreshSignal={null} />);
    expect(screen.queryByTestId('task-refresh-signal-badge-task-1')).not.toBeInTheDocument();
  });

  it('renders a status-change dropdown trigger button', () => {
    render(<WorkbenchTaskCard {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /状态/i }),
    ).toBeInTheDocument();
  });

  it('renders updated_at date text', () => {
    render(<WorkbenchTaskCard {...defaultProps} />);
    // Should display some date text from updated_at
    expect(screen.getByTestId('workbench-task-card-task-1')).toHaveTextContent(/2026/);
  });
});
