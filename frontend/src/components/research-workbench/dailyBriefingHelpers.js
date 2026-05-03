export const DAILY_BRIEFING_BRAND_LABEL = 'Super Pricing System · Research Workbench';
export const DAILY_BRIEFING_CC_STORAGE_KEY = 'research_workbench_daily_briefing_cc_v1';
export const DAILY_BRIEFING_DEFAULT_EMAIL_PRESET_STORAGE_KEY = 'research_workbench_daily_briefing_default_email_preset_v1';
export const DAILY_BRIEFING_EMAIL_PRESETS_STORAGE_KEY = 'research_workbench_daily_briefing_email_presets_v1';
export const DAILY_BRIEFING_NOTE_STORAGE_KEY = 'research_workbench_daily_briefing_note_v1';
export const DAILY_BRIEFING_RECIPIENTS_STORAGE_KEY = 'research_workbench_daily_briefing_recipients_v1';
export const DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX = 'custom_';
export const DAILY_BRIEFING_EMAIL_PRESET_NAME_MAX_LENGTH = 24;
export const DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX = '自定义分发';
export const DEFAULT_DAILY_BRIEFING_DISTRIBUTION_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS = [
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

export const TASK_TYPE_LABELS = {
  cross_market: '跨市场',
  macro_mispricing: '宏观错价',
  pricing: '定价研究',
  trade_thesis: '交易论点',
};

export function readDailyBriefingTeamNote() {
  return readDailyBriefingLocalValue(DAILY_BRIEFING_NOTE_STORAGE_KEY);
}

export function readDailyBriefingLocalValue(storageKey) {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(storageKey) || '';
  } catch (error) {
    return '';
  }
}

export function normalizeDailyBriefingEmailPresets(rawPresets = []) {
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

export function readDailyBriefingEmailPresets() {
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

export function parseDailyBriefingNotificationChannels(value = '') {
  const rawChannels = Array.isArray(value)
    ? value
    : String(value || 'dry_run').split(/[\s,;]+/);
  const channels = rawChannels
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return channels.length ? channels : ['dry_run'];
}

export function normalizeDailyBriefingNotificationChannelOptions(channels = []) {
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

export function normalizeDailyBriefingSchedule(schedule = {}) {
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

export function normalizeServerDailyBriefingDistribution(distribution = {}) {
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

export function matchesDailyBriefingEmailPreset(preset, toRecipients = '', ccRecipients = '') {
  if (!preset) {
    return false;
  }

  return (preset.toRecipients || '').trim() === String(toRecipients || '').trim()
    && (preset.ccRecipients || '').trim() === String(ccRecipients || '').trim();
}

export function isDefaultDailyBriefingEmailPresetId(presetId = '') {
  return DEFAULT_DAILY_BRIEFING_EMAIL_PRESETS.some((item) => item.id === presetId);
}

export function buildNextCustomDailyBriefingPresetName(existingPresets = []) {
  const existingNames = new Set((existingPresets || []).map((preset) => String(preset?.name || '').trim()));
  let index = 1;

  while (existingNames.has(`${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`)) {
    index += 1;
  }

  return `${DAILY_BRIEFING_CUSTOM_PRESET_NAME_PREFIX} ${index}`;
}

export function buildDailyBriefingCustomPresetId() {
  return `${DAILY_BRIEFING_CUSTOM_PRESET_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function moveDailyBriefingCustomPresetOrder(presets = [], presetId = '', direction = 'up') {
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

export function truncateWorkbenchText(text, maxLength = 24) {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

export function formatDailyBriefingExportedAt(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value) => String(value).padStart(2, '0');
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');
}

export function mountDailyBriefingShareContainer(documentHtml) {
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

export function formatWorkbenchTaskPreview(task) {
  if (!task) {
    return '';
  }

  const title = truncateWorkbenchText(task.title || task.id || '未命名任务', task.symbol ? 22 : 28);
  const typeLabel = TASK_TYPE_LABELS[task.type] || '研究任务';
  const meta = [typeLabel, task.symbol].filter(Boolean).join(' · ');

  return [meta, title].filter(Boolean).join(' · ');
}
