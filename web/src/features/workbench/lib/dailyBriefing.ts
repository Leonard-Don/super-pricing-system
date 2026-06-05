/**
 * Daily briefing builders — TypeScript port of
 * frontend/src/components/research-workbench/_dailyBriefing.js
 *
 * All functions are pure (no side-effects). The only external consumer is
 * useDailyBriefingSharing hook.
 */

import { escapeHtml } from './htmlEscape';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriefingChip {
  label: string;
  value: number | string;
}

export interface DailyBriefingPayload {
  headline?: string;
  summary?: string;
  chips?: BriefingChip[];
  details?: string[];
}

export interface DailyBriefingOptions {
  briefing?: DailyBriefingPayload | null;
  brandLabel?: string;
  currentViewLabel?: string;
  exportedAtLabel?: string;
  focusLabel?: string;
  morningPresetLabel?: string;
  refreshLabel?: string;
  teamNote?: string;
  url?: string;
}

export interface DailyBriefingEmailOptions extends DailyBriefingOptions {
  ccRecipients?: string;
  toRecipients?: string;
  emailSubject?: string;
}

export interface DailyBriefingMailtoOptions {
  ccRecipients?: string;
  emailSubject?: string;
  emailBody?: string;
  toRecipients?: string;
}

export interface DailyBriefingFilenameOptions {
  date?: Date;
  extension?: string;
  symbol?: string;
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const padDatePart = (value: number): string => String(value).padStart(2, '0');

const splitDailyBriefingEmailRecipients = (value = ''): string[] =>
  String(value)
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const sanitizeWorkbenchFileNamePart = (value = ''): string =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
// Exported builders
// ---------------------------------------------------------------------------

export const formatWorkbenchDailyBriefingExportedAt = (date = new Date()): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
    `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`,
  ].join(' ');
};

export const buildWorkbenchDailyBriefingText = ({
  briefing = null,
  brandLabel = '',
  currentViewLabel = '',
  exportedAtLabel = '',
  focusLabel = '',
  morningPresetLabel = '',
  teamNote = '',
  url = '',
}: DailyBriefingOptions = {}): string => {
  if (!briefing) {
    return '';
  }

  const metricLine = (briefing.chips ?? [])
    .map((item) => `${item.label} ${item.value ?? 0}`)
    .join(' · ');
  const lines = [
    brandLabel || '',
    '研究工作台每日简报',
    exportedAtLabel ? `导出时间：${exportedAtLabel}` : '',
    briefing.headline ?? '今日先整理研究工作台',
    briefing.summary ?? '',
    metricLine ? `指标：${metricLine}` : '',
    morningPresetLabel ? `晨间视图：${morningPresetLabel}` : '',
    currentViewLabel ? `当前视图：${currentViewLabel}` : '',
    focusLabel ? `当前焦点：${focusLabel}` : '',
    teamNote ? `团队备注：${teamNote}` : '',
    ...(briefing.details ?? []).map((item, index) => `${index + 1}. ${item}`),
    url ? `打开工作台：${url}` : '',
  ].filter(Boolean);

  return lines.join('\n');
};

export const buildWorkbenchDailyBriefingMarkdown = ({
  briefing = null,
  brandLabel = '',
  currentViewLabel = '',
  exportedAtLabel = '',
  focusLabel = '',
  morningPresetLabel = '',
  teamNote = '',
  url = '',
}: DailyBriefingOptions = {}): string => {
  if (!briefing) {
    return '';
  }

  const metricLines = (briefing.chips ?? []).map((item) => `- ${item.label}: ${item.value ?? 0}`);
  const detailLines = (briefing.details ?? []).map((item) => `- ${item}`);
  const lines = [
    '# 研究工作台每日简报',
    '',
    ...(brandLabel ? [`- 抬头: ${brandLabel}`] : []),
    ...(exportedAtLabel ? [`- 导出时间: ${exportedAtLabel}`] : []),
    ...((brandLabel || exportedAtLabel) ? [''] : []),
    `## ${briefing.headline ?? '今日先整理研究工作台'}`,
    '',
    briefing.summary ?? '',
    '',
    ...(metricLines.length ? ['### 指标', ...metricLines, ''] : []),
    ...(morningPresetLabel ? [`- 晨间视图: ${morningPresetLabel}`] : []),
    ...(currentViewLabel ? [`- 当前视图: ${currentViewLabel}`] : []),
    ...(focusLabel ? [`- 当前焦点: ${focusLabel}`] : []),
    ...((morningPresetLabel || currentViewLabel || focusLabel) ? [''] : []),
    ...(teamNote ? ['### 团队备注', teamNote, ''] : []),
    ...(detailLines.length ? ['### 要点', ...detailLines, ''] : []),
    ...(url ? [`[打开工作台](${url})`] : []),
  ].filter(Boolean);

  return lines.join('\n');
};

