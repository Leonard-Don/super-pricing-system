import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GodEyeStatusStats } from '../GodEyeStatusStats';

describe('GodEyeStatusStats', () => {
  const baseProps = {
    macroScore: 0.1234,
    providerCount: 8,
    providerHealth: { healthy_providers: 7, degraded_providers: 1, error_providers: 0 },
    refreshing: false,
    schedulerStatus: { jobs: ['a', 'b'] },
    snapshotTimestamp: '2024-06-01T10:30:00',
    staleness: { label: 'fresh', max_snapshot_age_seconds: 42 },
  };

  it('renders snapshot date from timestamp', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText('2024/06/01')).toBeDefined();
  });

  it('renders staleness label 新鲜', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText('新鲜')).toBeDefined();
  });

  it('renders max_snapshot_age_seconds', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText(/42.*秒/)).toBeDefined();
  });

  it('renders healthy provider count', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText('7')).toBeDefined();
  });

  it('renders total provider count', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText(/\/\s*8/)).toBeDefined();
  });

  it('renders degraded/error provider info', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText(/降级.*1/)).toBeDefined();
  });

  it('renders macroScore', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText(/0\.1234/)).toBeDefined();
  });

  it('renders scheduler jobs count', () => {
    render(<GodEyeStatusStats {...baseProps} />);
    expect(screen.getByText(/调度任务.*2/)).toBeDefined();
  });

  it('renders 未刷新 when no timestamp', () => {
    render(<GodEyeStatusStats {...baseProps} snapshotTimestamp={undefined} />);
    expect(screen.getByText('未刷新')).toBeDefined();
  });
});
