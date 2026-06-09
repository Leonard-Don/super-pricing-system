import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketIndicatorHealthPanel } from '../MarketIndicatorHealthPanel';

const INDICATOR_HEALTH = {
  vix: { value: 18.5, source_health: 'ok' as const, checked_at: '2026-06-09T10:00:00' },
  dxy: { value: 104.2, source_health: 'ok' as const, checked_at: '2026-06-09T10:00:00' },
  '10y_yield': { value: 4.5, source_health: 'stale' as const, checked_at: '2026-06-09T08:00:00' },
  gold: { value: null, source_health: 'failed' as const, checked_at: '2026-06-09T10:00:00' },
  oil: { value: 78.3, source_health: 'ok' as const, checked_at: '2026-06-09T10:00:00' },
  sp500: { value: 5200.0, source_health: 'ok' as const, checked_at: '2026-06-09T10:00:00' },
};

const INDICATOR_META = {
  fetched_at: '2026-06-09T10:00:00',
  ok_count: 4,
  failed_count: 1,
  cache_status: 'fresh' as const,
};

describe('MarketIndicatorHealthPanel', () => {
  it('renders nothing when both props absent (backward-compat)', () => {
    const { container } = render(
      <MarketIndicatorHealthPanel indicatorHealth={null} indicatorMeta={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when both props undefined', () => {
    const { container } = render(<MarketIndicatorHealthPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders panel when indicatorHealth provided', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-health-panel')).toBeDefined();
  });

  it('renders each indicator entry', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-entry-vix')).toBeDefined();
    expect(screen.getByTestId('market-indicator-entry-gold')).toBeDefined();
    expect(screen.getByTestId('market-indicator-entry-sp500')).toBeDefined();
  });

  it('shows "正常" badge for ok health', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    const badges = screen.getAllByTestId('market-indicator-health-badge-ok');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0].textContent).toBe('正常');
  });

  it('shows "陈旧" badge for stale health', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    const badge = screen.getByTestId('market-indicator-health-badge-stale');
    expect(badge.textContent).toBe('陈旧');
  });

  it('shows "失败" badge for failed health', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    const badge = screen.getByTestId('market-indicator-health-badge-failed');
    expect(badge.textContent).toBe('失败');
  });

  it('shows ok_count from meta', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-ok-count').textContent).toContain('4');
  });

  it('shows failed_count from meta', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-failed-count').textContent).toContain('1');
  });

  it('shows cache_status from meta', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-cache-status').textContent).toContain('新鲜');
  });

  it('shows fetched_at timestamp', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={INDICATOR_HEALTH}
        indicatorMeta={INDICATOR_META}
      />,
    );
    expect(screen.getByTestId('market-indicator-fetched-at')).toBeDefined();
  });

  it('shows "—" for null value', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={{ gold: { value: null, source_health: 'failed', checked_at: null } }}
        indicatorMeta={null}
      />,
    );
    const entry = screen.getByTestId('market-indicator-entry-gold');
    expect(entry.textContent).toContain('—');
  });

  it('renders only with indicatorMeta (empty health)', () => {
    render(<MarketIndicatorHealthPanel indicatorMeta={INDICATOR_META} indicatorHealth={{}} />);
    // Meta is present, panel should render with header info
    expect(screen.getByTestId('market-indicator-health-panel')).toBeDefined();
  });

  it('shows stale cache_status correctly', () => {
    render(
      <MarketIndicatorHealthPanel
        indicatorHealth={{}}
        indicatorMeta={{ ...INDICATOR_META, cache_status: 'stale' }}
      />,
    );
    expect(screen.getByTestId('market-indicator-cache-status').textContent).toContain('陈旧');
  });
});