export const buildWorkbenchDailyBriefingEmailSubject = ({
  briefing = null,
  brandLabel = '',
}: Pick<DailyBriefingOptions, 'briefing' | 'brandLabel'> = {}): string => {
  if (!briefing) {
    return '';
  }

  const brandPrefix = brandLabel || 'Super Pricing System';
  return `${brandPrefix} | ${briefing.headline ?? '研究工作台每日简报'}`;
};

export const buildWorkbenchDailyBriefingEmailText = ({
  briefing = null,
  brandLabel = '',
  currentViewLabel = '',
  exportedAtLabel = '',
  focusLabel = '',
  morningPresetLabel = '',
  teamNote = '',
  url = '',
  emailSubject = '',
}: DailyBriefingEmailOptions = {}): string => {
  if (!briefing) {
    return '';
  }

  const metricLine = (briefing.chips ?? [])
    .map((item) => `${item.label} ${item.value ?? 0}`)
    .join(' · ');
  const detailLines = (briefing.details ?? []).map((item, index) => `${index + 1}. ${item}`);
  const resolvedSubject =
    emailSubject || buildWorkbenchDailyBriefingEmailSubject({ briefing, brandLabel });

  return [
    '各位好，',
    '',
    '以下是今天的研究工作台邮件简报：',
    '',
    resolvedSubject ? `邮件主题：${resolvedSubject}` : '',
    exportedAtLabel ? `导出时间：${exportedAtLabel}` : '',
    brandLabel ? `来源：${brandLabel}` : '',
    '',
    `今日焦点：${briefing.headline ?? '今日先整理研究工作台'}`,
    briefing.summary ?? '',
    metricLine ? `指标：${metricLine}` : '',
    morningPresetLabel ? `晨间视图：${morningPresetLabel}` : '',
    currentViewLabel ? `当前视图：${currentViewLabel}` : '',
    focusLabel ? `当前焦点：${focusLabel}` : '',
    teamNote ? `团队备注：${teamNote}` : '',
    '',
    ...(detailLines.length ? ['今日要点：', ...detailLines, ''] : []),
    url ? `工作台链接：${url}` : '',
    '',
    '谢谢。',
  ]
    .filter(Boolean)
    .join('\n');
};

