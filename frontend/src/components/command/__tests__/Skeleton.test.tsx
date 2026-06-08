import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@/components/command/Skeleton';

describe('Skeleton', () => {
  it('renders with given dimensions and a shimmer bar', () => {
    const { container } = render(<Skeleton w={120} h={16} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('120px');
    expect(root.style.height).toBe('16px');
    expect(container.querySelector('.cmd-shimmer-bar')).not.toBeNull();
  });
});
