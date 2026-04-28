import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  Drawer,
  Row,
  Space,
  Typography,
} from 'antd';

import {
  addResearchTaskComment,
  bulkUpdateResearchTasks,
  deleteResearchTask,
  deleteResearchTaskComment,
  getInfrastructureStatus,
  getResearchBriefingDistribution,
  reorderResearchBoard,
  runResearchBriefingDryRun,
  sendResearchBriefing,
  updateResearchBriefingDistribution,
  updateResearchTask,
} from '../services/api';
import {
  buildCrossMarketLink,
  buildWorkbenchLink,
  navigateByResearchAction,
  navigateToAppUrl,
} from '../utils/researchContext';
import { useSafeMessageApi } from '../utils/messageApi';
import { buildMacroMispricingDraft, saveMacroMispricingDraft } from '../utils/macroMispricingDraft';
import WorkbenchBoardSection from './research-workbench/WorkbenchBoardSection';
import WorkbenchDetailPanel from './research-workbench/WorkbenchDetailPanel';
import WorkbenchOverviewPanels from './research-workbench/WorkbenchOverviewPanels';
import WorkbenchShell from './research-workbench/WorkbenchShell';
import WorkbenchTaskCard from './research-workbench/WorkbenchTaskCard';
import useResearchWorkbenchData from './research-workbench/useResearchWorkbenchData';
import {
  buildBoardReorderItems,
  buildOpenTaskPriorityNote,
  buildRefreshPriorityEventPayload,
  buildRefreshPriorityMeta,
} from './research-workbench/workbenchSelectors';
import {
  buildWorkbenchDailyBriefingEmailDocument,
  buildWorkbenchDailyBriefingEmailSubject,
  buildWorkbenchDailyBriefingEmailText,
  buildWorkbenchDailyBriefingMailtoUrl,
  buildWorkbenchDailyBriefingMarkdown,
  buildWorkbenchDailyBriefingFilename,
  buildWorkbenchDailyBriefingShareDocument,
  buildWorkbenchDailyBriefingText,
  buildWorkbenchViewSummary,
  moveBoardTask,
  normalizeBoardOrders,
  orderWorkbenchQueueTasks,
  REASON_OPTIONS,
  REFRESH_OPTIONS,
  SNAPSHOT_VIEW_OPTIONS,
  TYPE_OPTIONS,
} from './research-workbench/workbenchUtils';

const DAILY_BRIEFING_BRAND_LABEL = 'Super Pricing System · Research Workbench';
const DAILY_BRIEFING_CC_STORAGE_KEY = 'research_workbench_daily_briefing_cc_v1';
const DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY = 'research_workbench_daily_briefing_default_email_preset_v1';
const DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY = 'research_workbench_daily_briefing_email_presets_v1';
const DAILY_BRIEFING_NOTE_STORAGE_KEY = 'research_workbench_daily_briefing_note_v1';
const DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY = 'research_workbench_daily_briefing_recipients_v1';
const DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX = 'custom_';
const DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH = 24;
const DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX = '自定义分发';
const DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const { Text } = Typography;
const DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS = [
  {
    id: 'morning_sync',
    name: '晨会',
    toRecipients: '',
    ccRecipients: '',
  },
  {
    id: 'risk_sync',
    name: '风险同步',
    toRecipients: '',
    ccRecipients: '',
  },
  {
    id: 'management_brief',
    name: '管理层简报',
    toRecipients: '',
    ccRecipients: '',
  },
];

const TASK_TYPE_LABELS = {
  cross_market: '跨市场',
  macro_mispricing: '宏观错价',
  pricing: '定价研究',
  trade_thesis: '交易论点',
};

function readDailyBriefingTeamNote() {
  return readDailyBriefingLocalValue(DAILY_BRIEFING_NOTE_STORAGE_KEY);
}

function readDailyBriefingLocalValue(storageKey) {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(storageKey) || '';
  } catch (error) {
    return '';
  }
}

function normalizeDailyBriefingEmailPresets(rawPresets = []) {
  const rawPresetList = Array.isArray(rawPresets) ? rawPresets : [];
  const defaultPresetIds = new Set(DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.map((item) => item.id));
  const presetMap = new Map(
    rawPresetList
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
  const normalizedDefaultPresets = DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.map((defaultPreset) => {
    const storedPreset = presetMap.get(defaultPreset.id) || {};
    const normalizedName = String(storedPreset.name || '').trim().slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH);
    return {
      id: defaultPreset.id,
      name: normalizedName || defaultPreset.name,
      toRecipients: typeof storedPreset.toRecipients === 'string' ? storedPreset.toRecipients : '',
      ccRecipients: typeof storedPreset.ccRecipients === 'string' ? storedPreset.ccRecipients : '',
    };
  });
  const normalizedCustomPresets = rawPresetList
    .filter((item) => item?.id && !defaultPresetIds.has(item.id))
    .map((item, index) => {
      const normalizedName = String(item.name || '').trim().slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH);
      return {
        id: item.id,
        name: normalizedName || `${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index + 1}`,
        toRecipients: typeof item.toRecipients === 'string' ? item.toRecipients : '',
        ccRecipients: typeof item.ccRecipients === 'string' ? item.ccRecipients : '',
      };
    });

  return [...normalizedDefaultPresets, ...normalizedCustomPresets];
}

function readDailyBriefingEmailPresets() {
  const rawValue = readDailyBriefingLocalValue(DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY);

  if (!rawValue) {
    return normalizeDailyBriefingEmailPresets();
  }

  try {
    return normalizeDailyBriefingEmailPresets(JSON.parse(rawValue));
  } catch (error) {
    return normalizeDailyBriefingEmailPresets();
  }
}

function parseDailyBriefingNotificationChannels(value = '') {
  const rawChannels = Array.isArray(value)
    ? value
    : String(value || 'dry_run').split(/[\s,;]+/);
  const channels = rawChannels
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return channels.length ? channels : ['dry_run'];
}

function normalizeDailyBriefingNotificationChannelOptions(channels = []) {
  const optionMap = new Map();
  (Array.isArray(channels) ? channels : []).forEach((channel) => {
    const id = String(channel?.id || '').trim();
    if (!id || optionMap.has(id)) {
      return;
    }
    optionMap.set(id, {
      id,
      type: channel.type || 'dry_run',
      label: channel.label || id,
      enabled: channel.enabled !== false,
      source: channel.source || '',
    });
  });
  if (!optionMap.has('dry_run')) {
    optionMap.set('dry_run', {
      id: 'dry_run',
      type: 'dry_run',
      label: 'Dry Run',
      enabled: true,
      source: 'builtin',
    });
  }
  return Array.from(optionMap.values());
}

function normalizeDailyBriefingSchedule(schedule = {}) {
  const raw = schedule || {};
  return {
    enabled: Boolean(raw.enabled),
    status: raw.status || 'disabled',
    timezone: raw.timezone || 'Asia/Shanghai',
    sendTime: raw.send_time || raw.sendTime || '09:00',
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    nextRunAt: raw.next_run_at || raw.nextRunAt || '',
    nextRunLabel: raw.next_run_label || raw.nextRunLabel || '自动分发未启用',
    reason: raw.reason || '',
  };
}

function normalizeServerDailyBriefingDistribution(distribution = {}) {
  const raw = distribution || {};
  return {
    enabled: Boolean(raw.enabled),
    sendTime: raw.send_time || raw.sendTime || '09:00',
    timezone: raw.timezone || 'Asia/Shanghai',
    weekdays: Array.isArray(raw.weekdays) && raw.weekdays.length
      ? raw.weekdays
      : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    notificationChannels: parseDailyBriefingNotificationChannels(raw.notification_channels || raw.notificationChannels),
    defaultPresetId: raw.default_preset_id || raw.defaultPresetId || '',
    presets: normalizeDailyBriefingEmailPresets(
      (raw.presets || []).map((preset) => ({
        id: preset.id,
        name: preset.name,
        toRecipients: preset.to_recipients || preset.toRecipients || '',
        ccRecipients: preset.cc_recipients || preset.ccRecipients || '',
      }))
    ),
    toRecipients: raw.to_recipients || raw.toRecipients || '',
    ccRecipients: raw.cc_recipients || raw.ccRecipients || '',
    teamNote: raw.team_note || raw.teamNote || '',
  };
}

function matchesDailyBriefingEmailPreset(preset, toRecipients = '', ccRecipients = '') {
  if (!preset) {
    return false;
  }

  return (preset.toRecipients || '').trim() === String(toRecipients || '').trim()
    && (preset.ccRecipients || '').trim() === String(ccRecipients || '').trim();
}

function isDefaultDailyBriefingEmailPresetId(presetId = '') {
  return DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.some((item) => item.id === presetId);
}

function buildNextCustomDailyBriefingPresetName(existingPresets = []) {
  const existingNames = new Set((existingPresets || []).map((preset) => String(preset?.name || '').trim()));
  let index = 1;

  while (existingNames.has(`${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`)) {
    index += 1;
  }

  return `${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`;
}

