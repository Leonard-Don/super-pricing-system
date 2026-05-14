const STATUS_LABEL = {
  ready: '就绪',
  available: '就绪',
  ok: '就绪',
  missing: '缺凭证',
  missing_api_key: '缺凭证',
  disabled: '未启用',
  degraded: '降级',
  error: '错误',
  empty: '空数据',
  success: '成功',
};

const STATUS_TONE = {
  ready: 'ok',
  available: 'ok',
  ok: 'ok',
  success: 'ok',
  missing: 'warn',
  missing_api_key: 'warn',
  disabled: 'warn',
  degraded: 'warn',
  error: 'bad',
  empty: 'bad',
};

const CAPABILITY_LABEL = {
  historical_data: '历史数据',
  history: '历史数据',
  latest_quote: '实时报价',
  realtime: '实时行情',
  intraday: '分时数据',
  fundamentals: '基本面',
  options: '期权',
  news: '新闻',
};

const SOURCE_ALIAS = {
  xueqiu_v1: '雪球 V1',
  xueqiu: '雪球',
  sina: '新浪财经',
  ths: '同花顺',
  akshare: 'AKShare',
  yahoo: 'Yahoo Finance',
  yahoo_legacy: 'Yahoo legacy',
  tushare: 'Tushare',
};

const resolveLabel = (source) => {
  if (!source) return '';
  return source.label || SOURCE_ALIAS[source.id] || SOURCE_ALIAS[source.name] || source.id || source.name || '未命名数据源';
};

const resolveTone = (status, ok) => {
  if (ok === true) return 'ok';
  const normalized = String(status || '').toLowerCase();
  if (STATUS_TONE[normalized]) return STATUS_TONE[normalized];
  return ok === false ? 'bad' : 'unknown';
};

const resolveStatusLabel = (status) => {
  const normalized = String(status || '').toLowerCase();
  return STATUS_LABEL[normalized] || normalized || '未知';
};

const buildCapabilityTags = (capabilities) => {
  if (!capabilities || typeof capabilities !== 'object') return [];
  return Object.entries(capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => CAPABILITY_LABEL[key] || key);
};

const toMillis = (value) => {
  if (!value) return NaN;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? NaN : ms;
};

const formatRelative = (timestamp, now) => {
  const ms = toMillis(timestamp);
  if (Number.isNaN(ms)) return '未知';
  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const deltaSec = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (deltaSec < 60) return '刚刚';
  if (deltaSec < 60 * 60) return `${Math.round(deltaSec / 60)} 分钟前`;
  if (deltaSec < 60 * 60 * 24) return `${Math.round(deltaSec / 3600)} 小时前`;
  if (deltaSec < 60 * 60 * 24 * 30) return `${Math.round(deltaSec / 86400)} 天前`;
  return new Date(ms).toISOString().slice(0, 10);
};

const aggregateTone = (sources) => {
  if (!sources.length) return 'unknown';
  const requiredDown = sources.some((entry) => entry.required && entry.tone === 'bad');
  if (requiredDown) return 'down';
  const anyNotOk = sources.some((entry) => entry.tone !== 'ok');
  return anyNotOk ? 'degraded' : 'healthy';
};

export const formatMarketSourceHealthReport = (report, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  if (!report || typeof report !== 'object' || !Array.isArray(report.sources)) {
    return {
      tone: 'unknown',
      summary: '暂无数据源健康信息',
      freshnessLabel: '未知',
      headline: {
        ready: 0,
        total: 0,
        missingKeys: 0,
        fallbackEnabled: false,
        defaultLabel: '',
      },
      sources: [],
      lastFetch: null,
    };
  }

  const sourceModels = report.sources.map((entry) => {
    const tone = resolveTone(entry.status, entry.ok);
    return {
      id: entry.id || entry.name || '',
      label: resolveLabel(entry),
      tone,
      statusLabel: resolveStatusLabel(entry.status),
      reason: entry.reason || '',
      required: Boolean(entry.required),
      isFallback: Boolean(entry.fallback),
      requiresKey: Boolean(entry.requires_api_key),
      priority: entry.priority ?? null,
      rateLimit: entry.rate_limit || null,
      capabilityTags: buildCapabilityTags(entry.capabilities),
      freshnessLabel: formatRelative(entry.checked_at, now),
    };
  });

  const ready = sourceModels.filter((entry) => entry.tone === 'ok').length;
  const total = sourceModels.length;
  const missingKeys = sourceModels.filter(
    (entry) => entry.requiresKey && entry.tone !== 'ok'
  ).length;
  const fallbackReported = typeof report.fallback_enabled === 'boolean';
  const fallbackEnabled = report.fallback_enabled === true;
  const defaultSource = sourceModels.find((entry) => entry.id === report.default_source);
  const defaultLabel = defaultSource ? defaultSource.label : SOURCE_ALIAS[report.default_source] || report.default_source || '';

  const tone = aggregateTone(sourceModels);
  const fallbackText = fallbackReported
    ? fallbackEnabled ? '故障转移已启用' : '故障转移未启用'
    : '故障转移未上报';
  const missingText = missingKeys > 0 ? ` · 缺 ${missingKeys} 个 key` : '';
  const summary = total === 0
    ? '暂无数据源健康信息'
    : `${ready}/${total} 数据源就绪 · ${fallbackText}${missingText}`;

  return {
    tone,
    summary,
    freshnessLabel: formatRelative(report.checked_at, now),
    headline: {
      ready,
      total,
      missingKeys,
      fallbackEnabled,
      defaultLabel,
    },
    sources: sourceModels,
    lastFetch: summarizeFetchSourceHealth(report.last_fetch, { now }),
  };
};

