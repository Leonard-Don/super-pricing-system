// ---------------------------------------------------------------------------
// PolicyTimelineBar tests — TDD: write first, run → fail, implement → pass
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PolicyTimelineBar } from '../PolicyTimelineBar';
import type { TimelineItem } from '@/features/godeye/lib/overviewViewModels';

const makeItem = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  key: 'item-1',
  title: '美联储宣布降息50bps',
  timestamp: '2024-09-18T14:00:00Z',
  source: '美联储',
  direction: 'stimulus',
  directionLabel: '偏刺激',
  tags: ['利率', '流动性'],
  score: 0.42,
  confidence: 0.85,
  details: {},
  primaryAction: null,
  secondaryAction: null,
  ...overrides,
});

const tighteningItem = makeItem({
  key: 'item-2',
  title: '央行提高存款准备金率',
  direction: 'tightening',
  directionLabel: '偏收紧',
  score: -0.35,
});

describe('PolicyTimelineBar', () => {
  it('renders card title 政策时间轴', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getByText('政策时间轴')).toBeDefined();
  });

  it('renders policy event title', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getAllByText('美联储宣布降息50bps').length).toBeGreaterThan(0);
  });

  it('renders stimulus direction label', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getAllByText('偏刺激').length).toBeGreaterThan(0);
  });

  it('renders tightening direction label', () => {
    render(<PolicyTimelineBar timelineItems={[tighteningItem]} />);
    expect(screen.getAllByText('偏收紧').length).toBeGreaterThan(0);
  });

  it('renders source label', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getByText('美联储')).toBeDefined();
  });

  it('renders score formatted to 2 decimals', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getByText(/评分.*0\.42/)).toBeDefined();
  });

  it('renders industry tags', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem()]} />);
    expect(screen.getByText('利率')).toBeDefined();
  });

  it('renders empty state when no items', () => {
    render(<PolicyTimelineBar timelineItems={[]} />);
    expect(screen.getByText('暂无政策时间轴')).toBeDefined();
  });

  it('renders multiple items in timeline', () => {
    render(<PolicyTimelineBar timelineItems={[makeItem(), tighteningItem]} />);
    // First item is active so its title appears in both the list and the detail panel
    expect(screen.getAllByText('美联储宣布降息50bps').length).toBeGreaterThan(0);
    expect(screen.getByText('央行提高存款准备金率')).toBeDefined();
  });

  // Backend timeline ids are not guaranteed unique — two events can share the same
  // `key` hash. The <li> list must still produce unique React keys so React does not
  // warn ("Encountered two children with the same key") and silently drop a row.
  it('does not emit duplicate React key warnings when items share a backend key', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dupA = makeItem({ key: 'shared-hash-zzz', title: '重复键事件A' });
    const dupB = makeItem({ key: 'shared-hash-zzz', title: '重复键事件B' });
    render(<PolicyTimelineBar timelineItems={[dupA, dupB]} />);
    const sameKeyWarning = errSpy.mock.calls.find(
      (args) => typeof args[0] === 'string' && args[0].includes('same key'),
    );
    errSpy.mockRestore();
    expect(sameKeyWarning).toBeUndefined();
    // Both rows must still render — neither dropped by key collision. The first
    // item is active, so its title also appears in the detail panel.
    expect(screen.getAllByText('重复键事件A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('重复键事件B').length).toBeGreaterThan(0);
  });
});
