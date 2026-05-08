import { render, screen } from '@testing-library/react';

import WorkbenchTaskCard from '../components/research-workbench/WorkbenchTaskCard';

describe('WorkbenchTaskCard', () => {
  it('shows readable auto-priority reason on board cards', () => {
    render(
      <WorkbenchTaskCard
        task={{
          id: 'cross_task_1',
          type: 'cross_market',
          title: 'Utilities vs Growth',
          source: 'research_workbench',
          timeline: [
            {
              id: 'event_refresh',
              type: 'refresh_priority',
              label: '系统自动重排升级：结构衰败/系统雷达',
              detail: '系统级结构衰败雷达已升级到警报区；紧急度 5.0；建议先收缩风险预算。',
              created_at: '2026-04-11T12:00:00Z',
              meta: {
                change_type: 'escalated',
                change_label: '升级',
                previous_reason_label: '人的维度',
                urgency_delta: 2,
                priority_weight_delta: 1.4,
              },
            },
          ],
          snapshot: {
            headline: '系统级风险升温，建议复核组合。',
            payload: {
              view_context: {
                summary: '快速视图：自动排序升档 · 关键词：defense',
                scoped_task_label: '当前定位：rw_focus_1',
              },
              template_meta: {},
            },
          },
          snapshot_history: [],
        }}
        status="in_progress"
        isSelected={false}
        isOverTarget={false}
        refreshSignal={{
          severity: 'high',
          refreshTone: 'red',
          refreshLabel: '建议更新',
          priorityReason: 'structural_decay',
          urgencyScore: 5,
          priorityWeight: 3.4,
          recommendation: '建议优先复核系统级防御构造。',
          structuralDecayRadarDriven: true,
          structuralDecayRadarShift: {
            lead: '系统级结构衰败雷达已升级到警报区',
            topSignalSummary: '组织脆弱 · 部门混乱',
            actionHint: '建议先收缩风险预算，再确认是否保留现有多空表达。',
          },
        }}
        onSelect={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      />
    );

    expect(screen.getByText('自动排序：结构衰败/系统雷达')).toBeTruthy();
    expect(screen.getByText('升级')).toBeTruthy();
    expect(screen.getByText(/较上次从人的维度升档/)).toBeTruthy();
    expect(screen.getByText('最近快照视角 快速视图：自动排序升档 · 关键词：defense')).toBeTruthy();
    expect(screen.getByText('当前定位：rw_focus_1')).toBeTruthy();
    expect(screen.getByText(/系统级结构衰败雷达已升级到警报区/)).toBeTruthy();
    expect(screen.getByText(/紧急度 5.0/)).toBeTruthy();
  });

  it('shows a concise screener-provenance tag for tasks saved from a screener slice', () => {
    render(
      <WorkbenchTaskCard
        task={{
          id: 'rw_screener_card',
          type: 'pricing',
          title: 'AAPL screener review',
          source: 'screener',
          symbol: 'AAPL',
          context: {
            source: 'screener',
            primary_view: '低估',
            screener_filters: {
              filter: 'undervalued',
              sector_filter: 'tech',
              min_score: 12,
              universe_size: 50,
              period: 'ttm',
            },
          },
          snapshot: { headline: 'AAPL pricing screener candidate', payload: {} },
          snapshot_history: [],
          updated_at: '2026-04-12T10:00:00Z',
        }}
        status="new"
        isSelected={false}
        isOverTarget={false}
        refreshSignal={null}
        onSelect={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      />
    );

    expect(
      screen.getByText('筛选 undervalued · tech · ≥12 · 候选 50 · ttm')
    ).toBeTruthy();
  });

  it('does not render the screener tag for non-screener tasks', () => {
    render(
      <WorkbenchTaskCard
        task={{
          id: 'rw_manual_card',
          type: 'pricing',
          title: 'Manual review',
          source: 'godeye',
          symbol: 'AAPL',
          context: { note: 'manual' },
          snapshot: { headline: 'manual', payload: {} },
          snapshot_history: [],
          updated_at: '2026-04-12T10:00:00Z',
        }}
        status="new"
        isSelected={false}
        isOverTarget={false}
        refreshSignal={null}
        onSelect={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
      />
    );

    expect(screen.queryByText(/^筛选 /)).toBeNull();
    expect(screen.queryByText('筛选条件')).toBeNull();
  });
});
