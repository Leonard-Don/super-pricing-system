// ---------------------------------------------------------------------------
// workbenchUtils — ported from
// frontend/src/components/research-workbench/workbenchUtils.js
// ---------------------------------------------------------------------------

import { extractWorkbenchViewFingerprint } from './workbenchViewFingerprint';

export const MAIN_STATUSES = ['new', 'in_progress', 'blocked', 'complete'] as const;

export const STATUS_LABEL: Record<string, string> = {
  new: '新建',
  in_progress: '进行中',
  blocked: '阻塞',
  complete: '已完成',
  archived: '已归档',
};

export const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: 'Pricing', value: 'pricing' },
  { label: 'Cross-Market', value: 'cross_market' },
  { label: 'Macro Mispricing', value: 'macro_mispricing' },
  { label: 'Trade Thesis', value: 'trade_thesis' },
] as const;

export const REFRESH_OPTIONS = [
  { label: '全部更新状态', value: '' },
  { label: '建议更新', value: 'high' },
  { label: '建议复核', value: 'medium' },
  { label: '继续观察', value: 'low' },
] as const;

export const SNAPSHOT_VIEW_OPTIONS = [
  { label: '全部快照视角', value: '' },
  { label: '带筛选视角快照', value: 'filtered' },
  { label: '带任务焦点快照', value: 'scoped' },
] as const;

export const REASON_OPTIONS = [
  { label: '全部更新原因', value: '' },
  { label: '自动排序首次入列', value: 'priority_new' },
  { label: '自动排序升档', value: 'priority_escalated' },
  { label: '自动排序缓和', value: 'priority_relaxed' },
  { label: '自动排序同类更新', value: 'priority_updated' },
  { label: '共振驱动', value: 'resonance' },
  { label: '核心腿受压', value: 'bias_quality_core' },
  { label: '降级运行', value: 'selection_quality_active' },
  { label: '复核语境切换', value: 'review_context' },
  { label: '结构衰败/系统雷达', value: 'structural_decay' },
  { label: '交易 Thesis 漂移', value: 'trade_thesis' },
  { label: '人的维度', value: 'people_layer' },
  { label: '人的维度', value: 'people_fragility' },
  { label: '部门混乱', value: 'department_chaos' },
  { label: '政策执行混乱', value: 'policy_execution' },
  { label: '自动降级', value: 'selection_quality' },
  { label: '输入可靠度', value: 'input_reliability' },
  { label: '来源健康退化', value: 'source_health_degradation' },
  { label: '政策源驱动', value: 'policy_source' },
  { label: '偏置收缩', value: 'bias_quality' },
] as const;

export const REFRESH_REASON_LABELS: Record<string, string> = {
  resonance: '共振驱动',
  bias_quality_core: '核心腿受压',
  selection_quality_active: '降级运行',
  review_context: '复核语境切换',
  structural_decay: '结构衰败/系统雷达',
  trade_thesis: '交易 Thesis 漂移',
  people_layer: '人的维度',
  people_fragility: '人的维度',
  department_chaos: '部门混乱',
  policy_execution: '政策执行混乱',
  selection_quality: '自动降级',
  input_reliability: '输入可靠度',
  source_health_degradation: '来源健康退化',
  policy_source: '政策源驱动',
  bias_quality: '偏置收缩',
  macro: '宏观信号漂移',
  alt_data: '另类数据变化',
  factor_shift: '因子信号变化',
  observe: '继续观察',
};

export const formatRefreshReasonLabel = (reason = 'observe'): string =>
  REFRESH_REASON_LABELS[reason] ?? REFRESH_REASON_LABELS.observe;

export const REFRESH_PRIORITY_CHANGE_LABELS: Record<string, string> = {
  new: '首次记录',
  escalated: '升级',
  relaxed: '缓和',
  updated: '更新',
};

