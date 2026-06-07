import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataNumber } from '@/components/command/DataNumber';

describe('DataNumber', () => {
  it('renders the value with tabular-nums + mono', () => {
    render(<DataNumber value="0.1686" />);
    const el = screen.getByText('0.1686');
    expect(el.className).toMatch(/tabular-nums/);
    expect(el.className).toMatch(/font-mono/);
  });

  it('applies the neg tone color class', () => {
    render(<DataNumber value="+144.5%" tone="neg" />);
    expect(screen.getByText('+144.5%').className).toMatch(/text-neg/);
  });

  it('applies the pos tone color class', () => {
    render(<DataNumber value="-27.8%" tone="pos" />);
    expect(screen.getByText('-27.8%').className).toMatch(/text-pos/);
  });
});
