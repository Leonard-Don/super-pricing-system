import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartFrame } from '@/features/pricing/components/ChartFrame';

describe('ChartFrame', () => {
  it('renders title and children', () => {
    render(<ChartFrame title="Gap 历史"><div>child</div></ChartFrame>);
    expect(screen.getByText('Gap 历史')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
