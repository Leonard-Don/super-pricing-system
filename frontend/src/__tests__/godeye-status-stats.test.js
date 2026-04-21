import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import GodEyeStatusStats from '../components/GodEyeDashboard/GodEyeStatusStats';

describe('GodEyeStatusStats', () => {
  beforeAll(() => {
    const matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
    Object.defineProperty(global, 'matchMedia', {
      writable: true,
      value: matchMedia,
    });
  });

  it('formats snapshot and operational labels in Chinese-friendly copy', () => {
    render(
      <GodEyeStatusStats
        macroScore={0.1384}
        providerCount={5}
        providerHealth={{
          healthy_providers: 5,
          degraded_providers: 0,
          error_providers: 0,
        }}
        refreshing={false}
        schedulerStatus={{ jobs: [{ id: 'job_1' }, { id: 'job_2' }] }}
        snapshotTimestamp="2026-04-21T11:15:10.260886"
        staleness={{ label: 'fresh', max_snapshot_age_seconds: 0 }}
      />
    );

    expect(screen.getByText('2026/04/21')).toBeInTheDocument();
    expect(screen.getByText('11:15:10')).toBeInTheDocument();
    expect(screen.getByText('新鲜')).toBeInTheDocument();
    expect(screen.getByText('降级 0 / 异常 0')).toBeInTheDocument();
    expect(screen.getByText('调度任务 2')).toBeInTheDocument();
  });
});
