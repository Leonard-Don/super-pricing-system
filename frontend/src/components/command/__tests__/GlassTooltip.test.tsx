import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassTooltip } from '@/components/command/GlassTooltip';

describe('GlassTooltip', () => {
  it('renders label and each entry name/value when active', () => {
    render(
      <GlassTooltip active label="2026-06" payload={[{ name: '公允价值', value: 303.59, color: '#f3b85a' }]} />,
    );
    expect(screen.getByText('2026-06')).toBeTruthy();
    expect(screen.getByText('公允价值')).toBeTruthy();
    expect(screen.getByText('303.59')).toBeTruthy();
  });
  it('renders nothing when inactive', () => {
    const { container } = render(<GlassTooltip active={false} label="x" payload={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
