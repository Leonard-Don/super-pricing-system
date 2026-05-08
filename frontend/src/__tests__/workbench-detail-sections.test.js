import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  WorkbenchTaskActivitySection,
  WorkbenchTaskSummarySection,
} from '../components/research-workbench/WorkbenchDetailSections';
import { navigateToAppUrl } from '../utils/researchContext';

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Row: ({ children }) => <div>{children}</div>,
    Col: ({ children }) => <div>{children}</div>,
  };
});

jest.mock('../components/research-workbench/SelectedTaskRefreshPanel', () => () => <div>refresh-panel</div>);
jest.mock('../components/research-workbench/SnapshotSummary', () => ({
  SnapshotHistoryList: () => <div>snapshot-history</div>,
  SnapshotSummary: () => <div>snapshot-summary</div>,
}));

jest.mock('../utils/researchContext', () => {
  const actual = jest.requireActual('../utils/researchContext');
  return {
    ...actual,
    navigateToAppUrl: jest.fn(),
  };
});

describe('WorkbenchTaskSummarySection screener context', () => {
  beforeEach(() => {
    navigateToAppUrl.mockReset();
  });

  it('renders screener filter chips and a reopen-in-pricing button for screener-sourced tasks', () => {
    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={() => {}}
        latestSnapshotComparison={null}
        selectedTask={{
          id: 'rw_screener',
          type: 'pricing',
          sourceLabel: 'Screener',
          symbol: 'AAPL',
          template: '',
          source: 'screener',
          context: {
            source: 'screener',
            period: 'ttm',
            primary_view: '低估',
            screener_filters: {
              filter: 'undervalued',
              sector_filter: 'tech',
              min_score: 12,
              universe_size: 50,
              period: 'ttm',
            },
          },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={null}
      />
    );

    const filterCard = screen.getByText('筛选来源').closest('.ant-card');
    expect(filterCard).toBeTruthy();
    const cardScope = within(filterCard);
    expect(cardScope.getByText(/筛选模式.*undervalued/)).toBeTruthy();
    expect(cardScope.getByText(/行业.*tech/)).toBeTruthy();
    expect(cardScope.getByText(/最小分.*12/)).toBeTruthy();
    expect(cardScope.getByText(/候选数.*50/)).toBeTruthy();
    expect(cardScope.getByText(/周期.*ttm/)).toBeTruthy();

    fireEvent.click(cardScope.getByRole('button', { name: /在定价中重开/ }));

    expect(navigateToAppUrl).toHaveBeenCalledTimes(1);
    const navigatedUrl = navigateToAppUrl.mock.calls[0][0];
    expect(navigatedUrl).toContain('view=pricing');
    expect(navigatedUrl).toContain('symbol=AAPL');
    expect(navigatedUrl).toContain('source=screener');
    expect(navigatedUrl).toContain('period=ttm');
  });

  it('renders a 返回筛选 button that navigates back to the pricing screener with the original filters restored', () => {
    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={() => {}}
        latestSnapshotComparison={null}
        selectedTask={{
          id: 'rw_screener_back',
          type: 'pricing',
          sourceLabel: 'Screener',
          symbol: 'AAPL',
          template: '',
          source: 'screener',
          context: {
            source: 'screener',
            period: 'ttm',
            primary_view: '低估',
            screener_filters: {
              filter: 'undervalued',
              sector_filter: 'tech',
              min_score: 12,
              universe_size: 50,
              period: 'ttm',
            },
          },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={null}
      />
    );

    const filterCard = screen.getByText('筛选来源').closest('.ant-card');
    const cardScope = within(filterCard);

    fireEvent.click(cardScope.getByRole('button', { name: /返回筛选/ }));

    expect(navigateToAppUrl).toHaveBeenCalledTimes(1);
    const navigatedUrl = navigateToAppUrl.mock.calls[0][0];
    expect(navigatedUrl).toContain('view=pricing');
    expect(navigatedUrl).toContain('action=screener');
    expect(navigatedUrl).toContain('screener_filter=undervalued');
    expect(navigatedUrl).toContain('screener_sector=tech');
    expect(navigatedUrl).toContain('screener_min_score=12');
    expect(navigatedUrl).toContain('screener_period=ttm');
  });

  it('does not render the 返回筛选 button when the task has no screener filters', () => {
    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={() => {}}
        latestSnapshotComparison={null}
        selectedTask={{
          id: 'rw_manual_no_screener_btn',
          type: 'pricing',
          sourceLabel: 'GodEye',
          symbol: 'AAPL',
          template: '',
          source: 'godeye',
          context: { note: 'no screener context' },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={null}
      />
    );

    expect(screen.queryByRole('button', { name: /返回筛选/ })).toBeNull();
  });

  it('omits screener_filters from the generic 任务上下文 tag list to avoid duplicating the 筛选来源 card', () => {
    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={() => {}}
        latestSnapshotComparison={null}
        selectedTask={{
          id: 'rw_screener_dup',
          type: 'pricing',
          sourceLabel: 'Screener',
          symbol: 'AAPL',
          template: '',
          source: 'screener',
          context: {
            source: 'screener',
            period: 'ttm',
            primary_view: '低估',
            screener_filters: {
              filter: 'undervalued',
              sector_filter: 'tech',
              min_score: 12,
              universe_size: 50,
              period: 'ttm',
            },
          },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={null}
      />
    );

    const contextCard = screen.getByText('任务上下文').closest('.ant-card');
    expect(contextCard).toBeTruthy();
    const contextScope = within(contextCard);

    expect(contextScope.queryByText(/screener_filters/)).toBeNull();
    expect(contextScope.getByText(/source: screener/)).toBeTruthy();
    expect(contextScope.getByText(/period: ttm/)).toBeTruthy();
    expect(contextScope.getByText(/primary_view: 低估/)).toBeTruthy();
  });

  it('does not render the screener filter card for non-screener tasks', () => {
    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={() => {}}
        latestSnapshotComparison={null}
        selectedTask={{
          id: 'rw_manual',
          type: 'pricing',
          sourceLabel: 'GodEye',
          symbol: 'AAPL',
          template: '',
          source: 'godeye',
          context: { note: 'no screener context' },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={null}
      />
    );

    expect(screen.queryByText('筛选来源')).toBeNull();
    expect(screen.queryByRole('button', { name: '在定价中重开' })).toBeNull();
  });
});

describe('WorkbenchTaskSummarySection', () => {
  it('shows the current shared-view context and copy action in the detail sidebar', () => {
    const handleCopyViewLink = jest.fn();

    render(
      <WorkbenchTaskSummarySection
        handleCopyViewLink={handleCopyViewLink}
        latestSnapshotComparison={null}
        selectedTask={{
          type: 'pricing',
          sourceLabel: 'GodEye',
          symbol: 'AAPL',
          template: '',
          context: {
            source: 'godeye',
            note: 'focus on risk budget',
          },
        }}
        selectedTaskRefreshSignal={null}
        workbenchViewSummary={{
          hasActiveFilters: true,
          headline: '快速视图：自动排序升档 · 关键词：defense',
          note: '打开这个链接后，工作台会恢复到同一组筛选条件和当前任务焦点。',
          scopedTaskLabel: '当前定位：AAPL defensive hedge',
        }}
      />
    );

    expect(screen.getByText('当前共享视图上下文')).toBeTruthy();
    expect(screen.getByText('已带筛选视角')).toBeTruthy();
    expect(screen.getByText('快速视图：自动排序升档 · 关键词：defense')).toBeTruthy();
    expect(screen.getByText('当前定位：AAPL defensive hedge')).toBeTruthy();
    expect(screen.getByText('打开这个链接后，工作台会恢复到同一组筛选条件和当前任务焦点。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '复制当前视图链接' }));
    expect(handleCopyViewLink).toHaveBeenCalledTimes(1);
  });

  it('renders snapshot view context inside timeline activity items', () => {
    render(
      <WorkbenchTaskActivitySection
        commentDraft=""
        handleAddComment={() => {}}
        handleDeleteComment={() => {}}
        handleRestoreArchived={() => {}}
        handleStatusUpdate={() => {}}
        saving={false}
        selectedTask={{ comments: [], status: 'new' }}
        selectedTaskPriorityMeta={null}
        setCommentDraft={() => {}}
        setShowAllTimeline={() => {}}
        showAllTimeline={false}
        timeline={[
          {
            id: 'event_snapshot',
            type: 'snapshot_saved',
          },
        ]}
        timelineItems={[
          {
            color: 'green',
            dot: 'clock',
            children: {
              label: '研究快照已更新',
              type: '快照',
              color: 'green',
              createdAt: '2026-04-12T10:00:00Z',
              detail: 'MSFT snapshot · 视图 快速视图：自动排序升档 · 类型：Pricing',
              snapshotViewSummary: '快速视图：自动排序升档 · 类型：Pricing',
              snapshotViewFocus: '当前定位：rw_msft',
              snapshotViewNote: '这次快照是在带筛选的工作台视图下保存的。',
            },
          },
        ]}
      />
    );

    expect(screen.getByText('研究视角')).toBeTruthy();
    expect(screen.getByText('工作台视角 快速视图：自动排序升档 · 类型：Pricing')).toBeTruthy();
    expect(screen.getByText('当前定位：rw_msft')).toBeTruthy();
    expect(screen.getByText('这次快照是在带筛选的工作台视图下保存的。')).toBeTruthy();
  });
});