export const REFRESH_PRIORITY_CHANGE_COLORS: Record<string, string> = {
  new: 'blue',
  escalated: 'red',
  relaxed: 'green',
  updated: 'gold',
};

export const formatRefreshPriorityChangeLabel = (changeType = 'updated'): string =>
  REFRESH_PRIORITY_CHANGE_LABELS[changeType] ?? REFRESH_PRIORITY_CHANGE_LABELS.updated;

export const getRefreshPriorityChangeColor = (changeType = 'updated'): string =>
  REFRESH_PRIORITY_CHANGE_COLORS[changeType] ?? REFRESH_PRIORITY_CHANGE_COLORS.updated;

interface WorkbenchOption {
  value?: string;
  label?: string;
}

export const findWorkbenchOptionLabel = (
  options: WorkbenchOption[] = [],
  value = '',
  fallback = '',
): string => {
  if (!value) {
    return '';
  }

  const matchedOption = (options ?? []).find((option) => option?.value === value);
  return matchedOption?.label ?? fallback ?? value;
};

interface WorkbenchFilters {
  keyword?: string;
  reason?: string;
  refresh?: string;
  snapshotView?: string;
  snapshotFingerprint?: string;
  snapshotSummary?: string;
  type?: string;
  source?: string;
  [key: string]: string | undefined;
}

interface ActiveFilterItem {
  field: string;
  color: string;
  text: string;
}

export const buildActiveWorkbenchFilterMeta = (
  filters: WorkbenchFilters = {},
  {
    reasonOptions = [] as WorkbenchOption[],
    refreshOptions = [] as WorkbenchOption[],
    snapshotViewOptions = [] as WorkbenchOption[],
    typeOptions = [] as WorkbenchOption[],
    sourceOptions = [] as WorkbenchOption[],
  } = {},
): ActiveFilterItem[] => {
  const keyword = filters?.keyword?.trim?.() ?? '';
  const reason = filters?.reason ?? '';
  const refresh = filters?.refresh ?? '';
  const snapshotView = filters?.snapshotView ?? '';
  const snapshotFingerprint = filters?.snapshotFingerprint ?? '';
  const snapshotSummary = filters?.snapshotSummary?.trim?.() ?? '';
  const type = filters?.type ?? '';
  const source = filters?.source ?? '';

  const items: ActiveFilterItem[] = [];

  if (reason) {
    items.push({
      field: 'reason',
      color: reason.startsWith('priority_') ? 'magenta' : 'purple',
      text: `${reason.startsWith('priority_') ? '快速视图' : '更新原因'}：${findWorkbenchOptionLabel(reasonOptions, reason, formatRefreshReasonLabel(reason))}`,
    });
  }

  if (keyword) {
    items.push({
      field: 'keyword',
      color: 'processing',
      text: `关键词：${keyword}`,
    });
  }

  if (refresh) {
    items.push({
      field: 'refresh',
      color: 'gold',
      text: `更新级别：${findWorkbenchOptionLabel(refreshOptions, refresh, refresh)}`,
    });
  }

  if (snapshotView) {
    items.push({
      field: 'snapshotView',
      color: 'lime',
      text: `快照视角：${findWorkbenchOptionLabel(snapshotViewOptions, snapshotView, snapshotView)}`,
    });
  }

  if (snapshotSummary || snapshotFingerprint) {
    items.push({
      field: 'snapshotSummary',
      color: 'volcano',
      text: `研究视角：${snapshotSummary || snapshotFingerprint}`,
    });
  }

  if (type) {
    items.push({
      field: 'type',
      color: 'geekblue',
      text: `类型：${findWorkbenchOptionLabel(typeOptions, type, type)}`,
    });
  }

  if (source) {
    items.push({
      field: 'source',
      color: 'cyan',
      text: `来源：${findWorkbenchOptionLabel(sourceOptions, source, source)}`,
    });
  }

  return items;
};

