import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatPanel } from '@/components/command/StatPanel';

describe('StatPanel', () => {
  it('renders label, value and meta', () => {
    render(<StatPanel label="宏观错价分数" value="0.1686" meta="信号偏中性" />);
    expect(screen.getByText('宏观错价分数')).toBeTruthy();
    expect(screen.getByText('0.1686')).toBeTruthy();
    expect(screen.getByText('信号偏中性')).toBeTruthy();
  });

  it('applies the focus styling when focus is set', () => {
    const { container } = render(<StatPanel label="x" value="1" focus />);
    expect(container.querySelector('[data-focus="true"]')).not.toBeNull();
  });
});
