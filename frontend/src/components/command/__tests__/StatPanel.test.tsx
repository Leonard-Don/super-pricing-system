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

  it('preserves an explicit caller tone even when focused (sign cue not lost)', () => {
    // Regression: a focused GAP card with tone="neg" must stay red, not amber.
    render(<StatPanel label="偏差幅度" value="+144.5%" focus tone="neg" />);
    const el = screen.getByText('+144.5%');
    expect(el.className).toMatch(/text-neg/);
    expect(el.className).not.toMatch(/text-primary/);
  });

  it('falls back to amber for a focused default-tone value', () => {
    render(<StatPanel label="错价分数" value="0.17" focus />);
    expect(screen.getByText('0.17').className).toMatch(/text-primary/);
  });
});