interface BuildViewSummaryOptions {
  reasonOptions?: WorkbenchOption[];
  refreshOptions?: WorkbenchOption[];
  snapshotViewOptions?: WorkbenchOption[];
  typeOptions?: WorkbenchOption[];
  sourceOptions?: WorkbenchOption[];
  selectedTaskId?: string;
  selectedTaskTitle?: string;
}

export const buildWorkbenchViewSummary = (
  filters: WorkbenchFilters = {},
  {
    reasonOptions = [],
    refreshOptions = [],
    snapshotViewOptions = [],
    typeOptions = [],
    sourceOptions = [],
    selectedTaskId = '',
    selectedTaskTitle = '',
  }: BuildViewSummaryOptions = {},
) => {
  const activeFilterMeta = buildActiveWorkbenchFilterMeta(filters, {
    reasonOptions,
    refreshOptions,
    snapshotViewOptions,
    typeOptions,
    sourceOptions,
  });
  const summaryText = activeFilterMeta.length
    ? activeFilterMeta.map((item) => item.text).join(' · ')
    : '全部任务视图';
  const scopedTaskLabel = selectedTaskTitle
    ? `当前定位：${selectedTaskTitle}`
    : selectedTaskId
      ? `当前定位：${selectedTaskId}`
      : '';

  return {
    hasActiveFilters: activeFilterMeta.length > 0,
    headline: summaryText,
    note: activeFilterMeta.length
      ? '打开这个链接后，工作台会恢复到同一组筛选条件和当前任务焦点。'
      : '当前没有额外筛选，分享后会打开完整工作台视图。',
    scopedTaskLabel,
  };
};

export const hasActiveWorkbenchFilters = (filters: WorkbenchFilters = {}): boolean => Boolean(
  filters?.type
  || filters?.source
  || filters?.refresh
  || filters?.reason
  || filters?.snapshotView
  || filters?.snapshotFingerprint
  || filters?.snapshotSummary
  || filters?.keyword?.trim?.(),
);

export const matchesWorkbenchFilterPreset = (
  filters: WorkbenchFilters = {},
  presetFilters: WorkbenchFilters = {},
): boolean => {
  const normalizedCurrent = {
    type: filters?.type ?? '',
    source: filters?.source ?? '',
    refresh: filters?.refresh ?? '',
    reason: filters?.reason ?? '',
    snapshotView: filters?.snapshotView ?? '',
    snapshotFingerprint: filters?.snapshotFingerprint ?? '',
    snapshotSummary: filters?.snapshotSummary ?? '',
    keyword: filters?.keyword?.trim?.() ?? '',
  };
  const normalizedPreset = {
    type: presetFilters?.type ?? '',
    source: presetFilters?.source ?? '',
    refresh: presetFilters?.refresh ?? '',
    reason: presetFilters?.reason ?? '',
    snapshotView: presetFilters?.snapshotView ?? '',
    snapshotFingerprint: presetFilters?.snapshotFingerprint ?? '',
    snapshotSummary: presetFilters?.snapshotSummary ?? '',
    keyword: presetFilters?.keyword?.trim?.() ?? '',
  };

  return Object.keys(normalizedCurrent).every(
    (key) => normalizedCurrent[key as keyof typeof normalizedCurrent] === normalizedPreset[key as keyof typeof normalizedPreset],
  );
};

const padDatePart = (value: number): string => String(value).padStart(2, '0');

export const buildMorningWorkbenchSessionKey = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  return `research_workbench_morning_view:${year}-${month}-${day}`;
};

export const isMorningWorkbenchWindow = (date = new Date()): boolean => {
  const hour = date.getHours();
  return hour >= 6 && hour < 12;
};

interface RefreshStats {
  priorityEscalated?: number;
  high?: number;
  medium?: number;
  [key: string]: number | undefined;
}

