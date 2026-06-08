import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '@/components/command/Sparkline';

describe('Sparkline', () => {
  it('renders an svg polyline with one point per value', () => {
    const { container } = render(<Sparkline points={[1, 3, 2, 5]} />);
    const poly = container.querySelector('polyline') as SVGPolylineElement;
    expect(poly).not.toBeNull();
    expect(poly.getAttribute('points')!.trim().split(/\s+/).length).toBe(4);
  });
  it('renders nothing meaningful for <2 points', () => {
    const { container } = render(<Sparkline points={[1]} />);
    expect(container.querySelector('polyline')).toBeNull();
  });
});