export const buildWorkbenchDailyBriefingEmailHtml = ({
  briefing = null,
  brandLabel = '',
  ccRecipients = '',
  currentViewLabel = '',
  exportedAtLabel = '',
  focusLabel = '',
  morningPresetLabel = '',
  refreshLabel = '',
  toRecipients = '',
  teamNote = '',
  url = '',
  emailSubject = '',
}: DailyBriefingEmailOptions = {}): string => {
  if (!briefing) {
    return '';
  }

  const resolvedSubject =
    emailSubject || buildWorkbenchDailyBriefingEmailSubject({ briefing, brandLabel });
  const metricCards = (briefing.chips ?? [])
    .map(
      (item) => `
      <div class="metric">
        <span>${escapeHtml(item.label ?? '--')}</span>
        <strong>${escapeHtml(item.value ?? 0)}</strong>
      </div>
    `,
    )
    .join('');
  const detailCards = (briefing.details ?? [])
    .map(
      (item, index) => `
      <div class="anomaly">
        <strong>要点 ${index + 1}</strong>
        <p>${escapeHtml(item)}</p>
      </div>
    `,
    )
    .join('');
  const formattedTeamNote = escapeHtml(teamNote).replace(/\n/g, '<br />');
  const formattedToRecipients = splitDailyBriefingEmailRecipients(toRecipients).join(', ');
  const formattedCcRecipients = splitDailyBriefingEmailRecipients(ccRecipients).join(', ');
  const metaChips = [
    morningPresetLabel ? `<span class="chip">${escapeHtml(morningPresetLabel)}</span>` : '',
    currentViewLabel ? `<span class="chip">${escapeHtml(currentViewLabel)}</span>` : '',
    refreshLabel ? `<span class="chip">最近刷新 ${escapeHtml(refreshLabel)}</span>` : '',
    exportedAtLabel ? `<span class="chip">导出于 ${escapeHtml(exportedAtLabel)}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <section class="share-card">
      <div class="eyebrow">Email Draft</div>
      <h1>研究工作台邮件模板</h1>
      <p class="subtitle">${escapeHtml('可直接复制正文到邮件客户端，或把这页作为正式简报模板发送给协作者。')}</p>
      <div class="note">
        <strong>邮件主题</strong>
        <p>${escapeHtml(resolvedSubject)}</p>
      </div>
      ${
        formattedToRecipients || formattedCcRecipients
          ? `
        <div class="section">
          <h2>邮件分发</h2>
          <div class="metrics">
            <div class="metric">
              <span>收件人模板</span>
              <strong style="font-size:14px;line-height:1.5;">${escapeHtml(formattedToRecipients || '--')}</strong>
            </div>
            <div class="metric">
              <span>抄送模板</span>
              <strong style="font-size:14px;line-height:1.5;">${escapeHtml(formattedCcRecipients || '--')}</strong>
            </div>
          </div>
        </div>
      `
          : ''
      }
      ${metaChips ? `<div class="chips">${metaChips}</div>` : ''}
      ${metricCards ? `<div class="metrics">${metricCards}</div>` : ''}
      <div class="section">
        <h2>邮件正文</h2>
        <div class="anomaly">
          <strong>各位好，</strong>
          <p>以下是今天的研究工作台邮件简报。</p>
        </div>
        <div class="anomaly">
          <strong>${escapeHtml(briefing.headline ?? '今日先整理研究工作台')}</strong>
          <p>${escapeHtml(briefing.summary ?? '围绕当前工作台筛选、晨间默认视图和重开队列整理今天的研究节奏。')}</p>
        </div>
        ${
          focusLabel
            ? `
          <div class="anomaly">
            <strong>当前焦点</strong>
            <p>${escapeHtml(focusLabel)}</p>
          </div>
        `
            : ''
        }
        ${
          teamNote
            ? `
          <div class="anomaly">
            <strong>团队备注</strong>
            <p>${formattedTeamNote}</p>
          </div>
        `
            : ''
        }
      </div>
      ${
        detailCards
          ? `
        <div class="section">
          <h2>今日要点</h2>
          ${detailCards}
        </div>
      `
          : ''
      }
      ${
        url
          ? `
        <div class="section">
          <h2>工作台链接</h2>
          <a
            href="${escapeHtml(url)}"
            target="_blank"
            rel="noreferrer"
            style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:999px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            打开当前工作台视图
          </a>
          <p class="muted" style="margin-top:14px;word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      `
          : ''
      }
      <div class="section">
        <h2>邮件落款</h2>
        <div class="anomaly">
          <strong>谢谢。</strong>
          <p>${escapeHtml(brandLabel || 'Super Pricing System · Research Workbench')}</p>
        </div>
      </div>
    </section>
  `;
};

export const buildWorkbenchDailyBriefingEmailDocument = (options: DailyBriefingEmailOptions = {}): string => {
  const briefingTitle = options.briefing?.headline ?? '今日先整理研究工作台';
  return buildRealtimeShareDocument(
    `研究工作台邮件模板 - ${briefingTitle}`,
    buildWorkbenchDailyBriefingEmailHtml(options),
  );
};

export const buildWorkbenchDailyBriefingMailtoUrl = ({
  ccRecipients = '',
  emailSubject = '',
  emailBody = '',
  toRecipients = '',
}: DailyBriefingMailtoOptions = {}): string => {
  const toList = splitDailyBriefingEmailRecipients(toRecipients);
  const ccList = splitDailyBriefingEmailRecipients(ccRecipients);
  const searchParams = new URLSearchParams();

  if (ccList.length) {
    searchParams.set('cc', ccList.join(','));
  }
  if (emailSubject) {
    searchParams.set('subject', emailSubject);
  }
  if (emailBody) {
    searchParams.set('body', emailBody);
  }

  const query = searchParams.toString();
  const recipientPath = toList.map((item) => encodeURIComponent(item)).join(',');
  return `mailto:${recipientPath}${query ? `?${query}` : ''}`;
};

export const buildWorkbenchDailyBriefingShareHtml = ({
  briefing = null,
  brandLabel = '',
  currentViewLabel = '',
  exportedAtLabel = '',
  focusLabel = '',
  morningPresetLabel = '',
  refreshLabel = '',
  teamNote = '',
  url = '',
}: DailyBriefingOptions = {}): string => {
  if (!briefing) {
    return '';
  }

  const metaChips = [
    morningPresetLabel ? `<span class="chip">${escapeHtml(morningPresetLabel)}</span>` : '',
    currentViewLabel ? `<span class="chip">${escapeHtml(currentViewLabel)}</span>` : '',
    refreshLabel ? `<span class="chip">最近刷新 ${escapeHtml(refreshLabel)}</span>` : '',
    exportedAtLabel ? `<span class="chip">导出于 ${escapeHtml(exportedAtLabel)}</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  const metricCards = (briefing.chips ?? [])
    .map(
      (item) => `
      <div class="metric">
        <span>${escapeHtml(item.label ?? '--')}</span>
        <strong>${escapeHtml(item.value ?? 0)}</strong>
      </div>
    `,
    )
    .join('');
  const detailCards = (briefing.details ?? [])
    .map(
      (item, index) => `
      <div class="anomaly">
        <strong>要点 ${index + 1}</strong>
        <p>${escapeHtml(item)}</p>
      </div>
    `,
    )
    .join('');
  const formattedTeamNote = escapeHtml(teamNote).replace(/\n/g, '<br />');

  return `
    <section class="share-card">
      <div class="eyebrow">${escapeHtml(brandLabel || 'Super Pricing System · Research Workbench')}</div>
      <p class="subtitle">${escapeHtml(exportedAtLabel ? `Research Workbench Daily Briefing · 导出于 ${exportedAtLabel}` : 'Research Workbench Daily Briefing')}</p>
      <h1>${escapeHtml(briefing.headline ?? '今日先整理研究工作台')}</h1>
      <p class="subtitle">${escapeHtml(briefing.summary ?? '围绕当前工作台筛选、晨间默认视图和重开队列整理今天的研究节奏。')}</p>
      ${metaChips ? `<div class="chips">${metaChips}</div>` : ''}
      ${metricCards ? `<div class="metrics">${metricCards}</div>` : ''}
      ${
        teamNote
          ? `
        <div class="note">
          <strong>团队备注</strong>
          <p>${formattedTeamNote}</p>
        </div>
      `
          : ''
      }
      ${
        focusLabel
          ? `
        <div class="section">
          <h2>当前焦点</h2>
          <div class="anomaly">
            <strong>${escapeHtml(focusLabel)}</strong>
            <p>把今天最先处理的研究任务固定下来，再从工作台继续推进后续队列。</p>
          </div>
        </div>
      `
          : ''
      }
      <div class="section">
        <h2>当前视图</h2>
        <div class="anomaly">
          <strong>${escapeHtml(currentViewLabel || '全部任务视图')}</strong>
          <p>${escapeHtml(morningPresetLabel ? `晨间起手保持在 ${morningPresetLabel}` : '当前卡片对应的是完整工作台视图。')}</p>
        </div>
      </div>
      ${
        detailCards
          ? `
        <div class="section">
          <h2>今日要点</h2>
          ${detailCards}
        </div>
      `
          : ''
      }
      ${
        url
          ? `
        <div class="section">
          <h2>打开工作台</h2>
          <a
            href="${escapeHtml(url)}"
            target="_blank"
            rel="noreferrer"
            style="display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:999px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            打开当前工作台视图
          </a>
          <p class="muted" style="margin-top:14px;word-break:break-all;">${escapeHtml(url)}</p>
        </div>
      `
          : ''
      }
    </section>
  `;
};

