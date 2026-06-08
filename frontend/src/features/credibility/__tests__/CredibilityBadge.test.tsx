import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CredibilityBadge } from '@/features/credibility/components/CredibilityBadge';

describe('CredibilityBadge', () => {
  it('shows accumulating state with sample size when status is insufficient_data', () => {
    render(<CredibilityBadge status="insufficient_data" sampleSize={12} sinceDate="2026-04-01" />);
    expect(screen.getByText(/累积中/)).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
  });

  it('shows since date when accumulating', () => {
    render(<CredibilityBadge status="insufficient_data" sampleSize={5} sinceDate="2026-04-01" />);
    expect(screen.getByText(/2026-04-01/)).toBeTruthy();
  });

  it('shows hit rate when ok', () => {
    render(<CredibilityBadge status="ok" sampleSize={40} sinceDate="2026-01-01" hitRate={0.62} />);
    expect(screen.getByText(/62/)).toBeTruthy();
  });

  it('shows ok badge with sample size disclosure', () => {
    render(<CredibilityBadge status="ok" sampleSize={55} sinceDate="2026-01-01" hitRate={0.71} />);
    expect(screen.getByText(/55/)).toBeTruthy();
  });

  it('handles null sinceDate gracefully', () => {
    render(<CredibilityBadge status="insufficient_data" sampleSize={0} sinceDate={null} />);
    expect(screen.getByText(/累积中/)).toBeTruthy();
  });
});
