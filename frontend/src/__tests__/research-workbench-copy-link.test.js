import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import ResearchWorkbench from '../components/ResearchWorkbench';

jest.mock('jspdf', () => {
  const jsPDF = jest.fn(() => {
    const instance = {
      html: jest.fn((element, options) => {
        options?.callback?.(instance);
      }),
      save: jest.fn(),
    };
    return instance;
  });

  return {
    jsPDF,
  };
});

jest.mock('../components/research-workbench/useResearchWorkbenchData', () => jest.fn());
jest.mock('../components/research-workbench/WorkbenchDetailPanel', () => (props) => (
  <div>
    <div>detail-panel</div>
    <div>{props.selectedTaskQueueMeta?.label || ''}</div>
    <div>{props.selectedMatchingQueueMeta?.label || ''}</div>
    <button type="button" onClick={props.handleSelectQueuePrevious}>
      detail-prev
    </button>
    <button type="button" onClick={props.handleSelectQueueNext}>
      detail-next
    </button>
    <button type="button" onClick={props.handleOpenNextTask}>
      detail-open-next
    </button>
    <button type="button" onClick={props.handleSelectMatchingQueuePrevious}>
      detail-mode-prev
    </button>
    <button type="button" onClick={props.handleSelectMatchingQueueNext}>
      detail-mode-next
    </button>
    <button type="button" onClick={props.handleOpenMatchingQueueNext}>
      detail-open-mode-next
    </button>
  </div>
));
jest.mock('../components/research-workbench/WorkbenchTaskCard', () => () => <div>task-card</div>);
jest.mock('../components/research-workbench/WorkbenchOverviewPanels', () => (props) => (
  <div>
    <button type="button" onClick={props.onCopyViewLink}>
      overview-copy-link
    </button>
    <button type="button" onClick={props.onCopyDailyBriefing}>
      overview-copy-briefing
    </button>
    <button type="button" onClick={props.onCopyDailyBriefingMarkdown}>
      overview-copy-briefing-markdown
    </button>
    <button type="button" onClick={props.onCopyDailyBriefingEmailSubject}>
      overview-copy-briefing-email-subject
    </button>
    <button type="button" onClick={props.onCopyDailyBriefingEmailBody}>
      overview-copy-briefing-email
    </button>
    <button type="button" onClick={props.onCopyDailyBriefingHtml}>
      overview-copy-briefing-html
    </button>
    <button type="button" onClick={props.onDownloadDailyBriefingHtml}>
      overview-download-briefing-html
    </button>
    <button type="button" onClick={props.onExportDailyBriefingPdf}>
      overview-export-briefing-pdf
    </button>
    <button type="button" onClick={props.onOpenDailyBriefingEmailTemplatePage}>
      overview-open-email-template
    </button>
    <button type="button" onClick={props.onOpenDailyBriefingMailDraft}>
      overview-open-mailto-draft
    </button>
    <button type="button" onClick={props.onOpenDailyBriefingPreviewDrawer}>
      overview-open-inline-preview
    </button>
    <button type="button" onClick={() => props.onChangeDailyBriefingNote?.('Desk sync at 10:30\nWatch FX drift.')}>
      overview-set-team-note
    </button>
    <button type="button" onClick={() => props.onChangeDailyBriefingEmailRecipients?.('desk@example.com; pm@example.com')}>
      overview-set-email-to
    </button>
    <button type="button" onClick={() => props.onChangeDailyBriefingEmailCcRecipients?.('risk@example.com')}>
      overview-set-email-cc
    </button>
    <button type="button" onClick={() => props.onClearDailyBriefingEmailRecipients?.()}>
      overview-clear-email-to
    </button>
    <button type="button" onClick={() => props.onClearDailyBriefingEmailCcRecipients?.()}>
      overview-clear-email-cc
    </button>
    <button type="button" onClick={() => props.onChangeDailyBriefingEmailPresetName?.('morning_sync', '晨会分发')}>
      overview-rename-email-preset
    </button>
    <button type="button" onClick={() => props.onSaveDailyBriefingEmailPreset?.('morning_sync')}>
      overview-save-email-preset
    </button>
    <button type="button" onClick={() => props.onApplyDailyBriefingEmailPreset?.('morning_sync')}>
      overview-apply-email-preset
    </button>
    <button type="button" onClick={props.onAddDailyBriefingEmailPreset}>
      overview-add-email-preset
    </button>
    {(() => {
      const customPresets = (props.dailyBriefingEmailPresets || []).filter((preset) => preset.id?.startsWith('custom_'));
      const firstCustomPreset = customPresets[0] || null;
      const secondCustomPreset = customPresets[1] || null;
      const alphaPreset = customPresets.find((preset) => preset.name === '自定义分发 Alpha') || firstCustomPreset;

      return (
        <div>
          {firstCustomPreset ? (
            <>
              <button type="button" onClick={() => props.onChangeDailyBriefingEmailPresetName?.(firstCustomPreset.id, '自定义分发 Alpha')}>
                overview-rename-custom-email-preset
              </button>
              <button type="button" onClick={() => props.onSaveDailyBriefingEmailPreset?.(firstCustomPreset.id)}>
                overview-save-custom-email-preset
              </button>
            </>
          ) : null}
          {secondCustomPreset ? (
            <>
              <button type="button" onClick={() => props.onChangeDailyBriefingEmailPresetName?.(secondCustomPreset.id, '自定义分发 Beta')}>
                overview-rename-second-custom-email-preset
              </button>
              <button type="button" onClick={() => props.onMoveDailyBriefingEmailPreset?.(secondCustomPreset.id, 'up')}>
                overview-move-second-custom-email-preset-up
              </button>
            </>
          ) : null}
          {alphaPreset ? (
            <>
              <button type="button" onClick={() => props.onApplyDailyBriefingEmailPreset?.(alphaPreset.id)}>
                overview-apply-custom-email-preset
              </button>
              <button type="button" onClick={() => props.onSetDefaultDailyBriefingEmailPreset?.(alphaPreset.id)}>
                overview-set-default-custom-email-preset
              </button>
              <button type="button" onClick={() => props.onDeleteDailyBriefingEmailPreset?.(alphaPreset.id)}>
                overview-delete-custom-email-preset
              </button>
            </>
          ) : null}
        </div>
      );
    })()}
    <button type="button" onClick={() => props.onClearDailyBriefingNote?.()}>
      overview-clear-team-note
    </button>
    <button type="button" onClick={props.onOpenDailyBriefingShareCard}>
      overview-open-share-card
    </button>
    <button type="button" onClick={props.onApplyMorningPreset}>
      overview-apply-morning-preset
    </button>
    <button type="button" onClick={props.onOpenQueueLead}>
      overview-open-lead
    </button>
    <button type="button" onClick={props.onOpenQueuePricing}>
      overview-open-pricing
    </button>
    <button type="button" onClick={props.onOpenQueueCrossMarket}>
      overview-open-cross
    </button>
  </div>
));
jest.mock('../components/research-workbench/WorkbenchBoardSection', () => (props) => (
  <button type="button" onClick={props.onCopyViewLink}>
    board-copy-link
  </button>
));
jest.mock('../services/api', () => ({
  addResearchTaskComment: jest.fn(),
  bulkUpdateResearchTasks: jest.fn(),
  deleteResearchTask: jest.fn(),
  deleteResearchTaskComment: jest.fn(),
  getInfrastructureStatus: jest.fn(),
  getResearchBriefingDistribution: jest.fn(),
  reorderResearchBoard: jest.fn(),
  runResearchBriefingDryRun: jest.fn(),
  sendResearchBriefing: jest.fn(),
  updateResearchBriefingDistribution: jest.fn(),
  updateResearchTask: jest.fn(),
}));
jest.mock('../utils/macroMispricingDraft', () => ({
  buildMacroMispricingDraft: jest.fn(),
  saveMacroMispricingDraft: jest.fn(),
}));
jest.mock('../utils/researchContext', () => {
  const actual = jest.requireActual('../utils/researchContext');
  return {
    ...actual,
    buildCrossMarketLink: jest.fn(),
    navigateByResearchAction: jest.fn(),
    navigateToAppUrl: jest.fn(),
  };
});
jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  return {
    ...actual,
    Drawer: ({ children, title, extra, open, onClose }) => (open ? (
      <div>
        <div>{title}</div>
        {extra}
        <button type="button" onClick={onClose}>
          drawer-close
        </button>
        <div>{children}</div>
      </div>
    ) : null),
    Row: ({ children }) => <div>{children}</div>,
    Col: ({ children }) => <div>{children}</div>,
  };
});

