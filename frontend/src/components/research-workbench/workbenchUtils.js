import { buildRealtimeShareDocument, escapeHtml } from '../../utils/realtimeShareTemplates';
import { extractWorkbenchViewFingerprint } from '../../utils/workbenchViewFingerprint';

export const MAIN_STATUSES = ['new', 'in_progress', 'blocked', 'complete'];

export const STATUS_LABEL = {
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
];

export const REFRESH_OPTIONS = [
  { label: '全部更新状态', value: '' },
  { label: '建议更新', value: 'high' },
  { label: '建议复核', value: 'medium' },
  { label: '继续观察', value: 'low' },
];

export const SNAPSHOT_VIEW_OPTIONS = [
  { label: '全部快照视角', value: '' },
  { label: '带筛选视角快照', value: 'filtered' },
  { label: '带任务焦点快照', value: 'scoped' },
];

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
];

export const REFRESH_REASON_LABELS = {
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

export const formatRefreshReasonLabel = (reason = 'observe') => REFRESH_REASON_LABELS[reason] || REFRESH_REASON_LABELS.observe;

export const REFRESH_PRIORITY_CHANGE_LABELS = {
  new: '首次记录',
  escalated: '升级',
  relaxed: '缓和',
  updated: '更新',
};

export const REFRESH_PRIORITY_CHANGE_COLORS = {
  new: 'blue',
  escalated: 'red',
  relaxed: 'green',
  updated: 'gold',
};

export const formatRefreshPriorityChangeLabel = (changeType = 'updated') =>
  REFRESH_PRIORITY_CHANGE_LABELS[changeType] || REFRESH_PRIORITY_CHANGE_LABELS.updated;

export const getRefreshPriorityChangeColor = (changeType = 'updated') =>
  REFRESH_PRIORITY_CHANGE_COLORS[changeType] || REFRESH_PRIORITY_CHANGE_COLORS.updated;

export const findWorkbenchOptionLabel = (options = [], value = '', fallback = '') => {
  if (!value) {
    return '';
  }

  const matchedOption = (options || []).find((option) => option?.value === value);
  return matchedOption?.label || fallback || value;
};

export const buildActiveWorkbenchFilterMeta = (
  filters = {},
  {
    reasonOptions = [],
    refreshOptions = [],
    snapshotViewOptions = [],
    typeOptions = [],
    sourceOptions = [],
  } = {}
) => {
  const keyword = filters?.keyword?.trim?.() || '';
  const reason = filters?.reason || '';
  const refresh = filters?.refresh || '';
  const snapshotView = filters?.snapshotView || '';
  const snapshotFingerprint = filters?.snapshotFingerprint || '';
  const snapshotSummary = filters?.snapshotSummary?.trim?.() || '';
  const type = filters?.type || '';
  const source = filters?.source || '';

  const items = [];

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

export const buildWorkbenchViewSummary = (
  filters = {},
  {
    reasonOptions = [],
    refreshOptions = [],
    snapshotViewOptions = [],
    typeOptions = [],
    sourceOptions = [],
    selectedTaskId = '',
    selectedTaskTitle = '',
  } = {}
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

export const hasActiveWorkbenchFilters = (filters = {}) => Boolean(
  filters?.type
  || filters?.source
  || filters?.refresh
  || filters?.reason
  || filters?.snapshotView
  || filters?.snapshotFingerprint
  || filters?.snapshotSummary
  || filters?.keyword?.trim?.()
);

export const matchesWorkbenchFilterPreset = (filters = {}, presetFilters = {}) => {
  const normalizedCurrent = {
    type: filters?.type || '',
    source: filters?.source || '',
    refresh: filters?.refresh || '',
    reason: filters?.reason || '',
    snapshotView: filters?.snapshotView || '',
    snapshotFingerprint: filters?.snapshotFingerprint || '',
    snapshotSummary: filters?.snapshotSummary || '',
    keyword: filters?.keyword?.trim?.() || '',
  };
  const normalizedPreset = {
    type: presetFilters?.type || '',
    source: presetFilters?.source || '',
    refresh: presetFilters?.refresh || '',
    reason: presetFilters?.reason || '',
    snapshotView: presetFilters?.snapshotView || '',
    snapshotFingerprint: presetFilters?.snapshotFingerprint || '',
    snapshotSummary: presetFilters?.snapshotSummary || '',
    keyword: presetFilters?.keyword?.trim?.() || '',
  };

  return Object.keys(normalizedCurrent).every((key) => normalizedCurrent[key] === normalizedPreset[key]);
};

const padDatePart = (value) => String(value).padStart(2, '0');

export const buildMorningWorkbenchSessionKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  return `research_workbench_morning_view:${year}-${month}-${day}`;
};

export const isMorningWorkbenchWindow = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= 6 && hour < 12;
};

export const buildMorningWorkbenchPreset = (refreshStats = {}) => {
  if (Number(refreshStats?.priorityEscalated || 0) > 0) {
    return {
      filters: { reason: 'priority_escalated' },
      label: '晨间默认视图：自动排序升档',
      note: '先看今天刚升档的任务，避免把真正变紧急的线索埋在长列表里。',
    };
  }

  if (Number(refreshStats?.high || 0) > 0) {
    return {
      filters: { refresh: 'high' },
      label: '晨间默认视图：建议更新',
      note: '当前没有升档队列时，优先处理输入已经明显漂移的任务。',
    };
  }

  if (Number(refreshStats?.medium || 0) > 0) {
    return {
      filters: { refresh: 'medium' },
      label: '晨间默认视图：建议复核',
      note: '高优先级更新不多时，先扫一轮复核队列更适合作为晨间起手。',
    };
  }

  return null;
};

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

export const extractSnapshotViewContext = (snapshot = null) => {
  const payload = snapshot?.payload || {};
  const viewContext = payload.view_context || payload.workbench_view_context || {};
  return {
    hasFilters: Boolean(viewContext.has_filters),
    fingerprint: extractWorkbenchViewFingerprint(viewContext),
    summary: viewContext.summary || '',
    scopedTaskLabel: viewContext.scoped_task_label || '',
    note: viewContext.note || '',
  };
};

export const buildSnapshotViewSummaryOptions = (tasks = [], limit = 6) => {
  const buckets = new Map();

  (tasks || []).forEach((task) => {
    const snapshotViewContext = extractSnapshotViewContext(task?.snapshot);
    const summary = String(snapshotViewContext.summary || '').trim();
    const fingerprint = String(snapshotViewContext.fingerprint || '').trim();
    const bucketKey = fingerprint || summary;
    if (!bucketKey) {
      return;
    }

    const current = buckets.get(bucketKey) || {
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

    const latestAt = String(task?.snapshot?.saved_at || task?.updated_at || task?.created_at || '');
    if (latestAt && (!current.latestAt || latestAt > current.latestAt)) {
      current.latestAt = latestAt;
    }

    buckets.set(bucketKey, current);
  });

  return Array.from(buckets.values())
    .sort((left, right) =>
      Number(right.count || 0) - Number(left.count || 0)
      || Number(right.scopedCount || 0) - Number(left.scopedCount || 0)
      || String(right.latestAt || '').localeCompare(String(left.latestAt || ''))
    )
    .slice(0, limit);
};

export const extractLatestRefreshPriorityEvent = (task = null) =>
  (task?.timeline || []).find((event) => event?.type === 'refresh_priority') || null;

export const buildRefreshPriorityChangeSummary = (event = null) => {
  const meta = event?.meta || {};
  const changeType = meta.change_type || '';
  const reasonLabel = meta.reason_label || '';
  const previousReasonLabel = meta.previous_reason_label || '';
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

export const STATUS_COLOR = {
  new: 'blue',
  in_progress: 'processing',
  blocked: 'orange',
  complete: 'green',
  archived: 'default',
};

export const TIMELINE_COLOR = {
  created: 'blue',
  status_changed: 'orange',
  snapshot_saved: 'green',
  metadata_updated: 'purple',
  comment_added: 'cyan',
  comment_deleted: 'red',
  board_reordered: 'gold',
  refresh_priority: 'red',
};

export const formatPricingScenarioSummary = (scenarios = []) => {
  const bearCase = (scenarios || []).find((item) => item?.name === 'bear') || null;
  const baseCase = (scenarios || []).find((item) => item?.name === 'base') || null;
  const bullCase = (scenarios || []).find((item) => item?.name === 'bull') || null;
  const summaryParts = [
    bearCase?.intrinsic_value != null ? `悲观 ${Number(bearCase.intrinsic_value).toFixed(2)}` : null,
    baseCase?.intrinsic_value != null ? `基准 ${Number(baseCase.intrinsic_value).toFixed(2)}` : null,
    bullCase?.intrinsic_value != null ? `乐观 ${Number(bullCase.intrinsic_value).toFixed(2)}` : null,
  ].filter(Boolean);

  return summaryParts.length ? `DCF 情景 ${summaryParts.join(' / ')}` : '';
};

export const sortTasksByRefreshPriority = (tasks = [], refreshLookup = {}, enablePriority = false) => {
  const list = [...tasks];
  if (!enablePriority) {
    return list;
  }

  return list.sort((left, right) => {
    const leftSignal = refreshLookup[left.id] || {};
    const rightSignal = refreshLookup[right.id] || {};
    if (Number(rightSignal.urgencyScore || 0) !== Number(leftSignal.urgencyScore || 0)) {
      return Number(rightSignal.urgencyScore || 0) - Number(leftSignal.urgencyScore || 0);
    }
    if (Number(rightSignal.priorityWeight || 0) !== Number(leftSignal.priorityWeight || 0)) {
      return Number(rightSignal.priorityWeight || 0) - Number(leftSignal.priorityWeight || 0);
    }
    return String(right.updated_at || '').localeCompare(String(left.updated_at || ''));
  });
};

export const formatContextValue = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          return [item.symbol, item.side, item.asset_class].filter(Boolean).join('/');
        }
        return String(item);
      })
      .join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value)
      .slice(0, 4)
      .map(([key, item]) => `${key}:${item}`)
      .join(', ');
  }

  return String(value);
};

