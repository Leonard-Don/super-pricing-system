// ---------------------------------------------------------------------------
// viewModelShared — ported from frontend/src/components/GodEyeDashboard/viewModelShared.js
// No React / antd dependencies. Function names/signatures/behavior identical to old JS.
// ---------------------------------------------------------------------------

import { buildSnapshotComparison } from '@/features/godeye/lib/snapshotCompare';

export const ACTION_MAP: Record<string, { label: string; target: string; focus?: string }> = {
  pricing: { label: '进入定价研究', target: 'pricing' },
  cross_market: { label: '查看跨市场方案', target: 'cross-market', focus: 'template-detail' },
  observe: { label: '继续观察', target: 'observe' },
};

export const COMPANY_SYMBOL_MAP: Record<string, string> = {
  阿里巴巴: 'BABA',
  腾讯: '0700.HK',
  百度: 'BIDU',
  英伟达: 'NVDA',
  台积电: 'TSM',
};

export const TAG_SYMBOL_MAP: Record<string, string> = {
  AI算力: 'NVDA',
  半导体: 'TSM',
  电网: 'DUK',
  核电: 'CEG',
  风电: 'NEE',
  光伏: 'FSLR',
  储能: 'TSLA',
  新能源汽车: 'TSLA',
};

export const TAG_TEMPLATE_MAP: Record<string, string> = {
  AI算力: 'energy_vs_ai_apps',
  半导体: 'copper_vs_semis',
  电网: 'utilities_vs_growth',
  核电: 'energy_vs_ai_apps',
  风电: 'utilities_vs_growth',
  光伏: 'utilities_vs_growth',
  储能: 'energy_vs_ai_apps',
  新能源汽车: 'energy_vs_ai_apps',
};

export const FACTOR_TEMPLATE_MAP: Record<string, string> = {
  bureaucratic_friction: 'utilities_vs_growth',
  tech_dilution: 'defensive_beta_hedge',
  baseload_mismatch: 'energy_vs_ai_apps',
  rate_curve_pressure: 'defensive_beta_hedge',
  credit_spread_stress: 'defensive_beta_hedge',
  fx_mismatch: 'copper_vs_semis',
  people_fragility: 'people_decay_short_vs_cashflow_defensive',
  policy_execution_disorder: 'utilities_vs_growth',
};

export const FACTOR_SYMBOL_MAP: Record<string, string> = {
  bureaucratic_friction: 'QQQ',
  tech_dilution: 'NVDA',
  baseload_mismatch: 'DUK',
  rate_curve_pressure: 'TLT',
  credit_spread_stress: 'HYG',
  fx_mismatch: 'UUP',
  people_fragility: 'BABA',
  policy_execution_disorder: 'DUK',
};

export const formatTemplateName = (templateId = ''): string =>
  String(templateId ?? '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const formatFactorName = (name = ''): string => {
  const mapping: Record<string, string> = {
    bureaucratic_friction: '官僚摩擦',
    tech_dilution: '技术稀释',
    baseload_mismatch: '基荷错配',
    rate_curve_pressure: '利率曲线压力',
    credit_spread_stress: '信用利差压力',
    fx_mismatch: '汇率错配',
    people_fragility: '人的维度脆弱',
    policy_execution_disorder: '政策执行混乱',
  };
  return mapping[String(name ?? '')] ?? String(name ?? '').replace(/_/g, ' ');
};

// ---------------------------------------------------------------------------
// Action builders
// ---------------------------------------------------------------------------

export interface PricingAction {
  label: string;
  target: string;
  symbol: string;
  source: unknown;
  note: unknown;
}

export const buildPricingAction = (
  symbol: string | undefined | null,
  source?: unknown,
  note?: unknown,
): PricingAction | null =>
  symbol
    ? {
        ...ACTION_MAP.pricing,
        symbol,
        source,
        note,
      }
    : null;

export interface CrossMarketAction {
  label: string;
  target: string;
  focus?: string;
  template: string;
  source: unknown;
  note: unknown;
}

export const buildCrossMarketAction = (
  template: string | undefined | null,
  source?: unknown,
  note?: unknown,
): CrossMarketAction | null =>
  template
    ? {
        ...ACTION_MAP.cross_market,
        template,
        source,
        note,
      }
    : null;

export interface WorkbenchAction {
  target: string;
  label: string;
  taskId: string;
  type: string;
  refresh: string;
  reason: string;
  source: unknown;
  note: unknown;
}

export const buildWorkbenchAction = (
  taskId: string | undefined | null,
  source?: unknown,
  note?: unknown,
  reason = '',
  label = '打开任务',
  type = 'cross_market',
): WorkbenchAction | null =>
  taskId
    ? {
        target: 'workbench',
        label,
        taskId,
        type,
        refresh: 'high',
        reason,
        source,
        note,
      }
    : null;

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