const mockMessageApi = {
  success: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
};

jest.mock('../utils/messageApi', () => ({
  useSafeMessageApi: () => mockMessageApi,
}));

const useResearchWorkbenchData = require('../components/research-workbench/useResearchWorkbenchData');
const { bulkUpdateResearchTasks } = require('../services/api');
const { navigateByResearchAction } = require('../utils/researchContext');
const { jsPDF } = require('jspdf');
const DAILY_BRIEFING_CC_STORAGE_KEY = 'research_workbench_daily_briefing_cc_v1';
const DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY = 'research_workbench_daily_briefing_default_email_preset_v1';
const DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY = 'research_workbench_daily_briefing_email_presets_v1';
const DAILY_BRIEFING_NOTE_STORAGE_KEY = 'research_workbench_daily_briefing_note_v1';
const DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY = 'research_workbench_daily_briefing_recipients_v1';

const buildWorkbenchHookState = (overrides = {}) => ({
  applyMorningPreset: jest.fn(() => true),
  archivedTasks: [],
  autoRefreshSummary: {
    enabled: true,
    intervalMs: 5 * 60 * 1000,
    intervalLabel: '5 分钟',
    intervalOptions: [
      { label: '2 分钟', value: 2 * 60 * 1000 },
      { label: '5 分钟', value: 5 * 60 * 1000 },
    ],
    lastRefreshLabel: '09:30 · 刚刚',
    lastRefreshTriggerLabel: '手动刷新',
    nextRefreshLabel: '下一次预计 09:35',
    documentVisible: true,
    isRefreshing: false,
    statusLabel: '5 分钟 自动刷新中',
  },
  boardColumns: [],
  detailLoading: false,
  dragState: null,
  filters: {
    type: 'pricing',
    source: 'godeye',
    refresh: 'high',
    reason: 'priority_relaxed',
    keyword: 'hedge',
  },
  filteredTasks: [
    { id: 'task_2', status: 'new' },
    { id: 'task_3', status: 'blocked' },
  ],
  latestSnapshotComparison: null,
  loadTaskDetail: jest.fn(),
  loadWorkbench: jest.fn(),
  loading: false,
  morningPresetActive: false,
  morningPresetCandidate: {
    label: '晨间默认视图：自动排序升档',
    note: '先看今天刚升档的任务。',
    filters: { reason: 'priority_escalated' },
  },
  morningPresetSummary: null,
  openTaskPriorityLabel: '',
  openTaskPriorityNote: '',
  refreshCurrentTask: jest.fn(),
  refreshSignals: { byTaskId: {} },
  refreshStats: { high: 1, medium: 0, low: 0, priorityNew: 0, priorityEscalated: 0, priorityRelaxed: 1, priorityUpdated: 0 },
  selectedTask: null,
  selectedTaskId: 'task_2',
  selectedTaskRefreshSignal: null,
  selectedTaskPriorityEventPayload: null,
  selectedTaskPriorityMeta: null,
  setAutoRefreshEnabled: jest.fn(),
  setAutoRefreshIntervalMs: jest.fn(),
  setDragState: jest.fn(),
  setFilters: jest.fn(),
  setSelectedTaskId: jest.fn(),
  setShowAllTimeline: jest.fn(),
  setShowArchived: jest.fn(),
  showAllTimeline: false,
  showArchived: false,
  sourceOptions: [{ label: 'GodEye', value: 'godeye' }],
  stats: { total: 1, status_counts: { new: 1 } },
  tasks: [],
  setTasks: jest.fn(),
  timeline: [],
  timelineItems: [],
  ...overrides,
});

