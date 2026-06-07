import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '@/components/command/AlertBanner';
import { LiveStatus } from '@/components/command/LiveStatus';

describe('AlertBanner', () => {
  it('renders title, text and score', () => {
    render(<AlertBanner title="结构衰败警报" text="证据已共振" score="61%" />);
    expect(screen.getByText('结构衰败警报')).toBeTruthy();
    expect(screen.getByText('证据已共振')).toBeTruthy();
    expect(screen.getByText('61%')).toBeTruthy();
  });
});

describe('LiveStatus', () => {
  it('renders the online ratio and timestamp', () => {
    render(<LiveStatus online={8} total={8} ts="09:15:49" />);
    expect(screen.getByText(/8\/8/)).toBeTruthy();
    expect(screen.getByText(/09:15:49/)).toBeTruthy();
  });
});
