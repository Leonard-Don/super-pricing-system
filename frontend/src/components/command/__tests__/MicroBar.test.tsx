import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MicroBar } from '@/components/command/MicroBar';

describe('MicroBar', () => {
  it('fills width proportional to value/max', () => {
    const { container } = render(<MicroBar value={0.71} />);
    const fill = container.querySelector('[data-fill]') as HTMLElement;
    expect(fill.style.width).toBe('71%');
  });
  it('clamps to 0..100%', () => {
    const { container } = render(<MicroBar value={5} max={1} />);
    expect((container.querySelector('[data-fill]') as HTMLElement).style.width).toBe('100%');
  });
  it('diverging negative anchors to the center and extends left', () => {
    const { container } = render(<MicroBar value={-0.4} diverging />);
    const fill = container.querySelector('[data-fill]') as HTMLElement;
    expect(fill.dataset.side).toBe('neg');
    expect(fill.style.width).toBe('20%'); // |−0.4| / 2 of half-track => 20%
  });
});