export const buildMorningWorkbenchPreset = (refreshStats: RefreshStats = {}) => {
  if (Number(refreshStats?.priorityEscalated ?? 0) > 0) {
    return {
      filters: { reason: 'priority_escalated' },
      label: '晨间默认视图：自动排序升档',
      note: '先看今天刚升档的任务，避免把真正变紧急的线索埋在长列表里。',
    };
  }

  if (Number(refreshStats?.high ?? 0) > 0) {
    return {
      filters: { refresh: 'high' },
      label: '晨间默认视图：建议更新',
      note: '当前没有升档队列时，优先处理输入已经明显漂移的任务。',
    };
  }

  if (Number(refreshStats?.medium ?? 0) > 0) {
    return {
      filters: { refresh: 'medium' },
      label: '晨间默认视图：建议复核',
      note: '高优先级更新不多时，先扫一轮复核队列更适合作为晨间起手。',
    };
  }

  return null;
};

interface SnapshotPayload {
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export const extractSnapshotViewContext = (snapshot: SnapshotPayload | null = null) => {
  const payload = (snapshot?.payload ?? {}) as Record<string, unknown>;
  const viewContext = (payload.view_context ?? payload.workbench_view_context ?? {}) as Record<string, unknown>;
  return {
    hasFilters: Boolean(viewContext.has_filters),
    fingerprint: extractWorkbenchViewFingerprint(viewContext),
    summary: String(viewContext.summary ?? ''),
    scopedTaskLabel: String(viewContext.scoped_task_label ?? ''),
    note: String(viewContext.note ?? ''),
  };
};

interface WorkbenchTask {
  id: string;
  snapshot?: SnapshotPayload | null;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export const buildSnapshotViewSummaryOptions = (tasks: WorkbenchTask[] = [], limit = 6) => {
  const buckets = new Map<string, {
    value: string;
    fingerprint: string;
    label: string;
    count: number;
    scopedCount: number;
    latestAt: string;
  }>();

  (tasks ?? []).forEach((task) => {
    const snapshotViewContext = extractSnapshotViewContext(task?.snapshot ?? null);
    const summary = String(snapshotViewContext.summary ?? '').trim();
    const fingerprint = String(snapshotViewContext.fingerprint ?? '').trim();
    const bucketKey = fingerprint || summary;
    if (!bucketKey) {
      return;
    }

    const current = buckets.get(bucketKey) ?? {
      value: summary,
      fingerprint,
      label: summary,
      count: 0,
      scopedCount: 0,
      latestAt: '',
    };
    current.count += 1;
    if (snapshotViewContext.scopedTaskLabel) {
      current.scopedCount += 1;
    }

    const latestAt = String((task?.snapshot as Record<string, unknown>)?.saved_at ?? task?.updated_at ?? task?.created_at ?? '');
    if (latestAt && (!current.latestAt || latestAt > current.latestAt)) {
      current.latestAt = latestAt;
    }

    buckets.set(bucketKey, current);
  });

  return Array.from(buckets.values())
    .sort((left, right) =>
      Number(right.count ?? 0) - Number(left.count ?? 0)
      || Number(right.scopedCount ?? 0) - Number(left.scopedCount ?? 0)
      || String(right.latestAt ?? '').localeCompare(String(left.latestAt ?? ''))
    )
    .slice(0, limit);
};

interface TimelineEvent {
  type?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export const extractLatestRefreshPriorityEvent = (task: WorkbenchTask | null = null): TimelineEvent | null =>
  (task?.timeline as TimelineEvent[] | undefined ?? []).find((event) => event?.type === 'refresh_priority') ?? null;

export const buildRefreshPriorityChangeSummary = (event: TimelineEvent | null = null): string => {
  const meta = (event?.meta ?? {}) as Record<string, unknown>;
  const changeType = String(meta.change_type ?? '');
  const reasonLabel = String(meta.reason_label ?? '');
  const previousReasonLabel = String(meta.previous_reason_label ?? '');
  const urgencyDelta = meta.urgency_delta;
  const priorityWeightDelta = meta.priority_weight_delta;

  const deltaSummary = [
    urgencyDelta !== undefined && urgencyDelta !== null
      ? `紧急度 ${Number(urgencyDelta) >= 0 ? '+' : ''}${Number(urgencyDelta).toFixed(1)}`
      : '',
    priorityWeightDelta !== undefined && priorityWeightDelta !== null
      ? `排序权重 ${Number(priorityWeightDelta) >= 0 ? '+' : ''}${Number(priorityWeightDelta).toFixed(1)}`
      : '',
  ].filter(Boolean).join(' · ');

  if (changeType === 'new') {
    return '首次进入自动排序队列';
  }

  if (changeType === 'escalated') {
    return [
      previousReasonLabel ? `较上次从${previousReasonLabel}升档` : `较上次${reasonLabel || '自动排序'}升档`,
      deltaSummary,
    ].filter(Boolean).join(' · ');
  }

  if (changeType === 'relaxed') {
    return [
      previousReasonLabel ? `较上次从${previousReasonLabel}缓和` : `较上次${reasonLabel || '自动排序'}缓和`,
      deltaSummary,
    ].filter(Boolean).join(' · ');
  }

  if (changeType === 'updated') {
    return meta.reason_changed && previousReasonLabel
      ? `自动排序原因由${previousReasonLabel}切换到${reasonLabel || '当前原因'}`
      : '同类风险仍在驱动自动排序';
  }

  return '';
};

export const STATUS_COLOR: Record<string, string> = {
  new: 'blue',
  in_progress: 'processing',
  blocked: 'orange',
  complete: 'green',
  archived: 'default',
};

export const TIMELINE_COLOR: Record<string, string> = {
  created: 'blue',
  status_changed: 'orange',
  snapshot_saved: 'green',
  metadata_updated: 'purple',
  comment_added: 'cyan',
  comment_deleted: 'red',
  board_reordered: 'gold',
  refresh_priority: 'red',
};

export const formatPricingScenarioSummary = (scenarios: Array<Record<string, unknown>> = []): string => {
  const bearCase = (scenarios ?? []).find((item) => item?.name === 'bear') ?? null;
  const baseCase = (scenarios ?? []).find((item) => item?.name === 'base') ?? null;
  const bullCase = (scenarios ?? []).find((item) => item?.name === 'bull') ?? null;
  const summaryParts = [
    bearCase?.intrinsic_value != null ? `悲观 ${Number(bearCase.intrinsic_value).toFixed(2)}` : null,
    baseCase?.intrinsic_value != null ? `基准 ${Number(baseCase.intrinsic_value).toFixed(2)}` : null,
    bullCase?.intrinsic_value != null ? `乐观 ${Number(bullCase.intrinsic_value).toFixed(2)}` : null,
  ].filter(Boolean);

  return summaryParts.length ? `DCF 情景 ${summaryParts.join(' / ')}` : '';
};

interface RefreshSignal {
  urgencyScore?: number;
  priorityWeight?: number;
  severity?: string;
  [key: string]: unknown;
}

export const sortTasksByRefreshPriority = (
  tasks: WorkbenchTask[] = [],
  refreshLookup: Record<string, RefreshSignal> = {},
  enablePriority = false,
): WorkbenchTask[] => {
  const list = [...tasks];
  if (!enablePriority) {
    return list;
  }

  return list.sort((left, right) => {
    const leftSignal = refreshLookup[left.id] ?? {};
    const rightSignal = refreshLookup[right.id] ?? {};
    if (Number(rightSignal.urgencyScore ?? 0) !== Number(leftSignal.urgencyScore ?? 0)) {
      return Number(rightSignal.urgencyScore ?? 0) - Number(leftSignal.urgencyScore ?? 0);
    }
    if (Number(rightSignal.priorityWeight ?? 0) !== Number(leftSignal.priorityWeight ?? 0)) {
      return Number(rightSignal.priorityWeight ?? 0) - Number(leftSignal.priorityWeight ?? 0);
    }
    return String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''));
  });
};

export const formatContextValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return [obj.symbol, obj.side, obj.asset_class].filter(Boolean).join('/');
        }
        return String(item);
      })
      .join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, item]) => `${key}:${item}`)
      .join(', ');
  }

  return String(value);
};