export const buildWorkbenchDailyBriefingShareDocument = (options: DailyBriefingOptions = {}): string => {
  const briefingTitle = options.briefing?.headline ?? '今日先整理研究工作台';
  return buildRealtimeShareDocument(
    `研究工作台每日简报 - ${briefingTitle}`,
    buildWorkbenchDailyBriefingShareHtml(options),
  );
};

export const buildWorkbenchDailyBriefingFilename = ({
  date = new Date(),
  extension = 'html',
  symbol = '',
  taskId = '',
}: DailyBriefingFilenameOptions = {}): string => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const subjectPart = sanitizeWorkbenchFileNamePart(symbol || taskId || '');
  const normalizedExtension = String(extension || 'html').replace(/^\./, '') || 'html';

  return (
    ['research-workbench-daily-briefing', `${year}-${month}-${day}`, subjectPart]
      .filter(Boolean)
      .join('-') + `.${normalizedExtension}`
  );
};

// ---------------------------------------------------------------------------
// buildRealtimeShareDocument — inline copy to avoid cross-feature imports
// (original lives in frontend/src/utils/realtimeShareTemplates.js)
// ---------------------------------------------------------------------------

const buildRealtimeShareDocument = (title: string, bodyHtml: string): string => `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --panel: rgba(255, 255, 255, 0.92);
        --panel-border: rgba(148, 163, 184, 0.24);
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --text-muted: #64748b;
        --accent: #2563eb;
        --accent-soft: rgba(37, 99, 235, 0.1);
        --chip-bg: rgba(15, 23, 42, 0.06);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 32%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.14), transparent 30%),
          linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
        color: var(--text-primary);
        padding: 32px;
      }
      .share-shell { max-width: 920px; margin: 0 auto; }
      .share-card {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 28px;
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12);
        padding: 32px;
        backdrop-filter: blur(12px);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 { margin: 18px 0 8px; font-size: clamp(28px, 4vw, 40px); line-height: 1.08; }
      .subtitle { margin: 0; font-size: 15px; color: var(--text-secondary); }
      .chips, .list { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      .chip, .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 8px 12px;
        background: var(--chip-bg);
        color: var(--text-primary);
        font-size: 13px;
        font-weight: 600;
      }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 12px; margin-top: 22px; }
      .metric {
        border-radius: 20px;
        padding: 16px 18px;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid rgba(148, 163, 184, 0.18);
        min-height: 92px;
      }
      .metric span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
      .metric strong { font-size: 20px; line-height: 1.2; }
      .section, .note { margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(148, 163, 184, 0.18); }
      .section h2, .note strong { display: block; margin: 0 0 12px; font-size: 15px; }
      .note p, .anomaly p { margin: 8px 0 0; color: var(--text-secondary); line-height: 1.6; }
      .anomaly { padding: 14px 0; }
      .anomaly + .anomaly { border-top: 1px dashed rgba(148, 163, 184, 0.2); }
      .muted { color: var(--text-muted); }
      @media (max-width: 640px) {
        body { padding: 18px; }
        .share-card { padding: 22px; border-radius: 22px; }
      }
    </style>
  </head>
  <body>
    <main class="share-shell">
      ${bodyHtml}
    </main>
  </body>
</html>`;