export const formatQuantLabProviderHealthReport = (dataQuality, options = {}) => {
  if (!dataQuality || typeof dataQuality !== 'object' || !Array.isArray(dataQuality.providers)) {
    return formatMarketSourceHealthReport(null, options);
  }

  const defaultProvider = dataQuality.default_provider || dataQuality.default_source || '';
  const sources = dataQuality.providers.map((provider, index) => {
    const status = provider.status || 'unknown';
    const auditFlags = Array.isArray(provider.audit_flags) ? provider.audit_flags : [];
    const isOkStatus = status === 'available';
    return {
      id: provider.provider || `provider-${index + 1}`,
      label: provider.label || undefined,
      ok: isOkStatus,
      status,
      reason: !isOkStatus && auditFlags.length ? auditFlags.join(' · ') : '',
      required: Boolean(provider.required || (defaultProvider && provider.provider === defaultProvider)),
      fallback: Boolean(provider.fallback || provider.is_fallback),
      requires_api_key: Boolean(provider.requires_api_key),
      priority: provider.priority ?? null,
      rate_limit: provider.rate_limit || null,
      capabilities: provider.capabilities || {},
      checked_at: provider.checked_at || dataQuality.checked_at || dataQuality.updated_at || null,
    };
  });

  return formatMarketSourceHealthReport({
    checked_at: dataQuality.checked_at || dataQuality.updated_at || null,
    default_source: defaultProvider,
    fallback_enabled: Object.prototype.hasOwnProperty.call(dataQuality, 'fallback_enabled')
      ? Boolean(dataQuality.fallback_enabled)
      : null,
    sources,
    last_fetch: null,
  }, options);
};

export const summarizeFetchSourceHealth = (payload, options = {}) => {
  if (!payload || typeof payload !== 'object') return null;
  const attemptsRaw = Array.isArray(payload.attempts) ? payload.attempts : [];
  if (attemptsRaw.length === 0) return null;
  const now = options.now instanceof Date ? options.now : new Date();

  const attempts = attemptsRaw.map((entry) => ({
    id: entry.id || entry.name || '',
    label: resolveLabel(entry),
    tone: resolveTone(entry.status, entry.ok),
    statusLabel: resolveStatusLabel(entry.status),
    reason: entry.reason || '',
    rowCount: typeof entry.row_count === 'number' ? entry.row_count : null,
    isFallback: Boolean(entry.fallback),
    freshnessLabel: formatRelative(entry.checked_at, now),
  }));

  const fallbackUsed = Boolean(payload.fallback_used);
  const succeeded = attempts.some((entry) => entry.tone === 'ok');
  const tone = succeeded ? (fallbackUsed ? 'warn' : 'ok') : 'bad';

  const selectedAttempt = attempts.find(
    (entry) => entry.id === payload.selected_source
  );
  const selectedLabel = selectedAttempt
    ? selectedAttempt.label
    : SOURCE_ALIAS[payload.selected_source] || payload.selected_source || '';
  const symbol = payload.symbol || '';
  const interval = payload.interval || '';
  const prefix = [symbol, interval].filter(Boolean).join(' · ');

  let headline;
  if (!succeeded) {
    headline = `${prefix || '取数'} · 未取到行情`;
  } else if (fallbackUsed) {
    headline = `${prefix} · 故障转移至 ${selectedLabel}`.trim();
  } else {
    headline = `${prefix} · 主源 ${selectedLabel}`.trim();
  }

  return {
    tone,
    headline,
    symbol,
    interval,
    selectedLabel,
    fallbackUsed,
    freshnessLabel: formatRelative(payload.checked_at, now),
    attempts,
  };
};