export const formatTimelineType = (value: string): string => ({
  created: '创建',
  status_changed: '状态',
  snapshot_saved: '快照',
  metadata_updated: '元信息',
  comment_added: '评论',
  comment_deleted: '删除',
  board_reordered: '排序',
  refresh_priority: '自动排序',
}[value] ?? '事件');

export const sortByBoardOrder = (left: WorkbenchTask, right: WorkbenchTask): number => {
  const orderGap = Number(left.board_order ?? 0) - Number(right.board_order ?? 0);
  if (orderGap !== 0) {
    return orderGap;
  }
  return String(left.updated_at ?? '').localeCompare(String(right.updated_at ?? ''));
};

export const orderWorkbenchQueueTasks = (tasks: WorkbenchTask[] = [], enablePriority = false): WorkbenchTask[] => {
  const list = [...tasks];
  if (enablePriority) {
    return list;
  }

  const orderedMain = MAIN_STATUSES.flatMap((status) =>
    list
      .filter((task) => task.status === status)
      .sort(sortByBoardOrder)
  );
  const remainder = list
    .filter((task) => !(MAIN_STATUSES as readonly string[]).includes(String(task.status)))
    .sort(sortByBoardOrder);

  return [...orderedMain, ...remainder];
};

export const normalizeBoardOrders = (tasks: WorkbenchTask[]): WorkbenchTask[] => {
  const cloned = tasks.map((task) => ({ ...task }));
  MAIN_STATUSES.forEach((status) => {
    const lane = cloned.filter((task) => task.status === status).sort(sortByBoardOrder);
    lane.forEach((task, index) => {
      task.board_order = index;
    });
  });
  return cloned;
};

