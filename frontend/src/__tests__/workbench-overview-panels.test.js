import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import WorkbenchOverviewPanels from '../components/research-workbench/WorkbenchOverviewPanels';

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Row: ({ children }) => <div>{children}</div>,
    Col: ({ children }) => <div>{children}</div>,
  };
});

describe('WorkbenchOverviewPanels', () => {
  const TYPE_OPTIONS = [
    { label: '全部类型', value: '' },
    { label: 'Pricing', value: 'pricing' },
  ];
  const REFRESH_OPTIONS = [
    { label: '全部更新状态', value: '' },
    { label: '建议更新', value: 'high' },
  ];
  const SNAPSHOT_VIEW_OPTIONS = [
    { label: '全部快照视角', value: '' },
    { label: '带筛选视角快照', value: 'filtered' },
    { label: '带任务焦点快照', value: 'scoped' },
  ];
  const REASON_OPTIONS = [
    { label: '全部更新原因', value: '' },
    { label: '自动排序缓和', value: 'priority_relaxed' },
    { label: '自动排序升档', value: 'priority_escalated' },
    { label: '自动排序首次入列', value: 'priority_new' },
  ];
  const sourceOptions = [
    { label: '全部来源', value: '' },
    { label: 'GodEye', value: 'godeye' },
  ];
  const snapshotSummaryOptions = [
    {
      label: '快速视图：自动排序升档 · 类型：Pricing',
      value: '快速视图：自动排序升档 · 类型：Pricing',
      fingerprint: 'wv_pricing_escalated',
      count: 2,
      scopedCount: 1,
    },
    {
      label: '快速视图：自动排序缓和 · 类型：Cross-Market',
      value: '快速视图：自动排序缓和 · 类型：Cross-Market',
      fingerprint: 'wv_cross_relaxed',
      count: 1,
      scopedCount: 0,
    },
  ];

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('toggles escalated quick filter from overview cards', () => {
    const setFilters = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: '' }}
        onCopyViewLink={jest.fn()}
        refreshStats={{
          high: 2,
          medium: 1,
          low: 4,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 1,
          priorityNew: 1,
          priorityEscalated: 3,
          priorityRelaxed: 1,
          priorityUpdated: 2,
          snapshotViewFiltered: 4,
          snapshotViewScoped: 2,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 10, status_counts: { in_progress: 3, blocked: 1, complete: 2 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: '只看升档' })[0]);

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    expect(updater({ reason: '', type: '', source: '', refresh: '', snapshotView: '', keyword: '' }).reason).toBe('priority_escalated');
  });

  it('shows active quick-filter banner and clears it', () => {
    const setFilters = jest.fn();
    const onCopyViewLink = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: 'priority_relaxed', snapshotView: 'filtered', snapshotFingerprint: 'wv_cross_relaxed', snapshotSummary: '快速视图：自动排序缓和 · 类型：Cross-Market', keyword: 'hedge' }}
        onCopyViewLink={onCopyViewLink}
        refreshStats={{
          high: 0,
          medium: 0,
          low: 1,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 2,
          priorityUpdated: 1,
          snapshotViewFiltered: 2,
          snapshotViewScoped: 1,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 2, status_counts: { in_progress: 1, blocked: 0, complete: 0 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    expect(screen.getByText('当前工作台筛选已生效')).toBeTruthy();
    expect(screen.getAllByText(/快速视图：自动排序缓和/).length).toBeGreaterThan(0);
    expect(screen.getByText(/快照视角：带筛选视角快照/)).toBeTruthy();
    expect(screen.getByText(/研究视角：快速视图：自动排序缓和/)).toBeTruthy();
    expect(screen.getByText(/关键词：hedge/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '复制当前视图链接' }));
    expect(onCopyViewLink).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '清空全部筛选' }));

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    const nextFilters = updater({ reason: 'priority_relaxed', type: 'pricing', source: 'godeye', refresh: 'high', snapshotView: 'filtered', snapshotFingerprint: 'wv_cross_relaxed', snapshotSummary: '快速视图：自动排序缓和 · 类型：Cross-Market', keyword: 'hedge' });
    expect(nextFilters.reason).toBe('');
    expect(nextFilters.type).toBe('');
    expect(nextFilters.source).toBe('');
    expect(nextFilters.refresh).toBe('');
    expect(nextFilters.snapshotView).toBe('');
    expect(nextFilters.snapshotFingerprint).toBe('');
    expect(nextFilters.snapshotSummary).toBe('');
    expect(nextFilters.keyword).toBe('');
  });

  it('toggles first-time auto-priority quick filter from overview cards', () => {
    const setFilters = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        refreshStats={{
          high: 1,
          medium: 0,
          low: 2,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 2,
          priorityEscalated: 1,
          priorityRelaxed: 0,
          priorityUpdated: 1,
          snapshotViewFiltered: 1,
          snapshotViewScoped: 1,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 4, status_counts: { in_progress: 2, blocked: 0, complete: 1 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '只看首次' }));

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    expect(updater({ reason: '', type: '', source: '', refresh: '', snapshotView: '', keyword: '' }).reason).toBe('priority_new');
  });

  it('toggles snapshot-view quick filters from overview cards', () => {
    const setFilters = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        refreshStats={{
          high: 0,
          medium: 0,
          low: 1,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 0,
          priorityUpdated: 0,
          snapshotViewFiltered: 3,
          snapshotViewScoped: 2,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{
          total: 3,
          status_counts: { in_progress: 1, blocked: 0, complete: 0 },
          snapshot_view_queues: snapshotSummaryOptions,
        }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '只看带视角' }));

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    expect(updater({ reason: '', type: '', source: '', refresh: '', snapshotView: '', keyword: '' }).snapshotView).toBe('filtered');
  });

  it('toggles snapshot-summary review queue from overview cards', () => {
    const setFilters = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', snapshotFingerprint: '', snapshotSummary: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        refreshStats={{
          high: 0,
          medium: 0,
          low: 1,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 0,
          priorityUpdated: 0,
          snapshotViewFiltered: 3,
          snapshotViewScoped: 1,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 3, status_counts: { in_progress: 1, blocked: 0, complete: 0 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看“快速视图：自动排序升档 · 类型：Pricing”' }));

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    expect(updater({
      reason: '',
      type: '',
      source: '',
      refresh: '',
      snapshotView: '',
      snapshotFingerprint: '',
      snapshotSummary: '',
      keyword: '',
    }).snapshotSummary).toBe('快速视图：自动排序升档 · 类型：Pricing');
    expect(updater({
      reason: '',
      type: '',
      source: '',
      refresh: '',
      snapshotView: '',
      snapshotFingerprint: '',
      snapshotSummary: '',
      keyword: '',
    }).snapshotFingerprint).toBe('wv_pricing_escalated');
  });

  it('renders readable active filter tags and clears a single filter tag', () => {
    const setFilters = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{
          reason: 'priority_relaxed',
          type: 'pricing',
          source: 'godeye',
          refresh: 'high',
          snapshotView: 'scoped',
          snapshotFingerprint: 'wv_pricing_escalated',
          snapshotSummary: '快速视图：自动排序升档 · 类型：Pricing',
          keyword: 'hedge',
        }}
        onCopyViewLink={jest.fn()}
        refreshStats={{
          high: 0,
          medium: 0,
          low: 1,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 2,
          priorityUpdated: 1,
          snapshotViewFiltered: 1,
          snapshotViewScoped: 1,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={setFilters}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 2, status_counts: { in_progress: 1, blocked: 0, complete: 0 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    expect(screen.getByText('快速视图：自动排序缓和')).toBeTruthy();
    expect(screen.getByText('关键词：hedge')).toBeTruthy();
    expect(screen.getByText('更新级别：建议更新')).toBeTruthy();
    expect(screen.getByText('快照视角：带任务焦点快照')).toBeTruthy();
    expect(screen.getByText('研究视角：快速视图：自动排序升档 · 类型：Pricing')).toBeTruthy();
    expect(screen.getByText('类型：Pricing')).toBeTruthy();
    expect(screen.getByText('来源：GodEye')).toBeTruthy();

    fireEvent.click(screen.getByTestId('overview-filter-close-keyword'));

    expect(setFilters).toHaveBeenCalledTimes(1);
    const updater = setFilters.mock.calls[0][0];
    const nextFilters = updater({
      reason: 'priority_relaxed',
      type: 'pricing',
      source: 'godeye',
      refresh: 'high',
      snapshotView: 'scoped',
      snapshotFingerprint: 'wv_pricing_escalated',
      snapshotSummary: '快速视图：自动排序升档 · 类型：Pricing',
      keyword: 'hedge',
    });
    expect(nextFilters.reason).toBe('priority_relaxed');
    expect(nextFilters.keyword).toBe('');
    expect(nextFilters.type).toBe('pricing');
  });

  it('opens queue launch actions from the overview execution card', () => {
    const onOpenQueueLead = jest.fn();
    const onOpenQueuePricing = jest.fn();
    const onOpenQueueCrossMarket = jest.fn();

    render(
      <WorkbenchOverviewPanels
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', snapshotFingerprint: '', snapshotSummary: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        onOpenQueueLead={onOpenQueueLead}
        onOpenQueuePricing={onOpenQueuePricing}
        onOpenQueueCrossMarket={onOpenQueueCrossMarket}
        queueLaunchSummary={{
          total: 4,
          launchableCount: 3,
          leadTask: { id: 'task_1', title: 'Lead Research Task' },
          pricingTask: { id: 'task_2', title: 'Pricing Task' },
          crossMarketTask: { id: 'task_3', title: 'Cross Task' },
          pricingCount: 1,
          crossMarketCount: 2,
        }}
        refreshStats={{
          high: 1,
          medium: 0,
          low: 1,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 0,
          priorityUpdated: 0,
          snapshotViewFiltered: 0,
          snapshotViewScoped: 0,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={jest.fn()}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 4, status_counts: { in_progress: 1, blocked: 0, complete: 0 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    expect(screen.getByText('当前复盘队列执行入口')).toBeTruthy();
    expect(screen.getByText('当前排序首条：Lead Research Task')).toBeTruthy();
    expect(screen.getByText('Pricing 1')).toBeTruthy();
    expect(screen.getByText('Cross-Market 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '打开队列首条' }));
    fireEvent.click(screen.getByRole('button', { name: '打开首个 Pricing' }));
    fireEvent.click(screen.getByRole('button', { name: '打开首个跨市场' }));

    expect(onOpenQueueLead).toHaveBeenCalledTimes(1);
    expect(onOpenQueuePricing).toHaveBeenCalledTimes(1);
    expect(onOpenQueueCrossMarket).toHaveBeenCalledTimes(1);
  });

  it('renders the daily briefing with auto-refresh controls', () => {
    const onAddDailyBriefingEmailPreset = jest.fn();
    const onApplyDailyBriefingEmailPreset = jest.fn();
    const onApplyMorningPreset = jest.fn();
    const onChangeDailyBriefingEmailCcRecipients = jest.fn();
    const onChangeDailyBriefingDistributionEnabled = jest.fn();
    const onChangeDailyBriefingDistributionTime = jest.fn();
    const onChangeDailyBriefingDistributionTimezone = jest.fn();
    const onChangeDailyBriefingDistributionWeekdays = jest.fn();
    const onChangeDailyBriefingNotificationChannels = jest.fn();
    const onChangeDailyBriefingEmailPresetName = jest.fn();
    const onChangeDailyBriefingEmailRecipients = jest.fn();
    const onChangeDailyBriefingNote = jest.fn();
    const onCopyDailyBriefing = jest.fn();
    const onCopyDailyBriefingEmailBody = jest.fn();
    const onCopyDailyBriefingEmailSubject = jest.fn();
    const onCopyDailyBriefingHtml = jest.fn();
    const onCopyDailyBriefingMarkdown = jest.fn();
    const onClearDailyBriefingEmailCcRecipients = jest.fn();
    const onClearDailyBriefingEmailRecipients = jest.fn();
    const onClearDailyBriefingNote = jest.fn();
    const onDownloadDailyBriefingHtml = jest.fn();
    const onExportDailyBriefingPdf = jest.fn();
    const onDeleteDailyBriefingEmailPreset = jest.fn();
    const onMoveDailyBriefingEmailPreset = jest.fn();
    const onOpenDailyBriefingMailDraft = jest.fn();
    const onOpenDailyBriefingEmailTemplatePage = jest.fn();
    const onOpenDailyBriefingPreviewDrawer = jest.fn();
    const onOpenDailyBriefingShareCard = jest.fn();
    const onRefreshNow = jest.fn();
    const onRunDailyBriefingDryRun = jest.fn();
    const onSaveDailyBriefingEmailPreset = jest.fn();
    const onSaveDailyBriefingDistribution = jest.fn();
    const onSendDailyBriefing = jest.fn();
    const onSetDefaultDailyBriefingEmailPreset = jest.fn();
    const onToggleAutoRefresh = jest.fn();
    const onSetAutoRefreshInterval = jest.fn();

    render(
      <WorkbenchOverviewPanels
        activeDailyBriefingEmailPresetId="morning_sync"
        autoRefreshSummary={{
          enabled: true,
          intervalMs: 5 * 60 * 1000,
          intervalLabel: '5 分钟',
          intervalOptions: [
            { label: '2 分钟', value: 2 * 60 * 1000 },
            { label: '5 分钟', value: 5 * 60 * 1000 },
          ],
          lastRefreshLabel: '09:30 · 刚刚',
          nextRefreshLabel: '下一次预计 09:35',
          documentVisible: true,
          isRefreshing: false,
          statusLabel: '5 分钟 自动刷新中',
        }}
        dailyBriefingBrandLabel="Super Pricing System · Research Workbench"
        dailyBriefingEmailCcRecipients="risk@example.com"
        dailyBriefingDeliveryHistory={[
          {
            id: 'briefing_1',
            created_at: '2026-04-24T09:15:00',
            status: 'dry_run',
            subject: 'Research Workbench Daily Briefing',
            to_recipients: 'desk@example.com; pm@example.com',
            channels: ['dry_run', 'research_webhook'],
            channel_results: [
              { channel: 'dry_run', status: 'dry_run', delivered: false },
              { channel: 'research_webhook', status: 'sent', delivered: true },
            ],
          },
        ]}
        dailyBriefingDefaultEmailPresetId="custom_ops"
        dailyBriefingDistributionConfig={{
          enabled: true,
          sendTime: '09:15',
          timezone: 'Asia/Shanghai',
          weekdays: ['mon', 'tue'],
          notificationChannels: 'dry_run research_webhook',
        }}
        dailyBriefingDistributionSaving={false}
        dailyBriefingDryRunRunning={false}
        dailyBriefingSending={false}
        dailyBriefingSchedule={{
          enabled: true,
          status: 'scheduled',
          timezone: 'Asia/Shanghai',
          sendTime: '09:15',
          weekdays: ['mon', 'tue'],
          nextRunAt: '2026-04-24T09:15+08:00',
          nextRunLabel: '2026-04-24 09:15 Asia/Shanghai',
        }}
        dailyBriefingNotificationChannelOptions={[
          { id: 'dry_run', label: 'Dry Run', type: 'dry_run', enabled: true, source: 'builtin' },
          { id: 'email', label: 'Email', type: 'email', enabled: true, source: 'env' },
          { id: 'research_webhook', label: 'Research Webhook', type: 'webhook', enabled: true, source: 'stored' },
        ]}
        dailyBriefingEmailPresets={[
          {
            id: 'morning_sync',
            name: '晨会分发',
            toRecipients: 'desk@example.com; pm@example.com',
            ccRecipients: 'risk@example.com',
          },
          {
            id: 'risk_sync',
            name: '风险同步',
            toRecipients: 'riskdesk@example.com',
            ccRecipients: 'lead@example.com',
          },
          {
            id: 'management_brief',
            name: '管理层简报',
            toRecipients: 'exec@example.com',
            ccRecipients: '',
          },
          {
            id: 'custom_ops',
            name: '自定义同步',
            toRecipients: 'ops@example.com',
            ccRecipients: 'desk@example.com',
          },
          {
            id: 'custom_beta',
            name: '自定义 Beta',
            toRecipients: 'beta@example.com',
            ccRecipients: '',
          },
        ]}
        dailyBriefingEmailRecipients="desk@example.com; pm@example.com"
        dailyBriefing={{
          headline: '今日先看 Pricing · AAPL · Defensive rerate',
          summary: '先处理 2 条自动升档任务，再覆盖 3 条建议更新。',
          chips: [
            { label: '升档', value: 2, color: 'red' },
            { label: '建议更新', value: 3, color: 'volcano' },
          ],
          details: [
            '当前简报基于“快速视图：自动排序升档 · 类型：Pricing”。',
            '可直接重开 4 条，其中 Pricing 2，跨市场 2。',
          ],
        }}
        dailyBriefingTeamNote="Desk sync at 10:30"
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', snapshotFingerprint: '', snapshotSummary: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        morningPresetActive={false}
        morningPresetCandidate={{
          label: '晨间默认视图：自动排序升档',
          note: '先看今天刚升档的任务。',
          filters: { reason: 'priority_escalated' },
        }}
        morningPresetSummary={{
          label: '晨间默认视图：自动排序升档',
          note: '先看今天刚升档的任务。',
        }}
        onAddDailyBriefingEmailPreset={onAddDailyBriefingEmailPreset}
        onApplyDailyBriefingEmailPreset={onApplyDailyBriefingEmailPreset}
        onApplyMorningPreset={onApplyMorningPreset}
        onChangeDailyBriefingEmailCcRecipients={onChangeDailyBriefingEmailCcRecipients}
        onChangeDailyBriefingDistributionEnabled={onChangeDailyBriefingDistributionEnabled}
        onChangeDailyBriefingDistributionTime={onChangeDailyBriefingDistributionTime}
        onChangeDailyBriefingDistributionTimezone={onChangeDailyBriefingDistributionTimezone}
        onChangeDailyBriefingDistributionWeekdays={onChangeDailyBriefingDistributionWeekdays}
        onChangeDailyBriefingNotificationChannels={onChangeDailyBriefingNotificationChannels}
        onChangeDailyBriefingEmailPresetName={onChangeDailyBriefingEmailPresetName}
        onChangeDailyBriefingEmailRecipients={onChangeDailyBriefingEmailRecipients}
        onChangeDailyBriefingNote={onChangeDailyBriefingNote}
        onCopyDailyBriefing={onCopyDailyBriefing}
        onCopyDailyBriefingEmailBody={onCopyDailyBriefingEmailBody}
        onCopyDailyBriefingEmailSubject={onCopyDailyBriefingEmailSubject}
        onCopyDailyBriefingHtml={onCopyDailyBriefingHtml}
        onCopyDailyBriefingMarkdown={onCopyDailyBriefingMarkdown}
        onClearDailyBriefingEmailCcRecipients={onClearDailyBriefingEmailCcRecipients}
        onClearDailyBriefingEmailRecipients={onClearDailyBriefingEmailRecipients}
        onClearDailyBriefingNote={onClearDailyBriefingNote}
        onDownloadDailyBriefingHtml={onDownloadDailyBriefingHtml}
        onExportDailyBriefingPdf={onExportDailyBriefingPdf}
        onDeleteDailyBriefingEmailPreset={onDeleteDailyBriefingEmailPreset}
        onMoveDailyBriefingEmailPreset={onMoveDailyBriefingEmailPreset}
        onOpenDailyBriefingMailDraft={onOpenDailyBriefingMailDraft}
        onOpenDailyBriefingEmailTemplatePage={onOpenDailyBriefingEmailTemplatePage}
        onOpenDailyBriefingPreviewDrawer={onOpenDailyBriefingPreviewDrawer}
        onOpenDailyBriefingShareCard={onOpenDailyBriefingShareCard}
        onOpenQueueLead={jest.fn()}
        onOpenQueuePricing={jest.fn()}
        onOpenQueueCrossMarket={jest.fn()}
        onRefreshNow={onRefreshNow}
        onRunDailyBriefingDryRun={onRunDailyBriefingDryRun}
        onSaveDailyBriefingEmailPreset={onSaveDailyBriefingEmailPreset}
        onSaveDailyBriefingDistribution={onSaveDailyBriefingDistribution}
        onSendDailyBriefing={onSendDailyBriefing}
        onSetDefaultDailyBriefingEmailPreset={onSetDefaultDailyBriefingEmailPreset}
        onSetAutoRefreshInterval={onSetAutoRefreshInterval}
        onToggleAutoRefresh={onToggleAutoRefresh}
        queueLaunchSummary={{
          total: 4,
          launchableCount: 4,
          leadTask: { id: 'task_1', title: 'Lead Research Task' },
          pricingTask: { id: 'task_2', title: 'Pricing Task' },
          crossMarketTask: { id: 'task_3', title: 'Cross Task' },
          pricingCount: 2,
          crossMarketCount: 2,
        }}
        refreshStats={{
          high: 3,
          medium: 1,
          low: 2,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 2,
          priorityRelaxed: 0,
          priorityUpdated: 0,
          snapshotViewFiltered: 0,
          snapshotViewScoped: 0,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={jest.fn()}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 4, status_counts: { in_progress: 1, blocked: 0, complete: 0 } }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    expect(screen.getByText('每日简报')).toBeTruthy();
    expect(screen.getByText('今日先看 Pricing · AAPL · Defensive rerate')).toBeTruthy();
    expect(screen.getByText('5 分钟 自动刷新中')).toBeTruthy();
    expect(screen.getByText(/下一次预计 09:35/)).toBeTruthy();
    expect(screen.getByText('导出抬头：Super Pricing System · Research Workbench')).toBeTruthy();
    expect(screen.getByDisplayValue('Desk sync at 10:30')).toBeTruthy();
    expect(screen.getByDisplayValue('desk@example.com; pm@example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('risk@example.com')).toBeTruthy();
    expect(screen.getByText('收件人与抄送模板可同步到分发配置，用于 dry-run 审计、邮件模板页和邮件草稿。')).toBeTruthy();
    expect(screen.getByText('分发预设')).toBeTruthy();
    expect(screen.getByText('分发中心')).toBeTruthy();
    expect(screen.getByText('已启用')).toBeTruthy();
    expect(screen.getByText('scheduled')).toBeTruthy();
    expect(screen.getByText('下次自动分发：2026-04-24 09:15 Asia/Shanghai')).toBeTruthy();
    expect(screen.getByDisplayValue('09:15')).toBeTruthy();
    expect(screen.getByDisplayValue('Asia/Shanghai')).toBeTruthy();
    expect(screen.getByLabelText('Dry Run · dry_run').checked).toBe(true);
    expect(screen.getByLabelText('Research Webhook · research_webhook').checked).toBe(true);
    expect(screen.getByLabelText('Email · email').checked).toBe(false);
    expect(screen.getByText('最近分发记录')).toBeTruthy();
    expect(screen.getByText('Research Workbench Daily Briefing')).toBeTruthy();
    expect(screen.getByText('dry_run: dry_run')).toBeTruthy();
    expect(screen.getByText('research_webhook: sent')).toBeTruthy();
    const mailDraftButton = screen.getByRole('button', { name: '打开邮件草稿' });
    expect(mailDraftButton.disabled).toBe(false);
    expect(mailDraftButton.getAttribute('title')).toBe('打开邮件草稿');
    expect(screen.getByRole('button', { name: '新增自定义预设' })).toBeTruthy();
    expect(screen.getByDisplayValue('晨会分发')).toBeTruthy();
    expect(screen.getByDisplayValue('自定义同步')).toBeTruthy();
    expect(screen.getByDisplayValue('自定义 Beta')).toBeTruthy();
    expect(screen.getAllByText('自定义')).toHaveLength(2);
    expect(screen.getByText('当前已应用')).toBeTruthy();
    expect(screen.getByText('默认预设')).toBeTruthy();
    expect(screen.getByRole('button', { name: '切回晨间默认视图' })).toBeTruthy();
    expect(screen.getByText('最近一次晨间推荐：晨间默认视图：自动排序升档')).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText('写给协作者的晨会提醒、风险提示或任务交接备注...'),
      { target: { value: 'Cover FX drift before noon' } }
    );
    fireEvent.change(
      screen.getByPlaceholderText('收件人模板，如 pm@example.com; desk@example.com'),
      { target: { value: 'lead@example.com; pm@example.com' } }
    );
    fireEvent.change(
      screen.getByPlaceholderText('抄送模板，如 risk@example.com; lead@example.com'),
      { target: { value: 'risklead@example.com' } }
    );
    fireEvent.change(
      screen.getByDisplayValue('晨会分发'),
      { target: { value: '晨会主线' } }
    );
    fireEvent.change(screen.getByLabelText('简报发送时间'), { target: { value: '09:30' } });
    fireEvent.change(screen.getByLabelText('简报时区'), { target: { value: 'Asia/Hong_Kong' } });
    fireEvent.click(screen.getByLabelText('Dry Run · dry_run'));
    fireEvent.click(screen.getByLabelText('Email · email'));
    fireEvent.click(screen.getByRole('switch', { name: '自动分发' }));
    fireEvent.click(screen.getByLabelText('周三'));
    fireEvent.click(screen.getByRole('button', { name: '立即刷新' }));
    fireEvent.click(screen.getByRole('button', { name: '复制今日简报' }));
    fireEvent.click(screen.getByRole('button', { name: '复制 Markdown 简报' }));
    fireEvent.click(screen.getByRole('button', { name: '复制邮件主题' }));
    fireEvent.click(screen.getByRole('button', { name: '复制邮件正文' }));
    fireEvent.click(screen.getByRole('button', { name: '复制 HTML 简报' }));
    fireEvent.click(screen.getByRole('button', { name: '下载 HTML 简报' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 PDF 简报' }));
    fireEvent.click(screen.getByRole('button', { name: '打开邮件模板页' }));
    fireEvent.click(mailDraftButton);
    fireEvent.click(screen.getByRole('button', { name: '工作台内预览' }));
    fireEvent.click(screen.getByRole('button', { name: '打开分享卡片' }));
    fireEvent.click(screen.getByRole('button', { name: '保存分发配置' }));
    fireEvent.click(screen.getByRole('button', { name: '试发送 Dry-run' }));
    fireEvent.click(screen.getByRole('button', { name: '发送通知' }));
    fireEvent.click(screen.getByRole('button', { name: '新增自定义预设' }));
    fireEvent.click(screen.getByRole('button', { name: '继续使用 晨会分发' }));
    fireEvent.click(screen.getAllByRole('button', { name: '保存当前模板' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '取消默认' }));
    fireEvent.click(screen.getAllByRole('button', { name: /上\s*移/ })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: /下\s*移/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '删除预设' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '清空团队备注' }));
    fireEvent.click(screen.getByRole('button', { name: '清空收件人' }));
    fireEvent.click(screen.getByRole('button', { name: '清空抄送' }));
    fireEvent.click(screen.getByRole('button', { name: '切回晨间默认视图' }));
    fireEvent.click(screen.getByRole('button', { name: '暂停自动刷新' }));
    fireEvent.click(screen.getByRole('button', { name: '2 分钟' }));

    expect(onAddDailyBriefingEmailPreset).toHaveBeenCalledTimes(1);
    expect(onChangeDailyBriefingEmailPresetName).toHaveBeenCalledWith('morning_sync', '晨会主线');
    expect(onApplyDailyBriefingEmailPreset).toHaveBeenCalledWith('morning_sync');
    expect(onChangeDailyBriefingEmailRecipients).toHaveBeenCalledWith('lead@example.com; pm@example.com');
    expect(onChangeDailyBriefingEmailCcRecipients).toHaveBeenCalledWith('risklead@example.com');
    expect(onChangeDailyBriefingNote).toHaveBeenCalledWith('Cover FX drift before noon');
    expect(onChangeDailyBriefingDistributionTime).toHaveBeenCalledWith('09:30');
    expect(onChangeDailyBriefingDistributionTimezone).toHaveBeenCalledWith('Asia/Hong_Kong');
    expect(onChangeDailyBriefingNotificationChannels).toHaveBeenNthCalledWith(1, 'research_webhook');
    expect(onChangeDailyBriefingNotificationChannels).toHaveBeenNthCalledWith(2, 'dry_run email research_webhook');
    expect(onChangeDailyBriefingDistributionEnabled).toHaveBeenCalledWith(false);
    expect(onChangeDailyBriefingDistributionWeekdays).toHaveBeenCalledWith(['mon', 'tue', 'wed']);
    expect(onRefreshNow).toHaveBeenCalledTimes(1);
    expect(onCopyDailyBriefing).toHaveBeenCalledTimes(1);
    expect(onCopyDailyBriefingMarkdown).toHaveBeenCalledTimes(1);
    expect(onCopyDailyBriefingEmailSubject).toHaveBeenCalledTimes(1);
    expect(onCopyDailyBriefingEmailBody).toHaveBeenCalledTimes(1);
    expect(onCopyDailyBriefingHtml).toHaveBeenCalledTimes(1);
    expect(onClearDailyBriefingNote).toHaveBeenCalledTimes(1);
    expect(onClearDailyBriefingEmailRecipients).toHaveBeenCalledTimes(1);
    expect(onClearDailyBriefingEmailCcRecipients).toHaveBeenCalledTimes(1);
    expect(onDeleteDailyBriefingEmailPreset).toHaveBeenCalledWith('custom_ops');
    expect(onMoveDailyBriefingEmailPreset).toHaveBeenNthCalledWith(1, 'custom_beta', 'up');
    expect(onMoveDailyBriefingEmailPreset).toHaveBeenNthCalledWith(2, 'custom_ops', 'down');
    expect(onDownloadDailyBriefingHtml).toHaveBeenCalledTimes(1);
    expect(onExportDailyBriefingPdf).toHaveBeenCalledTimes(1);
    expect(onOpenDailyBriefingMailDraft).toHaveBeenCalledTimes(1);
    expect(onOpenDailyBriefingEmailTemplatePage).toHaveBeenCalledTimes(1);
    expect(onOpenDailyBriefingPreviewDrawer).toHaveBeenCalledTimes(1);
    expect(onOpenDailyBriefingShareCard).toHaveBeenCalledTimes(1);
    expect(onSaveDailyBriefingDistribution).toHaveBeenCalledTimes(1);
    expect(onRunDailyBriefingDryRun).toHaveBeenCalledTimes(1);
    expect(onSendDailyBriefing).toHaveBeenCalledTimes(1);
    expect(onSaveDailyBriefingEmailPreset).toHaveBeenCalledWith('morning_sync');
    expect(onSetDefaultDailyBriefingEmailPreset).toHaveBeenCalledWith('custom_ops');
    expect(onApplyMorningPreset).toHaveBeenCalledTimes(1);
    expect(onToggleAutoRefresh).toHaveBeenCalledTimes(1);
    expect(onSetAutoRefreshInterval).toHaveBeenCalledWith(2 * 60 * 1000);
  });

  it('disables the daily briefing mail draft action until valid recipients are set', () => {
    const onOpenDailyBriefingMailDraft = jest.fn();

    render(
      <WorkbenchOverviewPanels
        autoRefreshSummary={{
          enabled: false,
          intervalOptions: [],
          statusLabel: '自动刷新已关闭',
        }}
        dailyBriefing={{
          headline: '今日先整理研究工作台',
          summary: '先把当前任务同步给团队。',
        }}
        dailyBriefingEmailCcRecipients=""
        dailyBriefingEmailPresets={[]}
        dailyBriefingEmailRecipients="   "
        dailyBriefingNotificationChannelOptions={[
          { id: 'dry_run', label: 'Dry Run', type: 'dry_run', enabled: true, source: 'builtin' },
        ]}
        dailyBriefingDistributionConfig={{
          enabled: false,
          notificationChannels: 'dry_run',
          weekdays: ['mon'],
        }}
        filters={{ reason: '', type: '', source: '', refresh: '', snapshotView: '', snapshotFingerprint: '', snapshotSummary: '', keyword: '' }}
        onCopyViewLink={jest.fn()}
        onOpenDailyBriefingMailDraft={onOpenDailyBriefingMailDraft}
        refreshStats={{
          high: 0,
          medium: 0,
          low: 0,
          resonance: 0,
          biasQualityCore: 0,
          selectionQualityActive: 0,
          reviewContext: 0,
          structuralDecayRadar: 0,
          priorityNew: 0,
          priorityEscalated: 0,
          priorityRelaxed: 0,
          priorityUpdated: 0,
          snapshotViewFiltered: 0,
          snapshotViewScoped: 0,
          peopleLayer: 0,
          departmentChaos: 0,
          selectionQuality: 0,
          policySource: 0,
          biasQuality: 0,
        }}
        setFilters={jest.fn()}
        snapshotSummaryOptions={snapshotSummaryOptions}
        sourceOptions={sourceOptions}
        stats={{ total: 0, status_counts: {} }}
        TYPE_OPTIONS={TYPE_OPTIONS}
        REFRESH_OPTIONS={REFRESH_OPTIONS}
        SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
        REASON_OPTIONS={REASON_OPTIONS}
      />
    );

    const mailDraftButton = screen.getByRole('button', { name: '打开邮件草稿' });
    expect(mailDraftButton.disabled).toBe(true);
    expect(mailDraftButton.getAttribute('title')).toBe('请先设置收件人模板');

    fireEvent.click(mailDraftButton);

    expect(onOpenDailyBriefingMailDraft).not.toHaveBeenCalled();
  });
});