describe('ResearchWorkbench copy current view link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState());
    window.history.replaceState(null, '', '/?view=workbench');
  });

  it('copies the current workbench view link with active filters', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    const view = render(<ResearchWorkbench />);

    const contextRail = screen.getByText('当前视图与下一步').closest('.app-page-context-rail');

    expect(screen.getByText('当前视图与下一步')).toBeTruthy();
    expect(within(contextRail).getByText('快速视图：自动排序缓和 · 关键词：hedge · 更新级别：建议更新 · 类型：Pricing · 来源：GodEye')).toBeTruthy();
    expect(within(contextRail).getByText('当前定位：task_2')).toBeTruthy();
    expect(screen.getByText('打开这个链接后，工作台会恢复到同一组筛选条件和当前任务焦点。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-link' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedUrl = clipboardWriteText.mock.calls[0][0];
    expect(copiedUrl).toContain('view=workbench');
    expect(copiedUrl).toContain('workbench_refresh=high');
    expect(copiedUrl).toContain('workbench_type=pricing');
    expect(copiedUrl).toContain('workbench_source=godeye');
    expect(copiedUrl).toContain('workbench_reason=priority_relaxed');
    expect(copiedUrl).toContain('workbench_keyword=hedge');
    expect(copiedUrl).toContain('task=task_2');
    expect(mockMessageApi.success).toHaveBeenCalledWith('当前工作台视图链接已复制');
  });

  it('copies the daily briefing with current view context and link', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    const view = render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedBriefing = clipboardWriteText.mock.calls[0][0];
    expect(copiedBriefing).toContain('研究工作台每日简报');
    expect(copiedBriefing).toContain('今日先看 定价研究 · AAPL · Current Task');
    expect(copiedBriefing).toContain('晨间视图：晨间默认视图：自动排序升档');
    expect(copiedBriefing).toContain('当前视图：快速视图：自动排序缓和 · 关键词：hedge · 更新级别：建议更新 · 类型：Pricing · 来源：GodEye');
    expect(copiedBriefing).toContain('打开工作台：http://localhost/?view=workbench');
    expect(mockMessageApi.success).toHaveBeenCalledWith('今日简报已复制');
  });

  it('copies the markdown daily briefing', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    const view = render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing-markdown' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedBriefing = clipboardWriteText.mock.calls[0][0];
    expect(copiedBriefing).toContain('# 研究工作台每日简报');
    expect(copiedBriefing).toContain('## 今日先看 定价研究 · AAPL · Current Task');
    expect(copiedBriefing).toContain('- 晨间视图: 晨间默认视图：自动排序升档');
    expect(copiedBriefing).toContain('[打开工作台](http://localhost/?view=workbench');
    expect(mockMessageApi.success).toHaveBeenCalledWith('Markdown 简报已复制');
  });

  it('copies the daily briefing email body', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing-email' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedEmailBody = clipboardWriteText.mock.calls[0][0];
    expect(copiedEmailBody).toContain('各位好，');
    expect(copiedEmailBody).toContain('邮件主题：Super Pricing System · Research Workbench | 今日先看 定价研究 · AAPL · Current Task');
    expect(copiedEmailBody).toContain('团队备注：Desk sync at 10:30');
    expect(copiedEmailBody).toContain('工作台链接：http://localhost/?view=workbench');
    expect(mockMessageApi.success).toHaveBeenCalledWith('邮件正文已复制');
  });

  it('copies the daily briefing email subject', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing-email-subject' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    expect(clipboardWriteText.mock.calls[0][0]).toBe('Super Pricing System · Research Workbench | 今日先看 定价研究 · AAPL · Current Task');
    expect(mockMessageApi.success).toHaveBeenCalledWith('邮件主题已复制');
  });

  it('copies the html daily briefing share document', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing-html' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedHtml = clipboardWriteText.mock.calls[0][0];
    expect(copiedHtml).toContain('<!DOCTYPE html>');
    expect(copiedHtml).toContain('<title>研究工作台每日简报 - 今日先看 定价研究 · AAPL · Current Task</title>');
    expect(copiedHtml).toContain('Research Workbench Daily Briefing');
    expect(copiedHtml).toContain('晨间默认视图：自动排序升档');
    expect(copiedHtml).toContain('打开当前工作台视图');
    expect(copiedHtml).toContain('http://localhost/?view=workbench');
    expect(mockMessageApi.success).toHaveBeenCalledWith('HTML 简报已复制');
  });

  it('persists the team note and includes it in markdown exports', async () => {
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));

    await waitFor(() => {
      expect(window.localStorage.getItem(DAILY_BRIEFING_NOTE_STORAGE_KEY)).toBe('Desk sync at 10:30\nWatch FX drift.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'overview-copy-briefing-markdown' }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedBriefing = clipboardWriteText.mock.calls[0][0];
    expect(copiedBriefing).toContain('- 抬头: Super Pricing System · Research Workbench');
    expect(copiedBriefing).toContain('- 导出时间: ');
    expect(copiedBriefing).toContain('### 团队备注');
    expect(copiedBriefing).toContain('Desk sync at 10:30');
    expect(copiedBriefing).toContain('Watch FX drift.');
  });

  it('adds, sorts, defaults, reapplies, and deletes custom email distribution presets', async () => {
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    const view = render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-add-email-preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-add-email-preset' }));

    await waitFor(() => {
      const storedPresets = JSON.parse(window.localStorage.getItem(DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY));
      const customPresets = storedPresets.filter((preset) => preset.id.startsWith('custom_'));
      expect(customPresets).toHaveLength(2);
      expect(customPresets[0]).toMatchObject({
        name: '自定义分发 1',
        toRecipients: '',
        ccRecipients: '',
      });
      expect(customPresets[1]).toMatchObject({
        name: '自定义分发 2',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-to' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-rename-custom-email-preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-save-custom-email-preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-rename-second-custom-email-preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-move-second-custom-email-preset-up' }));

    await waitFor(() => {
      const storedPresets = JSON.parse(window.localStorage.getItem(DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY));
      const customPresets = storedPresets.filter((preset) => preset.id.startsWith('custom_'));
      expect(customPresets[0]).toMatchObject({
        name: '自定义分发 Beta',
      });
      expect(customPresets[1]).toMatchObject({
        name: '自定义分发 Alpha',
        toRecipients: 'desk@example.com; pm@example.com',
        ccRecipients: 'risk@example.com',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-default-custom-email-preset' }));

    await waitFor(() => {
      expect(window.localStorage.getItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY)).toMatch(/^custom_/);
    });

    fireEvent.click(screen.getByRole('button', { name: 'overview-clear-email-to' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-clear-email-cc' }));

    await waitFor(() => {
      expect(window.localStorage.getItem(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY)).toBe('');
      expect(window.localStorage.getItem(DAILY_BRIEFING_CC_STORAGE_KEY)).toBe('');
    });

    view.unmount();
    render(<ResearchWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: 'overview-open-inline-preview' }));

    expect(mockMessageApi.success).toHaveBeenCalledWith('已新增自定义分发预设：自定义分发 1');
    expect(mockMessageApi.success).toHaveBeenCalledWith('已新增自定义分发预设：自定义分发 2');
    expect(mockMessageApi.success).toHaveBeenCalledWith('已保存分发预设：自定义分发 Alpha');
    expect(mockMessageApi.success).toHaveBeenCalledWith('已设为默认分发预设：自定义分发 Alpha');
    expect(screen.getByText(/收件人模板：desk@example.com; pm@example.com/)).toBeTruthy();
    expect(screen.getByText(/抄送模板：risk@example.com/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'overview-delete-custom-email-preset' }));

    await waitFor(() => {
      const storedPresets = JSON.parse(window.localStorage.getItem(DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY));
      expect(storedPresets.some((preset) => preset.name === '自定义分发 Alpha')).toBe(false);
      expect(window.localStorage.getItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY)).toBeNull();
    });

    expect(mockMessageApi.success).toHaveBeenCalledWith('已删除分发预设：自定义分发 Alpha');
  });

  it('opens the visual daily briefing share card', () => {
    const documentWrite = jest.fn();
    const documentClose = jest.fn();
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => ({
      document: {
        write: documentWrite,
        close: documentClose,
      },
    }));

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-share-card' }));

    expect(windowOpen).toHaveBeenCalledWith('', '_blank', 'noopener,noreferrer,width=960,height=760');
    expect(documentWrite).toHaveBeenCalledTimes(1);
    const openedHtml = documentWrite.mock.calls[0][0];
    expect(openedHtml).toContain('研究工作台每日简报');
    expect(openedHtml).toContain('今日先看 定价研究 · AAPL · Current Task');
    expect(openedHtml).toContain('最近刷新 09:30 · 刚刚');
    expect(openedHtml).toContain('打开当前工作台视图');
    expect(documentClose).toHaveBeenCalledTimes(1);

    windowOpen.mockRestore();
  });

  it('opens the daily briefing email template page', () => {
    const documentWrite = jest.fn();
    const documentClose = jest.fn();
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => ({
      document: {
        write: documentWrite,
        close: documentClose,
      },
    }));

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-to' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-open-email-template' }));

    expect(windowOpen).toHaveBeenCalledWith('', '_blank', 'noopener,noreferrer,width=980,height=820');
    expect(documentWrite).toHaveBeenCalledTimes(1);
    const openedHtml = documentWrite.mock.calls[0][0];
    expect(openedHtml).toContain('研究工作台邮件模板');
    expect(openedHtml).toContain('邮件主题');
    expect(openedHtml).toContain('Desk sync at 10:30');
    expect(openedHtml).toContain('邮件分发');
    expect(openedHtml).toContain('desk@example.com, pm@example.com');
    expect(openedHtml).toContain('risk@example.com');
    expect(openedHtml).toContain('打开当前工作台视图');
    expect(documentClose).toHaveBeenCalledTimes(1);

    windowOpen.mockRestore();
  });

  it('opens the daily briefing mailto draft', () => {
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => ({}));

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-to' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-open-mailto-draft' }));

    expect(windowOpen).toHaveBeenCalledTimes(1);
    const [mailtoUrl, target, features] = windowOpen.mock.calls[0];
    expect(window.localStorage.getItem(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY)).toBe('desk@example.com; pm@example.com');
    expect(window.localStorage.getItem(DAILY_BRIEFING_CC_STORAGE_KEY)).toBe('risk@example.com');
    expect(mailtoUrl).toContain('mailto:desk%40example.com,pm%40example.com?');
    expect(mailtoUrl).toContain('cc=risk%40example.com');
    expect(mailtoUrl).toContain('subject=Super+Pricing+System');
    expect(mailtoUrl).toContain('%E5%90%84%E4%BD%8D%E5%A5%BD');
    expect(mailtoUrl).toContain('Desk+sync+at+10%3A30');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
    expect(mockMessageApi.success).toHaveBeenCalledWith('已尝试打开邮件草稿');

    windowOpen.mockRestore();
  });

  it('warns before opening the daily briefing mail draft without recipients', () => {
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => ({}));

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-mailto-draft' }));

    expect(windowOpen).not.toHaveBeenCalled();
    expect(mockMessageApi.warning).toHaveBeenCalledWith('请先设置收件人模板，再打开邮件草稿');

    windowOpen.mockRestore();
  });

  it('treats whitespace-only daily briefing recipients as missing before opening mail draft', () => {
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => ({}));
    window.localStorage.setItem(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY, '   ');

    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-mailto-draft' }));

    expect(windowOpen).not.toHaveBeenCalled();
    expect(mockMessageApi.warning).toHaveBeenCalledWith('请先设置收件人模板，再打开邮件草稿');

    windowOpen.mockRestore();
  });

  it('downloads the html daily briefing as a file', () => {
    const createObjectURL = jest.fn(() => 'blob:briefing');
    const revokeObjectURL = jest.fn();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const click = jest.fn();
    anchor.click = click;
    const createElement = jest.spyOn(document, 'createElement').mockImplementation((tagName) => (
      tagName === 'a' ? anchor : originalCreateElement(tagName)
    ));

    try {
      useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
        selectedTask: {
          id: 'task_2',
          type: 'pricing',
          title: 'Current Task',
          symbol: 'AAPL',
          status: 'new',
        },
        morningPresetActive: true,
        morningPresetSummary: {
          label: '晨间默认视图：自动排序升档',
          note: '先看今天刚升档的任务。',
        },
      }));

      render(<ResearchWorkbench />);

      fireEvent.click(screen.getByRole('button', { name: 'overview-download-briefing-html' }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchor.href).toBe('blob:briefing');
      expect(anchor.download).toMatch(/^research-workbench-daily-briefing-\d{4}-\d{2}-\d{2}-aapl\.html$/);
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.body.contains(anchor)).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:briefing');
      expect(mockMessageApi.success).toHaveBeenCalledWith(expect.stringMatching(/^HTML 简报已下载：research-workbench-daily-briefing-/));
    } finally {
      createElement.mockRestore();
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('exports the daily briefing as a pdf', async () => {
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-export-briefing-pdf' }));

    await waitFor(() => {
      expect(jsPDF).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem(DAILY_BRIEFING_NOTE_STORAGE_KEY)).toBe('Desk sync at 10:30\nWatch FX drift.');
  });

  it('opens the inline daily briefing preview drawer', async () => {
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      morningPresetActive: true,
      morningPresetSummary: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-set-team-note' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-to' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-set-email-cc' }));
    fireEvent.click(screen.getByRole('button', { name: 'overview-open-inline-preview' }));

    expect(screen.getByText('每日简报预览')).toBeTruthy();
    expect(screen.getByText('当前分享卡片 HTML、PDF 与下载文件共用这份内容。')).toBeTruthy();
    expect(screen.getByText(/导出时间：/)).toBeTruthy();
    expect(screen.getByText(/收件人模板：desk@example.com; pm@example.com/)).toBeTruthy();
    expect(screen.getByText(/抄送模板：risk@example.com/)).toBeTruthy();
    expect(screen.getByText(/邮件主题：Super Pricing System/)).toBeTruthy();
    expect(screen.getByText('邮件草稿：已生成，可用上方“打开邮件草稿”创建本地邮件')).toBeTruthy();
    expect(screen.queryByText(/邮件草稿：mailto:/)).toBeNull();
    expect(screen.getByText(/团队备注：Desk sync at 10:30/)).toBeTruthy();

    const previewFrame = screen.getByTitle('研究工作台每日简报预览');
    expect(previewFrame.getAttribute('srcdoc')).toContain('Research Workbench Daily Briefing');
    expect(previewFrame.getAttribute('srcdoc')).toContain('Desk sync at 10:30');

    fireEvent.click(screen.getByRole('button', { name: 'drawer-close' }));

    await waitFor(() => {
      expect(screen.queryByText('每日简报预览')).toBeNull();
    });
  });

  it('marks the inline daily briefing mail draft as incomplete without recipients', () => {
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-inline-preview' }));

    expect(screen.getByText('邮件草稿：已生成，但尚未设置收件人模板；可先补全收件人后再打开邮件草稿')).toBeTruthy();
    expect(screen.queryByText(/邮件草稿：mailto:/)).toBeNull();
  });

  it('reapplies the morning default view from the overview action', () => {
    const applyMorningPreset = jest.fn(() => true);
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      applyMorningPreset,
      morningPresetActive: false,
      morningPresetCandidate: {
        label: '晨间默认视图：自动排序升档',
        note: '先看今天刚升档的任务。',
        filters: { reason: 'priority_escalated' },
      },
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-apply-morning-preset' }));

    expect(applyMorningPreset).toHaveBeenCalledWith({ source: 'manual' });
    expect(mockMessageApi.success).toHaveBeenCalledWith('已切回晨间默认视图：自动排序升档');
  });

  it('warns when the environment does not support clipboard copying', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'board-copy-link' }));

    await waitFor(() => {
      expect(mockMessageApi.warning).toHaveBeenCalledWith('当前环境不支持复制工作台链接');
    });
  });

  it('shows default shared-view copy when no filter is active', () => {
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      filters: {
        type: '',
        source: '',
        refresh: '',
        reason: '',
        keyword: '',
      },
      filteredTasks: [],
      selectedTaskId: '',
    }));

    render(<ResearchWorkbench />);

    expect(screen.getByText('全部任务视图')).toBeTruthy();
    expect(screen.getByText('当前没有额外筛选，分享后会打开完整工作台视图。')).toBeTruthy();
  });

  it('bulk queues filtered tasks into in-progress status', async () => {
    bulkUpdateResearchTasks.mockResolvedValue({ total: 2, data: [] });
    const refreshCurrentTask = jest.fn().mockResolvedValue(undefined);
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({ refreshCurrentTask }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: '批量推进到进行中 (2)' }));

    await waitFor(() => {
      expect(bulkUpdateResearchTasks).toHaveBeenCalledWith({
        task_ids: ['task_2', 'task_3'],
        status: 'in_progress',
      });
    });
    expect(mockMessageApi.success).toHaveBeenCalledWith('已将 2 个任务推进到进行中');
    expect(refreshCurrentTask).toHaveBeenCalled();
  });

  it('bulk writes review comments for the current filtered view', async () => {
    bulkUpdateResearchTasks.mockResolvedValue({ total: 2, data: [] });
    const refreshCurrentTask = jest.fn().mockResolvedValue(undefined);
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({ refreshCurrentTask }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: '批量写入复盘评论 (2)' }));

    await waitFor(() => {
      expect(bulkUpdateResearchTasks).toHaveBeenCalledWith({
        task_ids: ['task_2', 'task_3'],
        comment: '批量复盘：快速视图：自动排序缓和 · 关键词：hedge · 更新级别：建议更新 · 类型：Pricing · 来源：GodEye · 当前定位：task_2',
        author: 'local',
      });
    });
    expect(mockMessageApi.success).toHaveBeenCalledWith('已为 2 个任务写入复盘评论');
    expect(refreshCurrentTask).toHaveBeenCalled();
  });

  it('moves within the current filtered queue from detail navigation', () => {
    const setSelectedTaskId = jest.fn();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      selectedTaskId: 'task_2',
      filteredTasks: [
        { id: 'task_1', title: 'Previous Task', type: 'pricing', symbol: 'MSFT', status: 'new' },
        { id: 'task_2', title: 'Current Task', type: 'pricing', symbol: 'AAPL', status: 'new' },
        { id: 'task_3', title: 'Next Task', type: 'cross_market', template: 'growth_template', status: 'new' },
      ],
      setSelectedTaskId,
    }));

    render(<ResearchWorkbench />);

    expect(screen.getByText('第 2 / 3 条')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'detail-prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'detail-next' }));

    expect(setSelectedTaskId).toHaveBeenNthCalledWith(1, 'task_1');
    expect(setSelectedTaskId).toHaveBeenNthCalledWith(2, 'task_3');
  });

  it('opens the next queue task with preserved workbench filters in the url context', () => {
    const setSelectedTaskId = jest.fn();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      selectedTaskId: 'task_2',
      filteredTasks: [
        { id: 'task_2', title: 'Current Task', type: 'pricing', symbol: 'AAPL', status: 'new' },
        { id: 'task_3', title: 'Next Task', type: 'cross_market', template: 'growth_template', status: 'new' },
      ],
      setSelectedTaskId,
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'detail-open-next' }));

    expect(setSelectedTaskId).toHaveBeenCalledWith('task_3');
    expect(navigateByResearchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'cross-market',
        template: 'growth_template',
        source: 'research_workbench',
      }),
      expect.stringContaining('task=task_3')
    );
    expect(navigateByResearchAction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining('workbench_reason=priority_relaxed')
    );
  });

  it('opens the next task in the same execution mode queue', () => {
    const setSelectedTaskId = jest.fn();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_2',
        type: 'pricing',
        title: 'Current Pricing Task',
        symbol: 'AAPL',
        status: 'new',
      },
      selectedTaskId: 'task_2',
      filteredTasks: [
        { id: 'task_1', title: 'Cross Queue Lead', type: 'cross_market', template: 'macro_theme', status: 'new' },
        { id: 'task_2', title: 'Current Pricing Task', type: 'pricing', symbol: 'AAPL', status: 'new' },
        { id: 'task_4', title: 'Next Pricing Task', type: 'pricing', symbol: 'NVDA', status: 'new' },
      ],
      setSelectedTaskId,
    }));

    render(<ResearchWorkbench />);

    expect(screen.getByText('第 1 / 2 条')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'detail-open-mode-next' }));

    expect(setSelectedTaskId).toHaveBeenCalledWith('task_4');
    expect(navigateByResearchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'pricing',
        symbol: 'NVDA',
        source: 'research_workbench',
      }),
      expect.stringContaining('task=task_4')
    );
  });

  it('opens the first pricing task from the current filtered queue via overview actions', () => {
    const setSelectedTaskId = jest.fn();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_9',
        type: 'cross_market',
        title: 'Current Task',
        template: 'macro_theme',
        status: 'new',
      },
      selectedTaskId: 'task_9',
      filteredTasks: [
        { id: 'task_4', title: 'Cross Task', type: 'cross_market', template: 'macro_theme', status: 'new' },
        { id: 'task_5', title: 'Pricing Task', type: 'pricing', symbol: 'NVDA', status: 'new' },
      ],
      setSelectedTaskId,
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-pricing' }));

    expect(setSelectedTaskId).toHaveBeenCalledWith('task_5');
    expect(navigateByResearchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'pricing',
        symbol: 'NVDA',
        source: 'research_workbench',
      }),
      expect.stringContaining('task=task_5')
    );
  });

  it('opens the queue lead task from overview actions', () => {
    const setSelectedTaskId = jest.fn();
    useResearchWorkbenchData.mockReturnValue(buildWorkbenchHookState({
      selectedTask: {
        id: 'task_9',
        type: 'pricing',
        title: 'Current Task',
        symbol: 'AAPL',
        status: 'new',
      },
      selectedTaskId: 'task_9',
      filteredTasks: [
        { id: 'task_6', title: 'Lead Task', type: 'cross_market', template: 'defensive_beta_hedge', status: 'new' },
        { id: 'task_7', title: 'Next Task', type: 'pricing', symbol: 'MSFT', status: 'new' },
      ],
      setSelectedTaskId,
    }));

    render(<ResearchWorkbench />);

    fireEvent.click(screen.getByRole('button', { name: 'overview-open-lead' }));

    expect(setSelectedTaskId).toHaveBeenCalledWith('task_6');
    expect(navigateByResearchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'cross-market',
        template: 'defensive_beta_hedge',
        source: 'research_workbench',
      }),
      expect.stringContaining('task=task_6')
    );
  });
});