export const moveBoardTask = (
  tasks: WorkbenchTask[],
  draggedTaskId: string,
  targetStatus: string,
  targetTaskId: string | null = null,
): WorkbenchTask[] => {
  const normalized = normalizeBoardOrders(tasks);
  const draggedTask = normalized.find((task) => task.id === draggedTaskId);
  if (!draggedTask) {
    return normalized;
  }

  const boardMap: Record<string, WorkbenchTask[]> = Object.fromEntries(
    MAIN_STATUSES.map((status) => [
      status,
      normalized.filter((task) => task.status === status).sort(sortByBoardOrder),
    ])
  );

  const sourceStatus = String(draggedTask.status);
  if (boardMap[sourceStatus]) {
    boardMap[sourceStatus] = boardMap[sourceStatus].filter((task) => task.id !== draggedTaskId);
  }

  const nextTask = { ...draggedTask, status: targetStatus };
  const targetLane = [...(boardMap[targetStatus] ?? [])];
  const insertIndex = targetTaskId
    ? Math.max(targetLane.findIndex((task) => task.id === targetTaskId), 0)
    : targetLane.length;
  targetLane.splice(insertIndex, 0, nextTask);
  boardMap[targetStatus] = targetLane;

  MAIN_STATUSES.forEach((status) => {
    (boardMap[status] ?? []).forEach((task, index) => {
      task.board_order = index;
    });
  });

  const archived = normalized.filter((task) => task.status === 'archived');
  return [...MAIN_STATUSES.flatMap((status) => boardMap[status] ?? []), ...archived];
};

export const buildReorderPayload = (tasks: WorkbenchTask[]) =>
  MAIN_STATUSES.flatMap((status) =>
    tasks
      .filter((task) => task.status === status)
      .sort(sortByBoardOrder)
      .map((task, index) => ({
        task_id: task.id,
        status,
        board_order: index,
      }))
  );