function buildDailyBriefingCustomPresetId() {
  return `${DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function moveDailyBriefingCustomPresetOrder(presets = [], presetId = '', direction = 'up') {
  const fixedPresets = (presets || []).filter((preset) => isDefaultDailyBriefingEmailPresetId(preset?.id));
  const customPresets = (presets || []).filter((preset) => !isDefaultDailyBriefingEmailPresetId(preset?.id));
  const currentIndex = customPresets.findIndex((preset) => preset.id === presetId);

  if (currentIndex < 0) {
    return presets;
  }

  const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= customPresets.length) {
    return presets;
  }

  const reorderedCustomPresets = [...customPresets];
  [reorderedCustomPresets[currentIndex], reorderedCustomPresets[nextIndex]] = [
    reorderedCustomPresets[nextIndex],
    reorderedCustomPresets[currentIndex],
  ];

  return [...fixedPresets, ...reorderedCustomPresets];
}

function truncateWorkbenchText(text, maxLength = 24) {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

function formatDailyBriefingExportedAt(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

function mountDailyBriefingShareContainer(documentHtml) {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  const parsedDocument = parser
    ? parser.parseFromString(documentHtml, 'text/html')
    : null;
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'daily-briefing-pdf-source');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '920px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '-1';
  container.style.background = '#f8fafc';

  const styleElement = document.createElement('style');
  styleElement.textContent = parsedDocument?.querySelector('style')?.textContent || '';
  container.appendChild(styleElement);

  const contentElement = document.createElement('div');
  contentElement.innerHTML = parsedDocument?.body?.innerHTML || documentHtml;
  container.appendChild(contentElement);
  document.body.appendChild(container);

  return () => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };
}

function formatWorkbenchTaskPreview(task) {
  if (!task) {
    return '';
  }

  const title = truncateWorkbenchText(task.title || task.id || '未命名任务', task.symbol ? 22 : 28);
  const typeLabel = TASK_TYPE_LABELS[task.type] || '研究任务';
  const meta = [typeLabel, task.symbol].filter(Boolean).join(' · ');

  return [meta, title].filter(Boolean).join(' · ');
}

function ResearchWorkbench() {
  const message = useSafeMessageApi();
  const {
    archivedTasks,
    applyMorningPreset,
    autoRefreshSummary,
    boardColumns,
    detailLoading,
    dragState,
    filteredTasks,
    filters,
    latestSnapshotComparison,
    loadTaskDetail,
    loadWorkbench,
    loading,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,
    openTaskPriorityLabel,
    openTaskPriorityNote,
    refreshCurrentTask,
    refreshSignals,
    refreshStats,
    snapshotSummaryOptions,
    selectedTask,
    selectedTaskId,
    selectedTaskRefreshSignal,
    selectedTaskPriorityEventPayload,
    selectedTaskPriorityMeta,
    setAutoRefreshEnabled,
    setAutoRefreshIntervalMs,
    setDragState,
    setFilters,
    setSelectedTaskId,
    setShowAllTimeline,
    setShowArchived,
    showAllTimeline,
    showArchived,
    sourceOptions,
    stats,
    tasks,
    setTasks,
    timeline,
    timelineItems,
  } = useResearchWorkbenchData();
  const [saving, setSaving] = useState(false);
  const [dailyBriefingDefaultEmailPresetResolved, setDailyBriefingDefaultEmailPresetResolved] = useState(false);
  const [dailyBriefingDefaultEmailPresetId, setDailyBriefingDefaultEmailPresetId] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY));
  const [dailyBriefingPdfExporting, setDailyBriefingPdfExporting] = useState(false);
  const [dailyBriefingPreviewSeed, setDailyBriefingPreviewSeed] = useState(null);
  const [dailyBriefingEmailCcRecipients, setDailyBriefingEmailCcRecipients] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_CC_STORAGE_KEY));
  const [dailyBriefingEmailPresets, setDailyBriefingEmailPresets] = useState(() => readDailyBriefingEmailPresets());
  const [dailyBriefingEmailRecipients, setDailyBriefingEmailRecipients] = useState(() => readDailyBriefingLocalValue(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY));
  const [dailyBriefingTeamNote, setDailyBriefingTeamNote] = useState(() => readDailyBriefingTeamNote());
  const [dailyBriefingDeliveryHistory, setDailyBriefingDeliveryHistory] = useState([]);
  const [dailyBriefingDistributionEnabled, setDailyBriefingDistributionEnabled] = useState(false);
  const [dailyBriefingDistributionSaving, setDailyBriefingDistributionSaving] = useState(false);
  const [dailyBriefingDistributionTime, setDailyBriefingDistributionTime] = useState('09:00');
  const [dailyBriefingDistributionTimezone, setDailyBriefingDistributionTimezone] = useState('Asia/Shanghai');
  const [dailyBriefingDistributionWeekdays, setDailyBriefingDistributionWeekdays] = useState(DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
  const [dailyBriefingDryRunRunning, setDailyBriefingDryRunRunning] = useState(false);
  const [dailyBriefingNotificationChannelOptions, setDailyBriefingNotificationChannelOptions] = useState(() => (
    normalizeDailyBriefingNotificationChannelOptions()
  ));
  const [dailyBriefingNotificationChannels, setDailyBriefingNotificationChannels] = useState('dry_run');
  const [dailyBriefingSchedule, setDailyBriefingSchedule] = useState(() => normalizeDailyBriefingSchedule());
  const [dailyBriefingRetryingRecordId, setDailyBriefingRetryingRecordId] = useState('');
  const [dailyBriefingSending, setDailyBriefingSending] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const selectedTaskTitle = selectedTask?.title || tasks.find((task) => task.id === selectedTaskId)?.title || '';
  const workbenchViewSummary = buildWorkbenchViewSummary(filters, {
    reasonOptions: REASON_OPTIONS,
    refreshOptions: REFRESH_OPTIONS,
    snapshotViewOptions: SNAPSHOT_VIEW_OPTIONS,
    typeOptions: TYPE_OPTIONS,
    sourceOptions,
    selectedTaskId,
    selectedTaskTitle,
  });
  const bulkStatusTaskIds = filteredTasks
    .filter((task) => !['complete', 'archived', 'in_progress'].includes(task.status))
    .map((task) => task.id);
  const bulkCommentTaskIds = filteredTasks
    .filter((task) => task.status !== 'archived')
    .map((task) => task.id);
  const orderedQueueTasks = useMemo(
    () => orderWorkbenchQueueTasks(filteredTasks, Boolean(filters.refresh || filters.reason)),
    [filteredTasks, filters.reason, filters.refresh]
  );
  const bulkReviewComment = [
    `批量复盘：${workbenchViewSummary.headline}`,
    workbenchViewSummary.scopedTaskLabel || '',
  ].filter(Boolean).join(' · ');
  const getTaskLaunchMode = (task) => {
    if (!task) {
      return '';
    }
    if (task.type === 'pricing' && task.symbol) {
      return 'pricing';
    }
    if (task.type === 'cross_market' && task.template) {
      return 'cross_market';
    }
    if (task.type === 'macro_mispricing' && task.symbol) {
      return 'cross_market';
    }
    if (task.type === 'trade_thesis') {
      return 'cross_market';
    }
    return '';
  };
  const selectedTaskQueueMeta = useMemo(() => {
    const total = orderedQueueTasks.length;
    if (!total) {
      return {
        total: 0,
        index: -1,
        position: 0,
        label: '',
        currentTask: null,
        previousTask: null,
        nextTask: null,
        hasPrevious: false,
        hasNext: false,
      };
    }

    const currentIndex = orderedQueueTasks.findIndex((task) => task.id === selectedTaskId);
    const index = currentIndex >= 0 ? currentIndex : 0;
    const currentTask = orderedQueueTasks[index] || null;
    const previousTask = index > 0 ? orderedQueueTasks[index - 1] : null;
    const nextTask = index < total - 1 ? orderedQueueTasks[index + 1] : null;

    return {
      total,
      index,
      position: index + 1,
      label: `第 ${index + 1} / ${total} 条`,
      currentTask,
      previousTask,
      nextTask,
      hasPrevious: Boolean(previousTask),
      hasNext: Boolean(nextTask),
    };
  }, [orderedQueueTasks, selectedTaskId]);
  const queueLaunchSummary = useMemo(() => {
    const launchableTasks = orderedQueueTasks.filter((task) => Boolean(getTaskLaunchMode(task)));
    const pricingTasks = launchableTasks.filter((task) => getTaskLaunchMode(task) === 'pricing');
    const crossMarketTasks = launchableTasks.filter((task) => getTaskLaunchMode(task) === 'cross_market');

    return {
      total: orderedQueueTasks.length,
      launchableCount: launchableTasks.length,
      leadTask: launchableTasks[0] || null,
      pricingTask: pricingTasks[0] || null,
      crossMarketTask: crossMarketTasks[0] || null,
      pricingCount: pricingTasks.length,
      crossMarketCount: crossMarketTasks.length,
    };
  }, [orderedQueueTasks]);
  const workbenchHeroMetrics = useMemo(() => ([
    {
      label: '当前视图任务',
      value: `${filteredTasks.length}`,
    },
    {
      label: '进行中',
      value: `${stats?.status_counts?.in_progress || 0}`,
    },
    {
      label: '阻塞',
      value: `${stats?.status_counts?.blocked || 0}`,
    },
    {
      label: '可直接重开',
      value: `${queueLaunchSummary.launchableCount || 0}`,
    },
  ]), [
    filteredTasks.length,
    queueLaunchSummary.launchableCount,
    stats?.status_counts?.blocked,
    stats?.status_counts?.in_progress,
  ]);
  const workbenchHeroBriefItems = useMemo(() => ([
    {
      label: '这页用途',
      value: '先定当前焦点，再批量推进，再从这里一键回到原研究页，不用在多页之间来回找入口。',
    },
    {
      label: '下一步',
      value: selectedTask?.title
        ? `先看 ${formatWorkbenchTaskPreview(selectedTask)}`
        : queueLaunchSummary.leadTask
          ? `建议先打开 ${formatWorkbenchTaskPreview(queueLaunchSummary.leadTask)}`
          : '先从左侧看板里点一条任务，右侧会自动切到详情与复盘上下文。',
    },
    {
      label: '当前节奏',
      value: `立即更新 ${refreshStats.high || 0} · 优先复核 ${refreshStats.medium || 0} · 继续观察 ${refreshStats.low || 0}`,
    },
    {
      label: '刷新节奏',
      value: autoRefreshSummary.enabled
        ? `${autoRefreshSummary.intervalLabel} 自动刷新 · 最近 ${autoRefreshSummary.lastRefreshLabel}`
        : `自动刷新已关闭 · 最近 ${autoRefreshSummary.lastRefreshLabel}`,
    },
  ]), [
    autoRefreshSummary.enabled,
    autoRefreshSummary.intervalLabel,
    autoRefreshSummary.lastRefreshLabel,
    queueLaunchSummary.leadTask,
    refreshStats.high,
    refreshStats.low,
    refreshStats.medium,
    selectedTask,
  ]);
  const workbenchContextItems = useMemo(() => {
    const leadTaskSummary = queueLaunchSummary.leadTask
      ? `${formatWorkbenchTaskPreview(queueLaunchSummary.leadTask)} · 定价 ${queueLaunchSummary.pricingCount || 0} / 跨市场 ${queueLaunchSummary.crossMarketCount || 0}`
      : '当前筛选队列里还没有可直接重新打开的研究页。';

    return [
      {
        title: '当前筛选',
        detail: workbenchViewSummary.headline,
      },
      {
        title: '焦点任务',
        detail: selectedTask
          ? `${formatWorkbenchTaskPreview(selectedTask)}${selectedTask.note ? ` · ${truncateWorkbenchText(selectedTask.note, 24)}` : ''}`
          : truncateWorkbenchText(workbenchViewSummary.scopedTaskLabel, 46)
            || '当前还没有固定焦点，可以先在左侧点一条任务。',
      },
      {
        title: '首条可重开',
        detail: leadTaskSummary,
      },
      {
        title: '批量与排序',
        detail: `推进 ${bulkStatusTaskIds.length} · 评论 ${bulkCommentTaskIds.length} · 升档 ${refreshStats.priorityEscalated || 0} · 缓和 ${refreshStats.priorityRelaxed || 0}`,
      },
      {
        title: '自动刷新',
        detail: autoRefreshSummary.enabled
          ? `${autoRefreshSummary.statusLabel} · ${autoRefreshSummary.documentVisible ? autoRefreshSummary.nextRefreshLabel : '页面后台时暂停，回到前台后自动恢复'}`
          : '自动刷新已关闭，可在下方总览区开启。',
      },
    ];
  }, [
    autoRefreshSummary.documentVisible,
    autoRefreshSummary.enabled,
    autoRefreshSummary.nextRefreshLabel,
    autoRefreshSummary.statusLabel,
    bulkCommentTaskIds.length,
    bulkStatusTaskIds.length,
    queueLaunchSummary.crossMarketCount,
    queueLaunchSummary.leadTask,
    queueLaunchSummary.pricingCount,
    refreshStats.priorityEscalated,
    refreshStats.priorityRelaxed,
    selectedTask,
    workbenchViewSummary.scopedTaskLabel,
    workbenchViewSummary.headline,
  ]);
  const activeDailyBriefingEmailPresetId = useMemo(
    () => dailyBriefingEmailPresets.find((preset) => matchesDailyBriefingEmailPreset(
      preset,
      dailyBriefingEmailRecipients,
      dailyBriefingEmailCcRecipients
    ))?.id || '',
    [dailyBriefingEmailCcRecipients, dailyBriefingEmailPresets, dailyBriefingEmailRecipients]
  );
  const dailyBriefingDistributionConfig = useMemo(() => ({
    enabled: dailyBriefingDistributionEnabled,
    sendTime: dailyBriefingDistributionTime,
    timezone: dailyBriefingDistributionTimezone,
    weekdays: dailyBriefingDistributionWeekdays,
    notificationChannels: dailyBriefingNotificationChannels,
  }), [
    dailyBriefingDistributionEnabled,
    dailyBriefingDistributionTime,
    dailyBriefingDistributionTimezone,
    dailyBriefingDistributionWeekdays,
    dailyBriefingNotificationChannels,
  ]);
  const workbenchDailyBriefing = useMemo(() => {
    const focusTask = selectedTask || queueLaunchSummary.leadTask || null;
    const escalatedCount = refreshStats.priorityEscalated || 0;
    const highCount = refreshStats.high || 0;
    const mediumCount = refreshStats.medium || 0;
    const lowCount = refreshStats.low || 0;
    const structuralDecayRadarCount = refreshStats.structuralDecayRadar || 0;
    const selectionQualityRunCount = refreshStats.selectionQualityActive || 0;

    const headline = focusTask
      ? `今日先看 ${formatWorkbenchTaskPreview(focusTask)}`
      : workbenchViewSummary.hasActiveFilters
        ? '今日先整理当前筛选队列'
        : '今日先整理研究工作台';
    const summary = escalatedCount
      ? `先处理 ${escalatedCount} 条自动升档任务，再覆盖 ${highCount} 条建议更新。`
      : highCount
        ? `先处理 ${highCount} 条建议更新任务，之后再回看 ${mediumCount} 条复核任务。`
        : mediumCount
          ? `当前没有高优先级升档，建议先完成 ${mediumCount} 条复核任务。`
          : `当前主队列以继续观察为主，可围绕 ${queueLaunchSummary.launchableCount || 0} 条可重开任务做日常巡检。`;

    return {
      headline,
      summary,
      chips: [
        { label: '升档', value: escalatedCount, color: 'red' },
        { label: '建议更新', value: highCount, color: 'volcano' },
        { label: '建议复核', value: mediumCount, color: 'gold' },
        { label: '可重开', value: queueLaunchSummary.launchableCount || 0, color: 'blue' },
      ],
      details: [
        morningPresetActive && morningPresetCandidate?.label
          ? `${morningPresetCandidate.label}当前已生效。${morningPresetCandidate.note || ''}`
          : morningPresetCandidate?.label
            ? `可一键切回${morningPresetCandidate.label}。${morningPresetCandidate.note || ''}`
            : morningPresetSummary?.label
              ? `${morningPresetSummary.label}已应用。${morningPresetSummary.note || ''}`
          : '',
        workbenchViewSummary.hasActiveFilters
          ? `当前简报基于“${workbenchViewSummary.headline}”。`
          : '当前简报覆盖全部任务视图。',
        `可直接重开 ${queueLaunchSummary.launchableCount || 0} 条，其中 Pricing ${queueLaunchSummary.pricingCount || 0}，跨市场 ${queueLaunchSummary.crossMarketCount || 0}。`,
        structuralDecayRadarCount
          ? `系统衰败雷达升温 ${structuralDecayRadarCount} 条，建议和普通更新分开处理。`
          : selectionQualityRunCount
            ? `当前有 ${selectionQualityRunCount} 条降级运行结果，适合排到普通更新前面。`
            : `继续观察 ${lowCount} 条，可作为今天的日常巡检池。`,
        autoRefreshSummary.enabled
          ? `${autoRefreshSummary.lastRefreshTriggerLabel}在 ${autoRefreshSummary.lastRefreshLabel} 完成，${autoRefreshSummary.documentVisible ? autoRefreshSummary.nextRefreshLabel : '页面后台时自动刷新暂停，回到前台后恢复。'}`
          : `最近一次刷新：${autoRefreshSummary.lastRefreshLabel}。自动刷新当前已关闭，可按需要开启。`,
      ],
    };
  }, [
    autoRefreshSummary.documentVisible,
    autoRefreshSummary.enabled,
    autoRefreshSummary.lastRefreshLabel,
    autoRefreshSummary.lastRefreshTriggerLabel,
    autoRefreshSummary.nextRefreshLabel,
    queueLaunchSummary.crossMarketCount,
    queueLaunchSummary.launchableCount,
    queueLaunchSummary.leadTask,
    queueLaunchSummary.pricingCount,
    morningPresetActive,
    morningPresetCandidate,
    morningPresetSummary,
    refreshStats.high,
    refreshStats.low,
    refreshStats.medium,
    refreshStats.priorityEscalated,
    refreshStats.selectionQualityActive,
    refreshStats.structuralDecayRadar,
    selectedTask,
    workbenchViewSummary.hasActiveFilters,
    workbenchViewSummary.headline,
  ]);
  const selectedMatchingQueueMeta = useMemo(() => {
    const currentTask = selectedTaskQueueMeta.currentTask || selectedTask;
    const mode = getTaskLaunchMode(currentTask);

    if (!mode) {
      return {
        mode: '',
        title: '',
        total: 0,
        index: -1,
        label: '',
        currentTask: null,
        previousTask: null,
        nextTask: null,
        hasPrevious: false,
        hasNext: false,
      };
    }

    const matchingTasks = orderedQueueTasks.filter((task) => getTaskLaunchMode(task) === mode);
    const currentIndex = matchingTasks.findIndex((task) => task.id === currentTask?.id);
    const index = currentIndex >= 0 ? currentIndex : 0;
    const queueCurrentTask = matchingTasks[index] || null;
    const previousTask = index > 0 ? matchingTasks[index - 1] : null;
    const nextTask = index < matchingTasks.length - 1 ? matchingTasks[index + 1] : null;

    return {
      mode,
      title: mode === 'pricing' ? 'Pricing 执行队列' : '跨市场执行队列',
      total: matchingTasks.length,
      index,
      label: `第 ${index + 1} / ${matchingTasks.length} 条`,
      currentTask: queueCurrentTask,
      previousTask,
      nextTask,
      hasPrevious: Boolean(previousTask),
      hasNext: Boolean(nextTask),
    };
  }, [orderedQueueTasks, selectedTask, selectedTaskQueueMeta]);

  const withPriorityEvent = (payload = {}, taskId = selectedTask?.id || '') => {
    const taskRefreshSignal = taskId ? refreshSignals.byTaskId[taskId] : null;
    const taskPriorityMeta = taskId === selectedTask?.id
      ? selectedTaskPriorityMeta
      : buildRefreshPriorityMeta(taskRefreshSignal);
    const refreshPriorityEvent = taskId === selectedTask?.id
      ? selectedTaskPriorityEventPayload
      : buildRefreshPriorityEventPayload(taskRefreshSignal, taskPriorityMeta);

    return refreshPriorityEvent
      ? { ...payload, refresh_priority_event: refreshPriorityEvent }
      : payload;
  };

  useEffect(() => {
    if (!selectedTask) {
      setTitleDraft('');
      setNoteDraft('');
      setCommentDraft('');
      setShowAllTimeline(false);
      return;
    }
    setTitleDraft(selectedTask.title || '');
    setNoteDraft(selectedTask.note || '');
    setShowAllTimeline(false);
  }, [selectedTask, setShowAllTimeline]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_NOTE_STORAGE_KEY, dailyBriefingTeamNote);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingTeamNote]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY, dailyBriefingEmailRecipients);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(DAILY_BRIEFING_CC_STORAGE_KEY, dailyBriefingEmailCcRecipients);
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailCcRecipients]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY,
        JSON.stringify(normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets))
      );
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingEmailPresets]);

  useEffect(() => {
    if (!dailyBriefingDefaultEmailPresetId) {
      return;
    }

    if (!dailyBriefingEmailPresets.some((preset) => preset.id === dailyBriefingDefaultEmailPresetId)) {
      setDailyBriefingDefaultEmailPresetId('');
    }
  }, [dailyBriefingDefaultEmailPresetId, dailyBriefingEmailPresets]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (dailyBriefingDefaultEmailPresetId) {
        window.localStorage.setItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY, dailyBriefingDefaultEmailPresetId);
      } else {
        window.localStorage.removeItem(DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY);
      }
    } catch (error) {
      // Ignore local persistence failures and keep the workbench interactive.
    }
  }, [dailyBriefingDefaultEmailPresetId]);

  useEffect(() => {
    if (dailyBriefingDefaultEmailPresetResolved) {
      return;
    }

    if (dailyBriefingEmailRecipients.trim() || dailyBriefingEmailCcRecipients.trim()) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    if (!dailyBriefingDefaultEmailPresetId) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    const defaultPreset = dailyBriefingEmailPresets.find((preset) => preset.id === dailyBriefingDefaultEmailPresetId);
    if (!defaultPreset) {
      setDailyBriefingDefaultEmailPresetResolved(true);
      return;
    }

    setDailyBriefingEmailRecipients(defaultPreset.toRecipients || '');
    setDailyBriefingEmailCcRecipients(defaultPreset.ccRecipients || '');
    setDailyBriefingDefaultEmailPresetResolved(true);
  }, [
    dailyBriefingDefaultEmailPresetId,
    dailyBriefingDefaultEmailPresetResolved,
    dailyBriefingEmailCcRecipients,
    dailyBriefingEmailPresets,
    dailyBriefingEmailRecipients,
  ]);

  useEffect(() => {
    let mounted = true;

    const loadDailyBriefingDistribution = async () => {
      const [distributionResult, infrastructureResult] = await Promise.allSettled([
        getResearchBriefingDistribution(),
        getInfrastructureStatus(),
      ]);

      if (!mounted) {
        return;
      }

      try {
        if (infrastructureResult.status === 'fulfilled' && infrastructureResult.value?.success) {
          setDailyBriefingNotificationChannelOptions(
            normalizeDailyBriefingNotificationChannelOptions(
              infrastructureResult.value.data?.notifications?.channels || []
            )
          );
        }

        if (distributionResult.status !== 'fulfilled' || !distributionResult.value?.success) {
          return;
        }
        const response = distributionResult.value;
        const distribution = normalizeServerDailyBriefingDistribution(response.data?.distribution || {});
        setDailyBriefingDistributionEnabled(distribution.enabled);
        setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
        setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
        setDailyBriefingDistributionWeekdays(distribution.weekdays?.length ? distribution.weekdays : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
        setDailyBriefingNotificationChannels((distribution.notificationChannels || ['dry_run']).join(' '));
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));

        if ((response.data?.distribution?.presets || []).length) {
          setDailyBriefingEmailPresets(distribution.presets);
        }
        if (distribution.defaultPresetId) {
          setDailyBriefingDefaultEmailPresetId(distribution.defaultPresetId);
        }
        if (distribution.toRecipients.trim()) {
          setDailyBriefingEmailRecipients(distribution.toRecipients);
        }
        if (distribution.ccRecipients.trim()) {
          setDailyBriefingEmailCcRecipients(distribution.ccRecipients);
        }
        if (distribution.teamNote.trim()) {
          setDailyBriefingTeamNote(distribution.teamNote);
        }
      } catch (error) {
        // Keep local briefing controls usable when the optional distribution state is unavailable.
      }
    };

    loadDailyBriefingDistribution();
    return () => {
      mounted = false;
    };
  }, []);

  const handleApplyDailyBriefingEmailPreset = (presetId) => {
    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    setDailyBriefingEmailRecipients(targetPreset.toRecipients || '');
    setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients || '');
    message.success(`已切换到分发预设：${targetPreset.name || '未命名预设'}`);
  };

  const handleSetDefaultDailyBriefingEmailPreset = (presetId) => {
    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    const presetName = targetPreset.name || '未命名预设';
    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
      message.success(`已取消默认分发预设：${presetName}`);
      return;
    }

    setDailyBriefingDefaultEmailPresetId(presetId);
    if (!dailyBriefingEmailRecipients.trim() && !dailyBriefingEmailCcRecipients.trim()) {
      setDailyBriefingEmailRecipients(targetPreset.toRecipients || '');
      setDailyBriefingEmailCcRecipients(targetPreset.ccRecipients || '');
    }
    message.success(`已设为默认分发预设：${presetName}`);
  };

  const handleAddDailyBriefingEmailPreset = () => {
    const nextPresetName = buildNextCustomDailyBriefingPresetName(dailyBriefingEmailPresets);
    const nextPresetId = buildDailyBriefingCustomPresetId();

    setDailyBriefingEmailPresets((prev) => [...prev, {
      id: nextPresetId,
      name: nextPresetName,
      toRecipients: '',
      ccRecipients: '',
    }]);
    message.success(`已新增自定义分发预设：${nextPresetName}`);
  };

  const handleChangeDailyBriefingEmailPresetName = (presetId, nextName = '') => {
    setDailyBriefingEmailPresets((prev) => prev.map((preset) => (
      preset.id === presetId
        ? {
          ...preset,
          name: String(nextName || '').slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH),
        }
        : preset
    )));
  };

  const handleSaveDailyBriefingEmailPreset = (presetId) => {
    const currentPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    const fallbackName = DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.find((item) => item.id === presetId)?.name || '未命名预设';
    const savedPresetName = String(currentPreset?.name || '').trim().slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH) || fallbackName;

    setDailyBriefingEmailPresets((prev) => prev.map((preset) => {
      if (preset.id !== presetId) {
        return preset;
      }

      return {
        ...preset,
        name: savedPresetName,
        ccRecipients: dailyBriefingEmailCcRecipients,
        toRecipients: dailyBriefingEmailRecipients,
      };
    }));

    message.success(`已保存分发预设：${savedPresetName}`);
  };

  const handleMoveDailyBriefingEmailPreset = (presetId, direction = 'up') => {
    setDailyBriefingEmailPresets((prev) => moveDailyBriefingCustomPresetOrder(prev, presetId, direction));
  };

  const handleDeleteDailyBriefingEmailPreset = (presetId) => {
    if (!presetId || isDefaultDailyBriefingEmailPresetId(presetId)) {
      return;
    }

    const targetPreset = dailyBriefingEmailPresets.find((preset) => preset.id === presetId);
    if (!targetPreset) {
      return;
    }

    if (dailyBriefingDefaultEmailPresetId === presetId) {
      setDailyBriefingDefaultEmailPresetId('');
    }
    setDailyBriefingEmailPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    message.success(`已删除分发预设：${targetPreset.name || '未命名预设'}`);
  };

  const buildDailyBriefingDistributionPayload = () => ({
    enabled: dailyBriefingDistributionEnabled,
    send_time: dailyBriefingDistributionTime || '09:00',
    timezone: dailyBriefingDistributionTimezone || 'Asia/Shanghai',
    weekdays: dailyBriefingDistributionWeekdays?.length
      ? dailyBriefingDistributionWeekdays
      : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    notification_channels: parseDailyBriefingNotificationChannels(dailyBriefingNotificationChannels),
    default_preset_id: dailyBriefingDefaultEmailPresetId || '',
    presets: normalizeDailyBriefingEmailPresets(dailyBriefingEmailPresets).map((preset) => ({
      id: preset.id,
      name: preset.name,
      to_recipients: preset.toRecipients || '',
      cc_recipients: preset.ccRecipients || '',
    })),
    to_recipients: dailyBriefingEmailRecipients,
    cc_recipients: dailyBriefingEmailCcRecipients,
    team_note: dailyBriefingTeamNote,
  });

  const applyDailyBriefingDistributionResponse = (data = {}) => {
    const distribution = normalizeServerDailyBriefingDistribution(data?.distribution || {});
    setDailyBriefingDistributionEnabled(distribution.enabled);
    setDailyBriefingDistributionTime(distribution.sendTime || '09:00');
    setDailyBriefingDistributionTimezone(distribution.timezone || 'Asia/Shanghai');
    setDailyBriefingDistributionWeekdays(distribution.weekdays?.length ? distribution.weekdays : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS);
    setDailyBriefingNotificationChannels((distribution.notificationChannels || ['dry_run']).join(' '));
    setDailyBriefingDeliveryHistory(data?.delivery_history || []);
    setDailyBriefingSchedule(normalizeDailyBriefingSchedule(data?.schedule || {}));
  };

  const handleSaveDailyBriefingDistribution = async () => {
    setDailyBriefingDistributionSaving(true);
    try {
      const response = await updateResearchBriefingDistribution(buildDailyBriefingDistributionPayload());
      if (response?.success) {
        applyDailyBriefingDistributionResponse(response.data);
      }
      message.success('每日简报分发配置已保存');
    } catch (error) {
      message.error(error.userMessage || error.message || '保存分发配置失败');
    } finally {
      setDailyBriefingDistributionSaving(false);
    }
  };

  const handleRunDailyBriefingDryRun = async () => {
    setDailyBriefingDryRunRunning(true);
    try {
      await updateResearchBriefingDistribution(buildDailyBriefingDistributionPayload());
      const artifacts = buildDailyBriefingShareArtifacts();
      const response = await runResearchBriefingDryRun({
        subject: artifacts.emailSubject,
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline,
        headline: workbenchDailyBriefing.headline,
        summary: workbenchDailyBriefing.summary,
        to_recipients: artifacts.toRecipients,
        cc_recipients: artifacts.ccRecipients,
        team_note: artifacts.teamNote,
        task_count: filteredTasks.length,
        channel: 'email',
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      message.success('每日简报 Dry-run 已记录');
    } catch (error) {
      message.error(error.userMessage || error.message || '记录 Dry-run 失败');
    } finally {
      setDailyBriefingDryRunRunning(false);
    }
  };

  const handleSendDailyBriefing = async () => {
    setDailyBriefingSending(true);
    try {
      const distributionPayload = buildDailyBriefingDistributionPayload();
      await updateResearchBriefingDistribution(distributionPayload);
      const artifacts = buildDailyBriefingShareArtifacts();
      const response = await sendResearchBriefing({
        subject: artifacts.emailSubject,
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline,
        headline: workbenchDailyBriefing.headline,
        summary: workbenchDailyBriefing.summary,
        to_recipients: artifacts.toRecipients,
        cc_recipients: artifacts.ccRecipients,
        team_note: artifacts.teamNote,
        task_count: filteredTasks.length,
        channel: 'email',
        channels: distributionPayload.notification_channels,
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      const record = response?.data?.record || {};
      if (record.status === 'sent') {
        message.success('每日简报已发送');
      } else if (record.status === 'partial') {
        message.warning('每日简报部分通道发送成功，请查看最近分发记录');
      } else if (record.status === 'dry_run') {
        message.info('当前通道为 dry_run，已记录但未真实发送');
      } else {
        message.warning('每日简报未完成真实发送，请查看最近分发记录');
      }
    } catch (error) {
      message.error(error.userMessage || error.message || '发送每日简报失败');
    } finally {
      setDailyBriefingSending(false);
    }
  };

  const handleRetryDailyBriefingDelivery = async (record = {}, retryChannels = []) => {
    const channels = (retryChannels || [])
      .map((channel) => String(channel || '').trim())
      .filter(Boolean);
    if (!channels.length) {
      message.info('这条分发记录没有需要重试的失败通道');
      return;
    }

    const retryRecordId = record.id || record.created_at || record.createdAt || 'latest';
    setDailyBriefingRetryingRecordId(retryRecordId);
    try {
      const artifacts = buildDailyBriefingShareArtifacts();
      const response = await sendResearchBriefing({
        subject: artifacts.emailSubject || record.subject || 'Research Workbench Daily Briefing',
        body: artifacts.emailBody,
        current_view: workbenchViewSummary.headline || record.current_view || record.currentView || '',
        headline: workbenchDailyBriefing.headline || record.headline || '',
        summary: workbenchDailyBriefing.summary || record.summary || '',
        to_recipients: artifacts.toRecipients || record.to_recipients || record.toRecipients || '',
        cc_recipients: artifacts.ccRecipients || record.cc_recipients || record.ccRecipients || '',
        team_note: artifacts.teamNote || record.team_note || record.teamNote || '',
        task_count: filteredTasks.length || record.task_count || record.taskCount || 0,
        channel: 'email',
        channels,
      });
      if (response?.success) {
        setDailyBriefingDeliveryHistory(response.data?.delivery_history || []);
        setDailyBriefingSchedule(normalizeDailyBriefingSchedule(response.data?.schedule || {}));
      }
      const status = response?.data?.record?.status || 'unknown';
      if (status === 'sent') {
        message.success(`已重试失败通道：${channels.join(', ')}`);
      } else if (status === 'partial') {
        message.warning('重试后仍有部分通道未完成，请查看最近分发记录');
      } else {
        message.warning('重试未完成，请查看最近分发记录');
      }
    } catch (error) {
      message.error(error.userMessage || error.message || '重试分发失败');
    } finally {
      setDailyBriefingRetryingRecordId('');
    }
  };

  const buildWorkbenchSearchForTask = (taskId = selectedTaskId) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    const nextUrl = buildWorkbenchLink(
      {
        refresh: filters.refresh,
        type: filters.type,
        sourceFilter: filters.source,
        reason: filters.reason,
        snapshotView: filters.snapshotView,
        snapshotFingerprint: filters.snapshotFingerprint,
        snapshotSummary: filters.snapshotSummary,
        keyword: filters.keyword,
        queueMode: getTaskLaunchMode(targetTask),
        taskId,
      },
      window.location.search
    );
    return new URL(nextUrl, window.location.origin).search;
  };

  const openWorkbenchTask = (task, currentSearchOverride = window.location.search) => {
    if (!task) return;

    const taskRefreshSignal = task.id ? refreshSignals.byTaskId[task.id] : null;
    const taskOpenNote = task.id === selectedTask?.id
      ? openTaskPriorityNote
      : buildOpenTaskPriorityNote(task, taskRefreshSignal);

    if (task.type === 'trade_thesis') {
      const payload = task.snapshot?.payload || task.snapshot_history?.[0]?.payload || {};
      const draft = payload.draft || null;
      if (draft?.id && draft?.assets?.length) {
        const draftId = saveMacroMispricingDraft(draft);
        if (draftId) {
          navigateToAppUrl(
            buildCrossMarketLink(
              draft.templateId || task.template || '',
              'research_workbench',
              taskOpenNote,
              currentSearchOverride,
              draftId,
            )
          );
          return;
        }
      }
    }

    if (task.type === 'macro_mispricing' && task.symbol) {
      const payload = task.snapshot?.payload || task.snapshot_history?.[0]?.payload || {};
      const draft = buildMacroMispricingDraft({
        symbol: task.symbol,
        thesis: payload.macro_mispricing_thesis || {},
        structuralDecay: payload.structural_decay || {},
        peopleLayer: payload.people_layer || {},
        source: 'research_workbench',
        note: taskOpenNote,
        sourceTaskId: task.id,
        sourceTaskType: 'macro_mispricing',
      });
      const draftId = saveMacroMispricingDraft(draft);
      if (draftId) {
        navigateToAppUrl(
          buildCrossMarketLink(
            draft.templateId,
            'research_workbench',
            taskOpenNote,
            currentSearchOverride,
            draftId,
          )
        );
        return;
      }
    }

    if (task.type === 'pricing' && task.symbol) {
      navigateByResearchAction({
        target: 'pricing',
        symbol: task.symbol,
        period: task.snapshot?.payload?.period || task.context?.period || '',
        source: 'research_workbench',
        note: taskOpenNote,
      }, currentSearchOverride);
      return;
    }

    if (task.type === 'cross_market' && task.template) {
      navigateByResearchAction({
        target: 'cross-market',
        template: task.template,
        source: 'research_workbench',
        note: taskOpenNote,
      }, currentSearchOverride);
      return;
    }

    navigateByResearchAction({
      target: 'godsEye',
      source: 'research_workbench',
      note: '返回 GodEye 继续筛选研究线索',
    }, currentSearchOverride);
  };

  const handleStatusUpdate = async (status) => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await updateResearchTask(selectedTask.id, withPriorityEvent({ status }));
      message.success(status === 'archived' ? '任务已归档' : '任务状态已更新');
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '更新任务状态失败');
    } finally {
      setSaving(false);
    }
  };

  const handleMetaSave = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await updateResearchTask(selectedTask.id, withPriorityEvent({
        title: titleDraft,
        note: noteDraft,
      }));
      message.success('任务信息已保存');
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '保存任务信息失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!selectedTask || !commentDraft.trim()) return;
    setSaving(true);
    try {
      await addResearchTaskComment(selectedTask.id, {
        body: commentDraft.trim(),
        author: 'local',
      });
      setCommentDraft('');
      message.success('评论已添加');
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '添加评论失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await deleteResearchTaskComment(selectedTask.id, commentId);
      message.success('评论已删除');
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '删除评论失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      await deleteResearchTask(selectedTask.id);
      message.success('任务已删除');
      await loadWorkbench();
    } catch (error) {
      message.error(error.userMessage || error.message || '删除任务失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreArchived = async (taskId) => {
    setSaving(true);
    try {
      await updateResearchTask(taskId, withPriorityEvent({ status: 'new' }, taskId));
      message.success('任务已恢复到新建列');
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '恢复任务失败');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenTask = () => {
    if (!selectedTask) return;
    openWorkbenchTask(selectedTask, buildWorkbenchSearchForTask(selectedTask.id));
  };

  const handleSelectQueueTask = (direction) => {
    const nextTask = direction < 0 ? selectedTaskQueueMeta.previousTask : selectedTaskQueueMeta.nextTask;
    if (!nextTask?.id) {
      message.info(direction < 0 ? '当前已经是复盘队列第一条' : '当前已经是复盘队列最后一条');
      return;
    }
    setSelectedTaskId(nextTask.id);
  };

  const handleOpenNextTask = () => {
    const nextTask = selectedTaskQueueMeta.nextTask;
    if (!nextTask?.id) {
      message.info('当前已经是复盘队列最后一条');
      return;
    }
    setSelectedTaskId(nextTask.id);
    openWorkbenchTask(nextTask, buildWorkbenchSearchForTask(nextTask.id));
  };

  const handleSelectMatchingQueueTask = (direction) => {
    const nextTask = direction < 0 ? selectedMatchingQueueMeta.previousTask : selectedMatchingQueueMeta.nextTask;
    if (!nextTask?.id) {
      const queueLabel = selectedMatchingQueueMeta.mode === 'pricing' ? 'Pricing 执行队列' : '跨市场执行队列';
      message.info(direction < 0 ? `${queueLabel}已经到第一条` : `${queueLabel}已经到最后一条`);
      return;
    }
    setSelectedTaskId(nextTask.id);
  };

  const handleOpenMatchingQueueNext = () => {
    const nextTask = selectedMatchingQueueMeta.nextTask;
    if (!nextTask?.id) {
      const queueLabel = selectedMatchingQueueMeta.mode === 'pricing' ? 'Pricing 执行队列' : '跨市场执行队列';
      message.info(`${queueLabel}已经到最后一条`);
      return;
    }
    setSelectedTaskId(nextTask.id);
    openWorkbenchTask(nextTask, buildWorkbenchSearchForTask(nextTask.id));
  };

  const handleOpenQueueLead = () => {
    const leadTask = queueLaunchSummary.leadTask;
    if (!leadTask?.id) {
      message.info('当前队列里没有可直接打开的研究任务');
      return;
    }
    setSelectedTaskId(leadTask.id);
    openWorkbenchTask(leadTask, buildWorkbenchSearchForTask(leadTask.id));
  };

  const handleOpenQueueByMode = (mode) => {
    const targetTask = mode === 'pricing'
      ? queueLaunchSummary.pricingTask
      : queueLaunchSummary.crossMarketTask;
    if (!targetTask?.id) {
      message.info(mode === 'pricing' ? '当前队列里没有可打开的 Pricing 任务' : '当前队列里没有可打开的跨市场任务');
      return;
    }
    setSelectedTaskId(targetTask.id);
    openWorkbenchTask(targetTask, buildWorkbenchSearchForTask(targetTask.id));
  };

  const commitBoardReorder = async (nextTasks, successMessage = '看板顺序已更新') => {
    const previousTasks = tasks;
    const normalizedTasks = normalizeBoardOrders(nextTasks);
    setTasks(normalizedTasks);
    try {
      await reorderResearchBoard({
        items: buildBoardReorderItems(normalizedTasks, previousTasks, refreshSignals.byTaskId),
      });
      await loadWorkbench();
      if (selectedTaskId) {
        await loadTaskDetail(selectedTaskId);
      }
      message.success(successMessage);
    } catch (error) {
      setTasks(previousTasks);
      message.error(error.userMessage || error.message || '更新看板顺序失败');
    } finally {
      setDragState(null);
    }
  };

  const handleDrop = async (targetStatus, targetTaskId = null) => {
    if (!dragState?.taskId) {
      return;
    }
    const nextTasks = moveBoardTask(tasks, dragState.taskId, targetStatus, targetTaskId);
    await commitBoardReorder(nextTasks);
  };

  const handleCopyWorkbenchViewLink = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制工作台链接');
      return;
    }

    const relativeUrl = buildWorkbenchLink(
      {
        refresh: filters.refresh,
        type: filters.type,
        sourceFilter: filters.source,
        reason: filters.reason,
        snapshotView: filters.snapshotView,
        snapshotFingerprint: filters.snapshotFingerprint,
        snapshotSummary: filters.snapshotSummary,
        keyword: filters.keyword,
        taskId: selectedTaskId,
      },
      window.location.search
    );
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      message.success('当前工作台视图链接已复制');
    } catch (error) {
      message.error('复制工作台链接失败，请稍后重试');
    }
  };

  const buildDailyBriefingSharePayload = (referenceDate = new Date()) => {
    const relativeUrl = buildWorkbenchLink(
      {
        refresh: filters.refresh,
        type: filters.type,
        sourceFilter: filters.source,
        reason: filters.reason,
        snapshotView: filters.snapshotView,
        snapshotFingerprint: filters.snapshotFingerprint,
        snapshotSummary: filters.snapshotSummary,
        keyword: filters.keyword,
        taskId: selectedTaskId,
      },
      window.location.search
    );
    const absoluteUrl = new URL(relativeUrl, window.location.origin).toString();
    const focusLabel = selectedTask
      ? formatWorkbenchTaskPreview(selectedTask)
      : (workbenchViewSummary.scopedTaskLabel || '');
    const morningPresetLabel = morningPresetActive
      ? (morningPresetCandidate?.label || '')
      : (morningPresetSummary?.label || '');
    const ccRecipients = dailyBriefingEmailCcRecipients.trim();
    const exportedAtLabel = formatDailyBriefingExportedAt(referenceDate);
    const teamNote = dailyBriefingTeamNote.trim();
    const toRecipients = dailyBriefingEmailRecipients.trim();

    return {
      absoluteUrl,
      brandLabel: DAILY_BRIEFING_BRAND_LABEL,
      ccRecipients,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      toRecipients,
    };
  };

  const buildDailyBriefingShareArtifacts = (referenceDate = new Date()) => {
    const payload = buildDailyBriefingSharePayload(referenceDate);
    const briefingDocument = buildWorkbenchDailyBriefingShareDocument({
      briefing: workbenchDailyBriefing,
      brandLabel: payload.brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      refreshLabel: autoRefreshSummary.lastRefreshLabel,
      teamNote: payload.teamNote,
      url: payload.absoluteUrl,
    });
    const emailSubject = buildWorkbenchDailyBriefingEmailSubject({
      briefing: workbenchDailyBriefing,
      brandLabel: payload.brandLabel,
    });
    const emailBody = buildWorkbenchDailyBriefingEmailText({
      briefing: workbenchDailyBriefing,
      brandLabel: payload.brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      emailSubject,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      teamNote: payload.teamNote,
      url: payload.absoluteUrl,
    });
    const emailDocument = buildWorkbenchDailyBriefingEmailDocument({
      briefing: workbenchDailyBriefing,
      brandLabel: payload.brandLabel,
      ccRecipients: payload.ccRecipients,
      currentViewLabel: workbenchViewSummary.headline,
      emailSubject,
      exportedAtLabel: payload.exportedAtLabel,
      focusLabel: payload.focusLabel,
      morningPresetLabel: payload.morningPresetLabel,
      refreshLabel: autoRefreshSummary.lastRefreshLabel,
      teamNote: payload.teamNote,
      toRecipients: payload.toRecipients,
      url: payload.absoluteUrl,
    });

    return {
      ...payload,
      emailBody,
      emailDocument,
      emailMailtoUrl: buildWorkbenchDailyBriefingMailtoUrl({
        ccRecipients: payload.ccRecipients,
        emailBody,
        emailSubject,
        toRecipients: payload.toRecipients,
      }),
      emailSubject,
      briefingDocument,
    };
  };

  const handleCopyDailyBriefing = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制今日简报');
      return;
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } = buildDailyBriefingSharePayload();
    const briefingText = buildWorkbenchDailyBriefingText({
      briefing: workbenchDailyBriefing,
      brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      url: absoluteUrl,
    });

    try {
      await navigator.clipboard.writeText(briefingText);
      message.success('今日简报已复制');
    } catch (error) {
      message.error('复制今日简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingMarkdown = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制 Markdown 简报');
      return;
    }

    const { absoluteUrl, brandLabel, exportedAtLabel, focusLabel, morningPresetLabel, teamNote } = buildDailyBriefingSharePayload();
    const briefingText = buildWorkbenchDailyBriefingMarkdown({
      briefing: workbenchDailyBriefing,
      brandLabel,
      currentViewLabel: workbenchViewSummary.headline,
      exportedAtLabel,
      focusLabel,
      morningPresetLabel,
      teamNote,
      url: absoluteUrl,
    });

    try {
      await navigator.clipboard.writeText(briefingText);
      message.success('Markdown 简报已复制');
    } catch (error) {
      message.error('复制 Markdown 简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingHtml = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制 HTML 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(briefingDocument);
      message.success('HTML 简报已复制');
    } catch (error) {
      message.error('复制 HTML 简报失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingEmailBody = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制邮件正文');
      return;
    }

    const { emailBody } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailBody);
      message.success('邮件正文已复制');
    } catch (error) {
      message.error('复制邮件正文失败，请稍后重试');
    }
  };

  const handleCopyDailyBriefingEmailSubject = async () => {
    if (!navigator?.clipboard?.writeText) {
      message.warning('当前环境不支持复制邮件主题');
      return;
    }

    const { emailSubject } = buildDailyBriefingShareArtifacts();

    try {
      await navigator.clipboard.writeText(emailSubject);
      message.success('邮件主题已复制');
    } catch (error) {
      message.error('复制邮件主题失败，请稍后重试');
    }
  };

  const handleOpenDailyBriefingShareCard = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持分享卡片预览');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const shareWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=760');

    if (!shareWindow?.document) {
      message.warning('分享窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    shareWindow.document.write(briefingDocument);
    shareWindow.document.close();
  };

  const handleOpenDailyBriefingEmailTemplatePage = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持邮件模板页预览');
      return;
    }

    const { emailDocument } = buildDailyBriefingShareArtifacts();
    const emailWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=820');

    if (!emailWindow?.document) {
      message.warning('邮件模板窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    emailWindow.document.write(emailDocument);
    emailWindow.document.close();
  };

  const handleOpenDailyBriefingMailDraft = () => {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      message.warning('当前环境不支持打开邮件草稿');
      return;
    }

    const { emailMailtoUrl, toRecipients } = buildDailyBriefingShareArtifacts();
    if (!toRecipients) {
      message.warning('请先设置收件人模板，再打开邮件草稿');
      return;
    }

    const mailWindow = window.open(emailMailtoUrl, '_blank', 'noopener,noreferrer');

    if (!mailWindow) {
      message.warning('邮件客户端草稿窗口被浏览器拦截了，请允许弹窗后重试');
      return;
    }

    message.success('已尝试打开邮件草稿');
  };

  const handleDownloadDailyBriefingHtml = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Blob === 'undefined') {
      message.warning('当前环境不支持下载 HTML 简报');
      return;
    }
    if (!window.URL?.createObjectURL || !window.URL?.revokeObjectURL) {
      message.warning('当前环境不支持下载 HTML 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      symbol: selectedTask?.symbol || '',
      taskId: selectedTaskId,
    });

    try {
      const blob = new Blob([briefingDocument], { type: 'text/html;charset=utf-8' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      message.success(`HTML 简报已下载：${filename}`);
    } catch (error) {
      message.error('下载 HTML 简报失败，请稍后重试');
    }
  };

  const handleExportDailyBriefingPdf = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      message.warning('当前环境不支持导出 PDF 简报');
      return;
    }

    const { briefingDocument } = buildDailyBriefingShareArtifacts();
    const filename = buildWorkbenchDailyBriefingFilename({
      extension: 'pdf',
      symbol: selectedTask?.symbol || '',
      taskId: selectedTaskId,
    });

    setDailyBriefingPdfExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const cleanup = mountDailyBriefingShareContainer(briefingDocument);

      try {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
        });

        await new Promise((resolve, reject) => {
          try {
            pdf.html(document.querySelector('[data-testid="daily-briefing-pdf-source"]'), {
              autoPaging: 'text',
              callback: () => resolve(),
              html2canvas: {
                backgroundColor: '#f8fafc',
                scale: 1,
                useCORS: true,
              },
              margin: [24, 24, 24, 24],
              width: 547,
              windowWidth: 920,
            });
          } catch (error) {
            reject(error);
          }
        });

        pdf.save(filename);
        message.success(`PDF 简报已下载：${filename}`);
      } finally {
        cleanup();
      }
    } catch (error) {
      message.error('导出 PDF 简报失败，请稍后重试');
    } finally {
      setDailyBriefingPdfExporting(false);
    }
  };

  const handleOpenDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed((current) => current || new Date().toISOString());
  };

  const handleCloseDailyBriefingPreviewDrawer = () => {
    setDailyBriefingPreviewSeed(null);
  };

  const handleRefreshDailyBriefingPreview = () => {
    setDailyBriefingPreviewSeed(new Date().toISOString());
  };

  const dailyBriefingPreviewArtifacts = dailyBriefingPreviewSeed
    ? buildDailyBriefingShareArtifacts(new Date(dailyBriefingPreviewSeed))
    : null;
  const dailyBriefingPreviewMailDraftStatus = dailyBriefingPreviewArtifacts?.emailMailtoUrl
    ? dailyBriefingPreviewArtifacts.toRecipients
      ? '已生成，可用上方“打开邮件草稿”创建本地邮件'
      : '已生成，但尚未设置收件人模板；可先补全收件人后再打开邮件草稿'
    : '未生成';
  const canOpenDailyBriefingPreviewMailDraft = Boolean(dailyBriefingPreviewArtifacts?.toRecipients);

  const handleApplyMorningPreset = () => {
    if (!morningPresetCandidate) {
      message.info('当前没有可应用的晨间默认视图');
      return;
    }

    if (morningPresetActive) {
      message.info('当前已经在晨间默认视图');
      return;
    }

    const applied = applyMorningPreset({ source: 'manual' });
    if (applied) {
      message.success(`已切回${morningPresetCandidate.label}`);
    }
  };

  const handleBulkQueueCurrentView = async () => {
    if (!workbenchViewSummary.hasActiveFilters) {
      message.warning('请先在筛选视图下操作，避免误改全量任务');
      return;
    }
    if (!bulkStatusTaskIds.length) {
      message.info('当前视图里没有可推进到进行中的任务');
      return;
    }

    setSaving(true);
    try {
      const response = await bulkUpdateResearchTasks({
        task_ids: bulkStatusTaskIds,
        status: 'in_progress',
      });
      message.success(`已将 ${response?.total || bulkStatusTaskIds.length} 个任务推进到进行中`);
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '批量推进任务失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkCommentCurrentView = async () => {
    if (!workbenchViewSummary.hasActiveFilters) {
      message.warning('请先在筛选视图下操作，避免误改全量任务');
      return;
    }
    if (!bulkCommentTaskIds.length) {
      message.info('当前视图里没有可写入复盘评论的任务');
      return;
    }

    setSaving(true);
    try {
      const response = await bulkUpdateResearchTasks({
        task_ids: bulkCommentTaskIds,
        comment: bulkReviewComment,
        author: 'local',
      });
      message.success(`已为 ${response?.total || bulkCommentTaskIds.length} 个任务写入复盘评论`);
      await refreshCurrentTask();
    } catch (error) {
      message.error(error.userMessage || error.message || '批量写入复盘评论失败');
    } finally {
      setSaving(false);
    }
  };

  const renderBoardCard = (task, status) => {
    const isOverTarget = dragState?.overTaskId === task.id && dragState?.overStatus === status;
    const refreshSignal = refreshSignals.byTaskId[task.id];
    return (
      <WorkbenchTaskCard
        task={task}
        status={status}
        isSelected={selectedTaskId === task.id}
        isOverTarget={isOverTarget}
        refreshSignal={refreshSignal}
        onSelect={() => setSelectedTaskId(task.id)}
        onDragStart={() => setDragState({ taskId: task.id, sourceStatus: status, overTaskId: null, overStatus: null })}
        onDragEnd={() => setDragState(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragState((current) => (current ? { ...current, overTaskId: task.id, overStatus: status } : current));
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleDrop(status, task.id);
        }}
      />
    );
  };

  return (
    <WorkbenchShell
      bulkCommentCount={bulkCommentTaskIds.length}
      bulkQueueCount={bulkStatusTaskIds.length}
      contextItems={workbenchContextItems}
      heroBriefItems={workbenchHeroBriefItems}
      heroMetrics={workbenchHeroMetrics}
      onBulkComment={handleBulkCommentCurrentView}
      onBulkQueue={handleBulkQueueCurrentView}
      onCopyViewLink={handleCopyWorkbenchViewLink}
      saving={saving}
      viewSummary={workbenchViewSummary}
    >
      <div className="app-page-section-block">
        <div className="app-page-section-kicker">筛选与复盘节奏</div>
        <section className="app-page-workspace-surface workbench-overview-surface">
          <WorkbenchOverviewPanels
            activeDailyBriefingEmailPresetId={activeDailyBriefingEmailPresetId}
            autoRefreshSummary={autoRefreshSummary}
            dailyBriefingBrandLabel={DAILY_BRIEFING_BRAND_LABEL}
            dailyBriefing={workbenchDailyBriefing}
            dailyBriefingEmailCcRecipients={dailyBriefingEmailCcRecipients}
            dailyBriefingDeliveryHistory={dailyBriefingDeliveryHistory}
            dailyBriefingDefaultEmailPresetId={dailyBriefingDefaultEmailPresetId}
            dailyBriefingDistributionConfig={dailyBriefingDistributionConfig}
            dailyBriefingDistributionSaving={dailyBriefingDistributionSaving}
            dailyBriefingDryRunRunning={dailyBriefingDryRunRunning}
            dailyBriefingEmailPresets={dailyBriefingEmailPresets}
            dailyBriefingEmailRecipients={dailyBriefingEmailRecipients}
            dailyBriefingNotificationChannelOptions={dailyBriefingNotificationChannelOptions}
            dailyBriefingPdfExporting={dailyBriefingPdfExporting}
            dailyBriefingRetryingRecordId={dailyBriefingRetryingRecordId}
            dailyBriefingSchedule={dailyBriefingSchedule}
            dailyBriefingSending={dailyBriefingSending}
            dailyBriefingTeamNote={dailyBriefingTeamNote}
            filters={filters}
            morningPresetActive={morningPresetActive}
            morningPresetCandidate={morningPresetCandidate}
            morningPresetSummary={morningPresetSummary}
            onAddDailyBriefingEmailPreset={handleAddDailyBriefingEmailPreset}
            onApplyDailyBriefingEmailPreset={handleApplyDailyBriefingEmailPreset}
            onApplyMorningPreset={handleApplyMorningPreset}
            onChangeDailyBriefingEmailPresetName={handleChangeDailyBriefingEmailPresetName}
            onChangeDailyBriefingEmailCcRecipients={setDailyBriefingEmailCcRecipients}
            onChangeDailyBriefingDistributionEnabled={setDailyBriefingDistributionEnabled}
            onChangeDailyBriefingDistributionTime={setDailyBriefingDistributionTime}
            onChangeDailyBriefingDistributionTimezone={setDailyBriefingDistributionTimezone}
            onChangeDailyBriefingDistributionWeekdays={setDailyBriefingDistributionWeekdays}
            onChangeDailyBriefingNotificationChannels={setDailyBriefingNotificationChannels}
            onChangeDailyBriefingEmailRecipients={setDailyBriefingEmailRecipients}
            onChangeDailyBriefingNote={setDailyBriefingTeamNote}
            onCopyDailyBriefing={handleCopyDailyBriefing}
            onCopyDailyBriefingEmailBody={handleCopyDailyBriefingEmailBody}
            onCopyDailyBriefingEmailSubject={handleCopyDailyBriefingEmailSubject}
            onCopyDailyBriefingHtml={handleCopyDailyBriefingHtml}
            onCopyDailyBriefingMarkdown={handleCopyDailyBriefingMarkdown}
            onClearDailyBriefingEmailCcRecipients={() => setDailyBriefingEmailCcRecipients('')}
            onClearDailyBriefingEmailRecipients={() => setDailyBriefingEmailRecipients('')}
            onClearDailyBriefingNote={() => setDailyBriefingTeamNote('')}
            onDownloadDailyBriefingHtml={handleDownloadDailyBriefingHtml}
            onExportDailyBriefingPdf={handleExportDailyBriefingPdf}
            onDeleteDailyBriefingEmailPreset={handleDeleteDailyBriefingEmailPreset}
            onMoveDailyBriefingEmailPreset={handleMoveDailyBriefingEmailPreset}
            onOpenDailyBriefingMailDraft={handleOpenDailyBriefingMailDraft}
            onOpenDailyBriefingEmailTemplatePage={handleOpenDailyBriefingEmailTemplatePage}
            onOpenDailyBriefingPreviewDrawer={handleOpenDailyBriefingPreviewDrawer}
            onOpenDailyBriefingShareCard={handleOpenDailyBriefingShareCard}
            onOpenQueueCrossMarket={() => handleOpenQueueByMode('cross_market')}
            onOpenQueueLead={handleOpenQueueLead}
            onOpenQueuePricing={() => handleOpenQueueByMode('pricing')}
            onCopyViewLink={handleCopyWorkbenchViewLink}
            onRefreshNow={() => refreshCurrentTask({ trigger: 'manual' })}
            onRunDailyBriefingDryRun={handleRunDailyBriefingDryRun}
            onSaveDailyBriefingEmailPreset={handleSaveDailyBriefingEmailPreset}
            onSaveDailyBriefingDistribution={handleSaveDailyBriefingDistribution}
            onSendDailyBriefing={handleSendDailyBriefing}
            onRetryDailyBriefingDelivery={handleRetryDailyBriefingDelivery}
            onSetDefaultDailyBriefingEmailPreset={handleSetDefaultDailyBriefingEmailPreset}
            onSetAutoRefreshInterval={setAutoRefreshIntervalMs}
            onToggleAutoRefresh={() => setAutoRefreshEnabled((current) => !current)}
            queueLaunchSummary={queueLaunchSummary}
            refreshStats={refreshStats}
            setFilters={setFilters}
            sourceOptions={sourceOptions}
            stats={stats}
            snapshotSummaryOptions={snapshotSummaryOptions}
            TYPE_OPTIONS={TYPE_OPTIONS}
            REFRESH_OPTIONS={REFRESH_OPTIONS}
            SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
            REASON_OPTIONS={REASON_OPTIONS}
          />
        </section>
      </div>

      <div className="app-page-section-block">
        <div className="app-page-section-kicker">看板与详情</div>
        <section className="app-page-workspace-surface workbench-main-surface">
          <Row gutter={[16, 16]} align="top">
            <Col xs={24} xl={16}>
              <WorkbenchBoardSection
                archivedTasks={archivedTasks}
                boardColumns={boardColumns}
                dragState={dragState}
                filters={filters}
                onCopyViewLink={handleCopyWorkbenchViewLink}
                handleDrop={handleDrop}
                handleRestoreArchived={handleRestoreArchived}
                loading={loading}
                renderBoardCard={renderBoardCard}
                refreshStats={refreshStats}
                saving={saving}
                setDragState={setDragState}
                setFilters={setFilters}
                setSelectedTaskId={setSelectedTaskId}
                setShowArchived={setShowArchived}
                showArchived={showArchived}
                snapshotSummaryOptions={snapshotSummaryOptions}
                sourceOptions={sourceOptions}
                TYPE_OPTIONS={TYPE_OPTIONS}
                REFRESH_OPTIONS={REFRESH_OPTIONS}
                SNAPSHOT_VIEW_OPTIONS={SNAPSHOT_VIEW_OPTIONS}
                REASON_OPTIONS={REASON_OPTIONS}
              />
            </Col>

            <Col xs={24} xl={8} className="workbench-detail-column">
              <WorkbenchDetailPanel
                commentDraft={commentDraft}
                detailLoading={detailLoading}
                handleAddComment={handleAddComment}
                handleCopyViewLink={handleCopyWorkbenchViewLink}
                handleDelete={handleDelete}
                handleDeleteComment={handleDeleteComment}
                handleMetaSave={handleMetaSave}
                handleOpenMatchingQueueNext={handleOpenMatchingQueueNext}
                handleOpenNextTask={handleOpenNextTask}
                handleOpenTask={handleOpenTask}
                handleRestoreArchived={handleRestoreArchived}
                handleSelectMatchingQueueNext={() => handleSelectMatchingQueueTask(1)}
                handleSelectMatchingQueuePrevious={() => handleSelectMatchingQueueTask(-1)}
                handleSelectQueueNext={() => handleSelectQueueTask(1)}
                handleSelectQueuePrevious={() => handleSelectQueueTask(-1)}
                handleStatusUpdate={handleStatusUpdate}
                latestSnapshotComparison={latestSnapshotComparison}
                noteDraft={noteDraft}
                openTaskPriorityLabel={openTaskPriorityLabel}
                selectedMatchingQueueMeta={selectedMatchingQueueMeta}
                selectedTaskPriorityMeta={selectedTaskPriorityMeta}
                selectedTaskQueueMeta={selectedTaskQueueMeta}
                saving={saving}
                selectedTask={selectedTask}
                selectedTaskRefreshSignal={selectedTaskRefreshSignal}
                setCommentDraft={setCommentDraft}
                setNoteDraft={setNoteDraft}
                setShowAllTimeline={setShowAllTimeline}
                setTitleDraft={setTitleDraft}
                showAllTimeline={showAllTimeline}
                timeline={timeline}
                timelineItems={timelineItems}
                titleDraft={titleDraft}
                workbenchViewSummary={workbenchViewSummary}
              />
            </Col>
          </Row>
        </section>
      </div>
      <Drawer
        rootClassName="workbench-daily-briefing-preview-drawer"
        title={<span className="workbench-daily-briefing-preview-title">每日简报预览</span>}
        placement="right"
        width="min(920px, 100vw)"
        onClose={handleCloseDailyBriefingPreviewDrawer}
        open={Boolean(dailyBriefingPreviewArtifacts)}
        extra={(
          <Space wrap className="workbench-daily-briefing-preview-actions">
            <Button size="small" onClick={handleRefreshDailyBriefingPreview}>
              刷新预览时间
            </Button>
            <Button size="small" onClick={handleCopyDailyBriefingHtml}>
              复制 HTML
            </Button>
            <Button size="small" onClick={handleCopyDailyBriefingEmailSubject}>
              复制邮件主题
            </Button>
            <Button size="small" onClick={handleCopyDailyBriefingEmailBody}>
              复制邮件正文
            </Button>
            <Button size="small" onClick={handleDownloadDailyBriefingHtml}>
              下载 HTML
            </Button>
            <Button size="small" onClick={handleOpenDailyBriefingEmailTemplatePage}>
              打开邮件模板页
            </Button>
            <Button
              size="small"
              onClick={handleOpenDailyBriefingMailDraft}
              disabled={!canOpenDailyBriefingPreviewMailDraft}
              title={canOpenDailyBriefingPreviewMailDraft ? '打开邮件草稿' : '请先设置收件人模板'}
            >
              打开邮件草稿
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={handleExportDailyBriefingPdf}
              loading={dailyBriefingPdfExporting}
            >
              导出 PDF
            </Button>
          </Space>
        )}
      >
        {dailyBriefingPreviewArtifacts ? (
          <div className="workbench-daily-briefing-preview-content">
            <div className="workbench-daily-briefing-preview-meta">
              <Text strong className="workbench-daily-briefing-preview-meta-title">
                当前分享卡片 HTML、PDF 与下载文件共用这份内容。
              </Text>
              <Text type="secondary">
                {`导出时间：${dailyBriefingPreviewArtifacts.exportedAtLabel || '未生成'}`}
              </Text>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {`收件人模板：${dailyBriefingPreviewArtifacts.toRecipients || '未设置'}`}
              </Text>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {`抄送模板：${dailyBriefingPreviewArtifacts.ccRecipients || '未设置'}`}
              </Text>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {`邮件主题：${dailyBriefingPreviewArtifacts.emailSubject || '未生成'}`}
              </Text>
              <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                {`邮件草稿：${dailyBriefingPreviewMailDraftStatus}`}
              </Text>
              {dailyBriefingPreviewArtifacts.teamNote ? (
                <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  {`团队备注：${dailyBriefingPreviewArtifacts.teamNote}`}
                </Text>
              ) : (
                <Text type="secondary">当前还没有填写团队备注。</Text>
              )}
            </div>
            <iframe
              className="workbench-daily-briefing-preview-frame"
              title="研究工作台每日简报预览"
              srcDoc={dailyBriefingPreviewArtifacts.briefingDocument}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        ) : null}
      </Drawer>
    </WorkbenchShell>
  );
}

export default ResearchWorkbench;
