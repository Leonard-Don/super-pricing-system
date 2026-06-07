import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionFrame } from '@/components/command/SectionFrame';

describe('SectionFrame', () => {
  it('renders the title and the ◢ marker', () => {
    render(<SectionFrame title="战场扫描" latin="BATTLEFIELD SCAN" />);
    expect(screen.getByText('战场扫描')).toBeTruthy();
    expect(screen.getByText(/BATTLEFIELD SCAN/)).toBeTruthy();
    expect(screen.getByText(/◢/)).toBeTruthy();
  });
});
