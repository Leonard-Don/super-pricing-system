/**
 * Daily briefing helpers — TypeScript port of
 * frontend/src/components/research-workbench/dailyBriefingHelpers.js
 *
 * SECURITY FIX: mountDailyBriefingShareContainer previously assigned
 * untrusted HTML directly to `contentElement.innerHTML`.  That raw assignment
 * is an XSS vector flagged in the codebase security assessment.  The TS port
 * sanitizes with DOMPurify.sanitize() before any innerHTML assignment.
 */

import DOMPurify from 'dompurify';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DAILY_BRIEFING_BRAND_LABEL = 'Super Pricing System · Research Workbench';
export const DAILY_BRIEFING_CC_STORAGE_KEY = 'research_workbench_daily_briefing_cc_v1';
export const DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY =
  'research_workbench_daily_briefing_default_email_preset_v1';
export const DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY =
  'research_workbench_daily_briefing_email_presets_v1';
export const DAILY_BRIEFING_NOTE_STORAGE_KEY = 'research_workbench_daily_briefing_note_v1';
export const DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY =
  'research_workbench_daily_briefing_recipients_v1';
export const DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX = 'custom_';
export const DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH = 24;
export const DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX = '自定义分发';
export const DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBriefingEmailPreset {
  id: string;
  name: string;
  toRecipients: string;
  ccRecipients: string;
}

export interface DailyBriefingDistribution {
  enabled: boolean;
  sendTime: string;
  timezone: string;
  weekdays: string[];
  notificationChannels: string[];
  defaultPresetId: string;
  presets: DailyBriefingEmailPreset[];
  toRecipients: string;
  ccRecipients: string;
  teamNote: string;
}

export interface DailyBriefingSchedule {
  enabled: boolean;
  status: string;
  timezone: string;
  sendTime: string;
  weekdays: string[];
  nextRunAt: string;
  nextRunLabel: string;
  reason: string;
}

export interface DailyBriefingNotificationChannelOption {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  source: string;
}

// ---------------------------------------------------------------------------
// Default presets
// ---------------------------------------------------------------------------

export const DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS: DailyBriefingEmailPreset[] = [
  { id: 'morning_sync', name: '晨会', toRecipients: '', ccRecipients: '' },
  { id: 'risk_sync', name: '风险同步', toRecipients: '', ccRecipients: '' },
  { id: 'management_brief', name: '管理层简报', toRecipients: '', ccRecipients: '' },
];

// ---------------------------------------------------------------------------
// Task type labels
// ---------------------------------------------------------------------------

export const TASK_TYPE_LABELS: Record<string, string> = {
  cross_market: '跨市场',
  macro_mispricing: '宏观错价',
  pricing: '定价研究',
  trade_thesis: '交易论点',
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

export function readDailyBriefingLocalValue(storageKey: string): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

export function readDailyBriefingTeamNote(): string {
  return readDailyBriefingLocalValue(DAILY_BRIEFING_NOTE_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Preset normalization
// ---------------------------------------------------------------------------

export function normalizeDailyBriefingEmailPresets(
  rawPresets: unknown[] = [],
): DailyBriefingEmailPreset[] {
  const rawPresetList = Array.isArray(rawPresets) ? rawPresets : [];
  const defaultPresetIds = new Set(DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.map((item) => item.id));
  const presetMap = new Map<string, Record<string, unknown>>(
    rawPresetList
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && 'id' in item)
      .map((item) => [String(item['id']), item]),
  );

  const normalizedDefaultPresets = DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.map((defaultPreset) => {
    const storedPreset = presetMap.get(defaultPreset.id) ?? {};
    const normalizedName = String(storedPreset['name'] ?? '')
      .trim()
      .slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH);
    return {
      id: defaultPreset.id,
      name: normalizedName || defaultPreset.name,
      toRecipients:
        typeof storedPreset['toRecipients'] === 'string' ? storedPreset['toRecipients'] : '',
      ccRecipients:
        typeof storedPreset['ccRecipients'] === 'string' ? storedPreset['ccRecipients'] : '',
    };
  });

  const normalizedCustomPresets = rawPresetList
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        !defaultPresetIds.has(String((item as Record<string, unknown>)['id'])),
    )
    .map((item, index) => {
      const normalizedName = String(item['name'] ?? '')
        .trim()
        .slice(0, DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH);
      return {
        id: String(item['id']),
        name: normalizedName || `${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index + 1}`,
        toRecipients: typeof item['toRecipients'] === 'string' ? item['toRecipients'] : '',
        ccRecipients: typeof item['ccRecipients'] === 'string' ? item['ccRecipients'] : '',
      };
    });

  return [...normalizedDefaultPresets, ...normalizedCustomPresets];
}