interface ReviewContextShift {
  enteredReview?: boolean;
  exitedReview?: boolean;
  changed?: boolean;
}

export const getReviewContextActionLabel = (reviewContextShift: ReviewContextShift | null = null): string => {
  if (reviewContextShift?.enteredReview) {
    return '按复核结果重看';
  }
  if (reviewContextShift?.exitedReview) {
    return '确认恢复普通结果';
  }
  if (reviewContextShift?.changed) {
    return '重新确认结果语境';
  }
  return '优先重看任务';
};

interface InputReliabilityShift {
  enteredFragile?: boolean;
  recoveredRobust?: boolean;
  recoveredFromFragile?: boolean;
  labelChanged?: boolean;
  scoreGap?: unknown;
}

export const getInputReliabilityActionLabel = (inputReliabilityShift: InputReliabilityShift | null = null): string => {
  if (inputReliabilityShift?.enteredFragile) {
    return '先复核输入可靠度';
  }
  if (inputReliabilityShift?.recoveredRobust) {
    return '确认恢复正常强度';
  }
  if (inputReliabilityShift?.recoveredFromFragile) {
    return '确认解除谨慎处理';
  }
  if (
    inputReliabilityShift?.labelChanged ||
    Math.abs(Number(inputReliabilityShift?.scoreGap ?? 0)) >= 0.12
  ) {
    return '重新确认输入质量';
  }
  return '打开任务';
};

// ---------------------------------------------------------------------------
// Task / snapshot helpers
// ---------------------------------------------------------------------------

type SnapshotPayload = Record<string, unknown>;

interface SnapshotLike {
  payload?: SnapshotPayload;
  headline?: unknown;
  saved_at?: unknown;
}

interface SnapshotHistoryEntry {
  payload?: SnapshotPayload;
}

interface TaskLike {
  template?: unknown;
  type?: unknown;
  snapshot?: SnapshotLike;
  snapshot_history?: SnapshotHistoryEntry[];
}

export const extractTemplateMeta = (task: TaskLike = {}): SnapshotPayload =>
  (task?.snapshot?.payload?.template_meta as SnapshotPayload) ??
  (task?.snapshot_history?.[0]?.payload?.template_meta as SnapshotPayload) ??
  {};

export const extractAllocationOverlay = (task: TaskLike = {}): SnapshotPayload =>
  (task?.snapshot?.payload?.allocation_overlay as SnapshotPayload) ??
  (task?.snapshot_history?.[0]?.payload?.allocation_overlay as SnapshotPayload) ??
  {};

export const extractTemplateIdentity = (task: TaskLike = {}, meta: SnapshotPayload = {}): string =>
  String(task.template ?? meta.template_id ?? '');

export const extractDominantDriver = (meta: SnapshotPayload = {}): SnapshotPayload | null => {
  const drivers = meta?.dominant_drivers;
  if (Array.isArray(drivers) && drivers.length > 0) {
    return drivers[0] as SnapshotPayload;
  }
  return null;
};

export const extractRecentComparisonLead = (task: TaskLike = {}): string => {
  const history = task?.snapshot_history ?? [];
  if (history.length < 2 || task?.type !== 'cross_market') {
    return '';
  }
  const [latestSnapshot, previousSnapshot] = history;
  const latestSelectionQuality =
    (latestSnapshot?.payload?.allocation_overlay as Record<string, unknown>)?.selection_quality?.toString() ??
    (latestSnapshot?.payload?.template_meta as Record<string, unknown>)?.selection_quality?.toString();
  const previousSelectionQuality =
    (previousSnapshot?.payload?.allocation_overlay as Record<string, unknown>)?.selection_quality?.toString() ??
    (previousSnapshot?.payload?.template_meta as Record<string, unknown>)?.selection_quality?.toString();
  if (!latestSelectionQuality && !previousSelectionQuality) {
    return '';
  }
  return buildSnapshotComparison(String(task.type ?? ''), history[1], history[0])?.lead ?? '';
};

interface DriverLike {
  label?: unknown;
  key?: unknown;
}

export const formatDriverLabel = (driver: DriverLike = {}): string =>
  String(driver?.label ?? '') || formatFactorName(String(driver?.key ?? ''));

// ---------------------------------------------------------------------------
// Tier / tone builders
// ---------------------------------------------------------------------------

export const buildDisplayTier = (score: number): string => {
  if (score >= 2.6) return '优先部署';
  if (score >= 1.4) return '重点跟踪';
  return '候选方案';
};

export const buildDisplayTone = (score: number): string => {
  if (score >= 2.6) return 'volcano';
  if (score >= 1.4) return 'gold';
  return 'blue';
};
