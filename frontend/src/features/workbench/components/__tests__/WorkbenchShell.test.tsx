import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkbenchShell from '../WorkbenchShell';

const defaultProps = {
  heroMetrics: [
    { label: '总任务', value: 12 },
    { label: '阻塞数', value: 5 },
  ],
  contextItems: [
    { title: '当前类型', detail: 'Pricing' },
    { title: '当前状态', detail: '进行中' },
  ],
  onCopyViewLink: vi.fn(),
};

describe('WorkbenchShell', () => {
  it('renders the page title', () => {
    render(<WorkbenchShell {...defaultProps} />);
    expect(screen.getByText('研究工作台')).toBeInTheDocument();
  });

  it('renders hero metric labels and values', () => {
    render(<WorkbenchShell {...defaultProps} />);
    expect(screen.getByText('总任务')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('阻塞数')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders context items', () => {
    render(<WorkbenchShell {...defaultProps} />);
    expect(screen.getByText('当前类型')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('当前状态')).toBeInTheDocument();
  });

  it('calls onCopyViewLink when copy-link button is clicked', async () => {
    const onCopyViewLink = vi.fn();
    render(<WorkbenchShell {...defaultProps} onCopyViewLink={onCopyViewLink} />);
    const btn = screen.getByRole('button', { name: /复制.*视图链接/i });
    await userEvent.click(btn);
    expect(onCopyViewLink).toHaveBeenCalledOnce();
  });

  it('renders children', () => {
    render(
      <WorkbenchShell {...defaultProps}>
        <div data-testid="child-content">子内容</div>
      </WorkbenchShell>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders missingTaskNotice when provided', () => {
    render(
      <WorkbenchShell
        {...defaultProps}
        missingTaskNotice={{ message: '任务不存在', taskId: 'tid-1' }}
      />,
    );
    expect(screen.getByText(/任务不存在/)).toBeInTheDocument();
  });

  it('does not render missing-task notice when not provided', () => {
    render(<WorkbenchShell {...defaultProps} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