export function readDailyBriefingEmailPresets(): DailyBriefingEmailPreset[] {
  const rawValue = readDailyBriefingLocalValue(DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY);

  if (!rawValue) {
    return normalizeDailyBriefingEmailPresets();
  }

  try {
    return normalizeDailyBriefingEmailPresets(JSON.parse(rawValue) as unknown[]);
  } catch {
    return normalizeDailyBriefingEmailPresets();
  }
}

// ---------------------------------------------------------------------------
// Notification channels
// ---------------------------------------------------------------------------

export function parseDailyBriefingNotificationChannels(value: unknown = ''): string[] {
  const rawChannels = Array.isArray(value)
    ? value
    : String(value || 'dry_run').split(/[\s,;]+/);
  const channels = rawChannels.map((item) => String(item ?? '').trim()).filter(Boolean);
  return channels.length ? channels : ['dry_run'];
}

export function normalizeDailyBriefingNotificationChannelOptions(
  channels: unknown[] = [],
): DailyBriefingNotificationChannelOption[] {
  const optionMap = new Map<string, DailyBriefingNotificationChannelOption>();

  (Array.isArray(channels) ? channels : []).forEach((channel) => {
    if (typeof channel !== 'object' || channel === null) return;
    const ch = channel as Record<string, unknown>;
    const id = String(ch['id'] ?? '').trim();
    if (!id || optionMap.has(id)) return;
    optionMap.set(id, {
      id,
      type: String(ch['type'] ?? 'dry_run'),
      label: String(ch['label'] ?? id),
      enabled: ch['enabled'] !== false,
      source: String(ch['source'] ?? ''),
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

// ---------------------------------------------------------------------------
// Schedule + distribution normalization
// ---------------------------------------------------------------------------

export function normalizeDailyBriefingSchedule(schedule: Record<string, unknown> = {}): DailyBriefingSchedule {
  const raw = schedule ?? {};
  return {
    enabled: Boolean(raw['enabled']),
    status: String(raw['status'] ?? 'disabled'),
    timezone: String(raw['timezone'] ?? 'Asia/Shanghai'),
    sendTime: String(raw['send_time'] ?? raw['sendTime'] ?? '09:00'),
    weekdays: Array.isArray(raw['weekdays'])
      ? (raw['weekdays'] as string[])
      : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    nextRunAt: String(raw['next_run_at'] ?? raw['nextRunAt'] ?? ''),
    nextRunLabel: String(raw['next_run_label'] ?? raw['nextRunLabel'] ?? '自动分发未启用'),
    reason: String(raw['reason'] ?? ''),
  };
}

export function normalizeServerDailyBriefingDistribution(
  distribution: Record<string, unknown> = {},
): DailyBriefingDistribution {
  const raw = distribution ?? {};
  return {
    enabled: Boolean(raw['enabled']),
    sendTime: String(raw['send_time'] ?? raw['sendTime'] ?? '09:00'),
    timezone: String(raw['timezone'] ?? 'Asia/Shanghai'),
    weekdays:
      Array.isArray(raw['weekdays']) && (raw['weekdays'] as unknown[]).length
        ? (raw['weekdays'] as string[])
        : DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS,
    notificationChannels: parseDailyBriefingNotificationChannels(
      raw['notification_channels'] ?? raw['notificationChannels'],
    ),
    defaultPresetId: String(raw['default_preset_id'] ?? raw['defaultPresetId'] ?? ''),
    presets: normalizeDailyBriefingEmailPresets(
      ((raw['presets'] as unknown[]) ?? []).map((preset) => {
        const p = preset as Record<string, unknown>;
        return {
          id: p['id'],
          name: p['name'],
          toRecipients: p['to_recipients'] ?? p['toRecipients'] ?? '',
          ccRecipients: p['cc_recipients'] ?? p['ccRecipients'] ?? '',
        };
      }),
    ),
    toRecipients: String(raw['to_recipients'] ?? raw['toRecipients'] ?? ''),
    ccRecipients: String(raw['cc_recipients'] ?? raw['ccRecipients'] ?? ''),
    teamNote: String(raw['team_note'] ?? raw['teamNote'] ?? ''),
  };
}

// ---------------------------------------------------------------------------
// Preset matching / ordering helpers
// ---------------------------------------------------------------------------

export function matchesDailyBriefingEmailPreset(
  preset: DailyBriefingEmailPreset | null | undefined,
  toRecipients = '',
  ccRecipients = '',
): boolean {
  if (!preset) return false;

  return (
    (preset.toRecipients ?? '').trim() === String(toRecipients ?? '').trim() &&
    (preset.ccRecipients ?? '').trim() === String(ccRecipients ?? '').trim()
  );
}

export function isDefaultDailyBriefingEmailPresetId(presetId = ''): boolean {
  return DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.some((item) => item.id === presetId);
}

export function buildNextCustomDailyBriefingPresetName(
  existingPresets: DailyBriefingEmailPreset[] = [],
): string {
  const existingNames = new Set(
    (existingPresets ?? []).map((preset) => String(preset?.name ?? '').trim()),
  );
  let index = 1;

  while (existingNames.has(`${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`)) {
    index += 1;
  }

  return `${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`;
}

export function buildDailyBriefingCustomPresetId(): string {
  return `${DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function moveDailyBriefingCustomPresetOrder(
  presets: DailyBriefingEmailPreset[] = [],
  presetId = '',
  direction: 'up' | 'down' = 'up',
): DailyBriefingEmailPreset[] {
  const fixedPresets = (presets ?? []).filter((preset) =>
    isDefaultDailyBriefingEmailPresetId(preset?.id),
  );
  const customPresets = (presets ?? []).filter(
    (preset) => !isDefaultDailyBriefingEmailPresetId(preset?.id),
  );
  const currentIndex = customPresets.findIndex((preset) => preset.id === presetId);

  if (currentIndex < 0) return presets;

  const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex < 0 || nextIndex >= customPresets.length) return presets;

  const reorderedCustomPresets = [...customPresets];
  [reorderedCustomPresets[currentIndex], reorderedCustomPresets[nextIndex]] = [
    reorderedCustomPresets[nextIndex],
    reorderedCustomPresets[currentIndex],
  ];

  return [...fixedPresets, ...reorderedCustomPresets];
}

// ---------------------------------------------------------------------------
// Text formatting helpers
// ---------------------------------------------------------------------------

export function truncateWorkbenchText(text: string, maxLength = 24): string {
  if (!text) return '';
  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
    : text;
}

export function formatDailyBriefingExportedAt(date = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

export function formatWorkbenchTaskPreview(task: Record<string, unknown> | null | undefined): string {
  if (!task) return '';

  const title = truncateWorkbenchText(
    String(task['title'] ?? task['id'] ?? '未命名任务'),
    task['symbol'] ? 22 : 28,
  );
  const typeLabel = TASK_TYPE_LABELS[String(task['type'] ?? '')] ?? '研究任务';
  const meta = [typeLabel, task['symbol']].filter(Boolean).join(' · ');

  return [meta, title].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// mountDailyBriefingShareContainer
//
// SECURITY: The original JS assigned `innerHTML` without sanitization.
// This port sanitizes with DOMPurify.sanitize() before every innerHTML write.
// ---------------------------------------------------------------------------

export function mountDailyBriefingShareContainer(documentHtml: string): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  const parsedDocument = parser ? parser.parseFromString(documentHtml, 'text/html') : null;

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
  // Style content is not user-controlled HTML (it's CSS text); textContent is safe.
  styleElement.textContent = parsedDocument?.querySelector('style')?.textContent ?? '';
  container.appendChild(styleElement);

  const contentElement = document.createElement('div');
  // SECURITY FIX: sanitize before assigning to innerHTML
  const rawHtml = parsedDocument?.body?.innerHTML ?? documentHtml;
  contentElement.innerHTML = DOMPurify.sanitize(rawHtml);
  container.appendChild(contentElement);
  document.body.appendChild(container);

  return () => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };
}
