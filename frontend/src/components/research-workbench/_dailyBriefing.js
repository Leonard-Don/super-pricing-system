/**
 * Daily briefing builders extracted from workbenchUtils.js.
 *
 * 一组从 daily briefing payload 出发的格式化函数：纯文本、Markdown、
 * email 的 subject / text / html / mailto / 分享 html / 文件名 / 完整
 * iCal-style document 等。所有函数都是纯函数，唯一外部消费者是
 * useDailyBriefingSharing hook。
 */

import { buildRealtimeShareDocument, escapeHtml } from '../../utils/realtimeShareTemplates';

const padDatePart = (value) => String(value).padStart(2, '0');

export const formatWorkbenchDailyBriefingExportedAt = (date = new Date()) => {
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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const metricLine = (briefing.chips || [])
    .map((item) => `${item.label} ${item.value || 0}`)
    .join(' · ');
  const lines = [
    brandLabel || '',
    '研究工作台每日简报',
    exportedAtLabel ? `导出时间：${exportedAtLabel}` : '',
    briefing.headline || '今日先整理研究工作台',
    briefing.summary || '',
    metricLine ? `指标：${metricLine}` : '',
    morningPresetLabel ? `晨间视图：${morningPresetLabel}` : '',
    currentViewLabel ? `当前视图：${currentViewLabel}` : '',
    focusLabel ? `当前焦点：${focusLabel}` : '',
    teamNote ? `团队备注：${teamNote}` : '',
    ...(briefing.details || []).map((item, index) => `${index + 1}. ${item}`),
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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const metricLines = (briefing.chips || []).map((item) => `- ${item.label}: ${item.value || 0}`);
  const detailLines = (briefing.details || []).map((item) => `- ${item}`);
  const lines = [
    '# 研究工作台每日简报',
    '',
    ...(brandLabel ? [`- 抬头: ${brandLabel}`] : []),
    ...(exportedAtLabel ? [`- 导出时间: ${exportedAtLabel}`] : []),
    ...((brandLabel || exportedAtLabel) ? [''] : []),
    `## ${briefing.headline || '今日先整理研究工作台'}`,
    '',
    briefing.summary || '',
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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const brandPrefix = brandLabel || 'Super Pricing System';
  return `${brandPrefix} | ${briefing.headline || '研究工作台每日简报'}`;
};

const splitDailyBriefingEmailRecipients = (value = '') => String(value)
  .split(/[\n,;]+/g)
  .map((item) => item.trim())
  .filter(Boolean);

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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const metricLine = (briefing.chips || [])
    .map((item) => `${item.label} ${item.value || 0}`)
    .join(' · ');
  const detailLines = (briefing.details || []).map((item, index) => `${index + 1}. ${item}`);
  const resolvedSubject = emailSubject || buildWorkbenchDailyBriefingEmailSubject({ briefing, brandLabel });

  return [
    '各位好，',
    '',
    '以下是今天的研究工作台邮件简报：',
    '',
    resolvedSubject ? `邮件主题：${resolvedSubject}` : '',
    exportedAtLabel ? `导出时间：${exportedAtLabel}` : '',
    brandLabel ? `来源：${brandLabel}` : '',
    '',
    `今日焦点：${briefing.headline || '今日先整理研究工作台'}`,
    briefing.summary || '',
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
  ].filter(Boolean).join('\n');
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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const resolvedSubject = emailSubject || buildWorkbenchDailyBriefingEmailSubject({ briefing, brandLabel });
  const metricCards = (briefing.chips || [])
    .map((item) => `
      <div class="metric">
        <span>${escapeHtml(item.label || '--')}</span>
        <strong>${escapeHtml(item.value ?? 0)}</strong>
      </div>
    `)
    .join('');
  const detailCards = (briefing.details || [])
    .map((item, index) => `
      <div class="anomaly">
        <strong>要点 ${index + 1}</strong>
        <p>${escapeHtml(item)}</p>
      </div>
    `)
    .join('');
  const formattedTeamNote = escapeHtml(teamNote).replaceAll('\n', '<br />');
  const formattedToRecipients = splitDailyBriefingEmailRecipients(toRecipients).join(', ');
  const formattedCcRecipients = splitDailyBriefingEmailRecipients(ccRecipients).join(', ');
  const metaChips = [
    morningPresetLabel ? `<span class="chip">${escapeHtml(morningPresetLabel)}</span>` : '',
    currentViewLabel ? `<span class="chip">${escapeHtml(currentViewLabel)}</span>` : '',
    refreshLabel ? `<span class="chip">最近刷新 ${escapeHtml(refreshLabel)}</span>` : '',
    exportedAtLabel ? `<span class="chip">导出于 ${escapeHtml(exportedAtLabel)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <section class="share-card">
      <div class="eyebrow">Email Draft</div>
      <h1>研究工作台邮件模板</h1>
      <p class="subtitle">${escapeHtml('可直接复制正文到邮件客户端，或把这页作为正式简报模板发送给协作者。')}</p>
      <div class="note">
        <strong>邮件主题</strong>
        <p>${escapeHtml(resolvedSubject)}</p>
      </div>
      ${(formattedToRecipients || formattedCcRecipients) ? `
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
      ` : ''}
      ${metaChips ? `<div class="chips">${metaChips}</div>` : ''}
      ${metricCards ? `<div class="metrics">${metricCards}</div>` : ''}
      <div class="section">
        <h2>邮件正文</h2>
        <div class="anomaly">
          <strong>各位好，</strong>
          <p>以下是今天的研究工作台邮件简报。</p>
        </div>
        <div class="anomaly">
          <strong>${escapeHtml(briefing.headline || '今日先整理研究工作台')}</strong>
          <p>${escapeHtml(briefing.summary || '围绕当前工作台筛选、晨间默认视图和重开队列整理今天的研究节奏。')}</p>
        </div>
        ${focusLabel ? `
          <div class="anomaly">
            <strong>当前焦点</strong>
            <p>${escapeHtml(focusLabel)}</p>
          </div>
        ` : ''}
        ${teamNote ? `
          <div class="anomaly">
            <strong>团队备注</strong>
            <p>${formattedTeamNote}</p>
          </div>
        ` : ''}
      </div>
      ${detailCards ? `
        <div class="section">
          <h2>今日要点</h2>
          ${detailCards}
        </div>
      ` : ''}
      ${url ? `
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
      ` : ''}
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

export const buildWorkbenchDailyBriefingEmailDocument = (options = {}) => {
  const briefingTitle = options?.briefing?.headline || '今日先整理研究工作台';
  return buildRealtimeShareDocument(
    `研究工作台邮件模板 - ${briefingTitle}`,
    buildWorkbenchDailyBriefingEmailHtml(options)
  );
};

export const buildWorkbenchDailyBriefingMailtoUrl = ({
  ccRecipients = '',
  emailSubject = '',
  emailBody = '',
  toRecipients = '',
} = {}) => {
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
} = {}) => {
  if (!briefing) {
    return '';
  }

  const metaChips = [
    morningPresetLabel ? `<span class="chip">${escapeHtml(morningPresetLabel)}</span>` : '',
    currentViewLabel ? `<span class="chip">${escapeHtml(currentViewLabel)}</span>` : '',
    refreshLabel ? `<span class="chip">最近刷新 ${escapeHtml(refreshLabel)}</span>` : '',
    exportedAtLabel ? `<span class="chip">导出于 ${escapeHtml(exportedAtLabel)}</span>` : '',
  ].filter(Boolean).join('');
  const metricCards = (briefing.chips || [])
    .map((item) => `
      <div class="metric">
        <span>${escapeHtml(item.label || '--')}</span>
        <strong>${escapeHtml(item.value ?? 0)}</strong>
      </div>
    `)
    .join('');
  const detailCards = (briefing.details || [])
    .map((item, index) => `
      <div class="anomaly">
        <strong>要点 ${index + 1}</strong>
        <p>${escapeHtml(item)}</p>
      </div>
    `)
    .join('');
  const formattedTeamNote = escapeHtml(teamNote).replaceAll('\n', '<br />');

  return `
    <section class="share-card">
      <div class="eyebrow">${escapeHtml(brandLabel || 'Super Pricing System · Research Workbench')}</div>
      <p class="subtitle">${escapeHtml(exportedAtLabel ? `Research Workbench Daily Briefing · 导出于 ${exportedAtLabel}` : 'Research Workbench Daily Briefing')}</p>
      <h1>${escapeHtml(briefing.headline || '今日先整理研究工作台')}</h1>
      <p class="subtitle">${escapeHtml(briefing.summary || '围绕当前工作台筛选、晨间默认视图和重开队列整理今天的研究节奏。')}</p>
      ${metaChips ? `<div class="chips">${metaChips}</div>` : ''}
      ${metricCards ? `<div class="metrics">${metricCards}</div>` : ''}
      ${teamNote ? `
        <div class="note">
          <strong>团队备注</strong>
          <p>${formattedTeamNote}</p>
        </div>
      ` : ''}
      ${focusLabel ? `
        <div class="section">
          <h2>当前焦点</h2>
          <div class="anomaly">
            <strong>${escapeHtml(focusLabel)}</strong>
            <p>把今天最先处理的研究任务固定下来，再从工作台继续推进后续队列。</p>
          </div>
        </div>
      ` : ''}
      <div class="section">
        <h2>当前视图</h2>
        <div class="anomaly">
          <strong>${escapeHtml(currentViewLabel || '全部任务视图')}</strong>
          <p>${escapeHtml(morningPresetLabel ? `晨间起手保持在 ${morningPresetLabel}` : '当前卡片对应的是完整工作台视图。')}</p>
        </div>
      </div>
      ${detailCards ? `
        <div class="section">
          <h2>今日要点</h2>
          ${detailCards}
        </div>
      ` : ''}
      ${url ? `
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
      ` : ''}
    </section>
  `;
};

export const buildWorkbenchDailyBriefingShareDocument = (options = {}) => {
  const briefingTitle = options?.briefing?.headline || '今日先整理研究工作台';
  return buildRealtimeShareDocument(
    `研究工作台每日简报 - ${briefingTitle}`,
    buildWorkbenchDailyBriefingShareHtml(options)
  );
};

const sanitizeWorkbenchFileNamePart = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

export const buildWorkbenchDailyBriefingFilename = ({
  date = new Date(),
  extension = 'html',
  symbol = '',
  taskId = '',
} = {}) => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const subjectPart = sanitizeWorkbenchFileNamePart(symbol || taskId || '');
  const normalizedExtension = String(extension || 'html').replace(/^\./, '') || 'html';

  return [
    'research-workbench-daily-briefing',
    `${year}-${month}-${day}`,
    subjectPart,
  ].filter(Boolean).join('-') + `.${normalizedExtension}`;
};