export const formatTimelineType = (value) => ({
  created: '创建',
  status_changed: '状态',
  snapshot_saved: '快照',
  metadata_updated: '元信息',
  comment_added: '评论',
  comment_deleted: '删除',
  board_reordered: '排序',
  refresh_priority: '自动排序',
}[value] || '事件');

export const sortByBoardOrder = (left, right) => {
  const orderGap = Number(left.board_order || 0) - Number(right.board_order || 0);
  if (orderGap !== 0) {
    return orderGap;
  }
  return String(left.updated_at || '').localeCompare(String(right.updated_at || ''));
};

export const orderWorkbenchQueueTasks = (tasks = [], enablePriority = false) => {
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
    .filter((task) => !MAIN_STATUSES.includes(task.status))
    .sort(sortByBoardOrder);

  return [...orderedMain, ...remainder];
};

export const normalizeBoardOrders = (tasks) => {
  const cloned = tasks.map((task) => ({ ...task }));
  MAIN_STATUSES.forEach((status) => {
    const lane = cloned.filter((task) => task.status === status).sort(sortByBoardOrder);
    lane.forEach((task, index) => {
      task.board_order = index;
    });
  });
  return cloned;
};

export const moveBoardTask = (tasks, draggedTaskId, targetStatus, targetTaskId = null) => {
  const normalized = normalizeBoardOrders(tasks);
  const draggedTask = normalized.find((task) => task.id === draggedTaskId);
  if (!draggedTask) {
    return normalized;
  }

  const boardMap = Object.fromEntries(
    MAIN_STATUSES.map((status) => [
      status,
      normalized.filter((task) => task.status === status).sort(sortByBoardOrder),
    ])
  );

  const sourceStatus = draggedTask.status;
  boardMap[sourceStatus] = boardMap[sourceStatus].filter((task) => task.id !== draggedTaskId);

  const nextTask = { ...draggedTask, status: targetStatus };
  const targetLane = [...boardMap[targetStatus]];
  const insertIndex = targetTaskId
    ? Math.max(targetLane.findIndex((task) => task.id === targetTaskId), 0)
    : targetLane.length;
  targetLane.splice(insertIndex, 0, nextTask);
  boardMap[targetStatus] = targetLane;

  MAIN_STATUSES.forEach((status) => {
    boardMap[status].forEach((task, index) => {
      task.board_order = index;
    });
  });

  const archived = normalized.filter((task) => task.status === 'archived');
  return [...MAIN_STATUSES.flatMap((status) => boardMap[status]), ...archived];
};

export const buildReorderPayload = (tasks) =>
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
