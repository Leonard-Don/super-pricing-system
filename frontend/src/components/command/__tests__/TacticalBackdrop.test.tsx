import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TacticalBackdrop } from '@/components/command/TacticalBackdrop';

describe('TacticalBackdrop', () => {
  it('renders a grid layer by default', () => {
    const { container } = render(<TacticalBackdrop />);
    expect(container.querySelector('[data-layer="grid"]')).not.toBeNull();
  });
  it('renders the radar layer when radar is enabled', () => {
    const { container } = render(<TacticalBackdrop radar />);
    expect(container.querySelector('[data-layer="radar"]')).not.toBeNull();
    expect(container.querySelector('.cmd-radar-sweep')).not.toBeNull();
  });
  it('omits the grid when grid={false}', () => {
    const { container } = render(<TacticalBackdrop grid={false} radar />);
    expect(container.querySelector('[data-layer="grid"]')).toBeNull();
  });
});
