import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GlowBars } from '@/components/command/GlowBars';

describe('GlowBars', () => {
  it('renders one bar per value', () => {
    const { container } = render(<GlowBars bars={[{ h: 40 }, { h: 80, accent: 'blue' }, { h: 100 }]} />);
    expect(container.querySelectorAll('[data-bar]').length).toBe(3);
  });
});
