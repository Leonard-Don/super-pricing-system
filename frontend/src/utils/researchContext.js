const VIEW_QUERY_KEY = 'view';
const TAB_QUERY_KEY = 'tab';
const ROOT_PATHNAME = '/';
const PATHNAME_VIEW_ALIASES = {
  pricing: 'pricing',
  godeye: 'godsEye',
  godseye: 'godsEye',
  workbench: 'workbench',
  quantlab: 'quantlab',
  backtest: 'backtest',
  realtime: 'realtime',
};

const RESEARCH_KEYS = ['symbol', 'symbols', 'template', 'draft', 'action', 'source', 'note'];
const PRICING_KEYS = ['symbol', 'symbols', 'action', 'source', 'note', 'period'];
const CROSS_MARKET_KEYS = ['template', 'draft', 'action', 'source', 'note'];
const SCREENER_KEYS = [
  'screener_filter',
  'screener_sector',
  'screener_min_score',
  'screener_period',
];
const WORKBENCH_KEYS = [
  'workbench_refresh',
  'workbench_type',
  'workbench_source',
  'workbench_reason',
  'workbench_snapshot_view',
  'workbench_snapshot_fingerprint',
  'workbench_snapshot_summary',
  'workbench_keyword',
  'workbench_queue_mode',
  'workbench_queue_action',
  'task',
];

const WORKBENCH_QUEUE_HANDOFF_STORAGE_KEY = 'research_workbench_queue_handoff_v1';
const WORKBENCH_QUEUE_HANDOFF_TTL_MS = 2 * 60 * 1000;

const getBrowserStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage || null;
  } catch (error) {
    return null;
  }
};

export const persistWorkbenchQueueHandoff = (handoff = {}) => {
  const storage = getBrowserStorage();
  if (!storage || !handoff?.task || !handoff?.workbenchQueueMode) {
    return;
  }
  try {
    storage.setItem(
      WORKBENCH_QUEUE_HANDOFF_STORAGE_KEY,
      JSON.stringify({
        ...handoff,
        workbenchQueueAction: handoff.workbenchQueueAction || 'next_same_type',
        createdAt: Date.now(),
      })
    );
  } catch (error) {
    // Queue handoff is a best-effort UX hint; URL navigation remains authoritative.
  }
};

export const consumeWorkbenchQueueHandoff = () => {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }
  let rawValue = '';
  try {
    rawValue = storage.getItem(WORKBENCH_QUEUE_HANDOFF_STORAGE_KEY);
    storage.removeItem(WORKBENCH_QUEUE_HANDOFF_STORAGE_KEY);
  } catch (error) {
    return null;
  }
  if (!rawValue) {
    return null;
  }
  try {
    const handoff = JSON.parse(rawValue);
    const createdAt = Number(handoff?.createdAt || 0);
    if (!createdAt || Date.now() - createdAt > WORKBENCH_QUEUE_HANDOFF_TTL_MS) {
      return null;
    }
    if (handoff?.workbenchQueueAction !== 'next_same_type' || !handoff?.task || !handoff?.workbenchQueueMode) {
      return null;
    }
    return handoff;
  } catch (error) {
    return null;
  }
};

export const readResearchContext = (search = window.location.search) => {
  const params = new URLSearchParams(search);
  return {
    view: params.get(VIEW_QUERY_KEY) || 'backtest',
    tab: params.get(TAB_QUERY_KEY) || '',
    symbol: params.get('symbol') || '',
    symbols: params.get('symbols') || '',
    template: params.get('template') || '',
    draft: params.get('draft') || '',
    action: params.get('action') || '',
    source: params.get('source') || '',
    note: params.get('note') || '',
    period: params.get('period') || '',
    record: params.get('record') || '',
    historySymbol: params.get('history_symbol') || '',
    historyStrategy: params.get('history_strategy') || '',
    workbenchRefresh: params.get('workbench_refresh') || '',
    workbenchType: params.get('workbench_type') || '',
    workbenchSource: params.get('workbench_source') || '',
    workbenchReason: params.get('workbench_reason') || '',
    workbenchSnapshotView: params.get('workbench_snapshot_view') || '',
    workbenchSnapshotFingerprint: params.get('workbench_snapshot_fingerprint') || '',
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary') || '',
    workbenchKeyword: params.get('workbench_keyword') || '',
    workbenchQueueMode: params.get('workbench_queue_mode') || '',
    workbenchQueueAction: params.get('workbench_queue_action') || '',
    task: params.get('task') || '',
    screenerFilter: params.get('screener_filter') || '',
    screenerSector: params.get('screener_sector') || '',
    screenerMinScore: params.get('screener_min_score') || '',
    screenerPeriod: params.get('screener_period') || '',
  };
};

const setParam = (params, key, value) => {
  if (value === undefined || value === null || value === '') {
    params.delete(key);
  } else {
    params.set(key, value);
  }
};

export const sanitizeParamsForView = (params, view) => {
  if (view === 'pricing') {
    params.delete(TAB_QUERY_KEY);
    params.delete('record');
    params.delete('history_symbol');
    params.delete('history_strategy');
    RESEARCH_KEYS.forEach((key) => {
      if (!PRICING_KEYS.includes(key)) params.delete(key);
    });
    return params;
  }

  if (view === 'backtest') {
    params.delete('period');
    const activeTab = params.get(TAB_QUERY_KEY) || 'new';
    if (activeTab !== 'history') {
      params.delete('record');
      params.delete('history_symbol');
      params.delete('history_strategy');
    }
    if (activeTab === 'cross-market') {
      RESEARCH_KEYS.forEach((key) => {
        if (!CROSS_MARKET_KEYS.includes(key)) params.delete(key);
      });
    } else {
      RESEARCH_KEYS.forEach((key) => params.delete(key));
    }
    SCREENER_KEYS.forEach((key) => params.delete(key));
    return params;
  }

  if (view === 'workbench') {
    params.delete(TAB_QUERY_KEY);
    params.delete('period');
    params.delete('record');
    params.delete('history_symbol');
    params.delete('history_strategy');
    RESEARCH_KEYS.forEach((key) => params.delete(key));
    SCREENER_KEYS.forEach((key) => params.delete(key));
    return params;
  }

  if (view === 'realtime') {
    params.delete('period');
    params.delete('record');
    params.delete('history_symbol');
    params.delete('history_strategy');
    RESEARCH_KEYS.forEach((key) => params.delete(key));
    SCREENER_KEYS.forEach((key) => params.delete(key));
    WORKBENCH_KEYS.forEach((key) => params.delete(key));
    return params;
  }

  params.delete(TAB_QUERY_KEY);
  params.delete('period');
  params.delete('record');
  params.delete('history_symbol');
  params.delete('history_strategy');
  RESEARCH_KEYS.forEach((key) => params.delete(key));
  SCREENER_KEYS.forEach((key) => params.delete(key));
  WORKBENCH_KEYS.forEach((key) => params.delete(key));
  return params;
};

export const readViewAliasFromPathname = (pathname = window.location.pathname) => {
  const normalizedPathname = String(pathname || ROOT_PATHNAME)
    .split('?')[0]
    .replace(/\/+$/, '') || ROOT_PATHNAME;
  const segments = normalizedPathname.split('/').filter(Boolean);
  if (segments.length !== 1) {
    return null;
  }
  return PATHNAME_VIEW_ALIASES[segments[0].toLowerCase()] || null;
};

export const normalizeAppShellPathname = (pathname = window.location.pathname) => (
  readViewAliasFromPathname(pathname) ? ROOT_PATHNAME : (pathname || ROOT_PATHNAME)
);

export const buildAppUrl = ({
  pathname = window.location.pathname,
  currentSearch = window.location.search,
  view = 'backtest',
  tab = undefined,
  symbol = undefined,
  symbols = undefined,
  template = undefined,
  draft = undefined,
  action = undefined,
  source = undefined,
  note = undefined,
  period = undefined,
  record = undefined,
  historySymbol = undefined,
  historyStrategy = undefined,
  workbenchRefresh = undefined,
  workbenchType = undefined,
  workbenchSource = undefined,
  workbenchReason = undefined,
  workbenchSnapshotView = undefined,
  workbenchSnapshotFingerprint = undefined,
  workbenchSnapshotSummary = undefined,
  workbenchKeyword = undefined,
  workbenchQueueMode = undefined,
  workbenchQueueAction = undefined,
  task = undefined,
} = {}) => {
  const params = new URLSearchParams(currentSearch);
  if (view === 'backtest') {
    params.delete(VIEW_QUERY_KEY);
  } else {
    params.set(VIEW_QUERY_KEY, view);
  }

  if (view !== 'backtest' && view !== 'realtime') {
    params.delete(TAB_QUERY_KEY);
  } else {
    setParam(params, TAB_QUERY_KEY, tab);
  }

  setParam(params, 'symbol', symbol);
  setParam(params, 'symbols', symbols);
  setParam(params, 'template', template);
  setParam(params, 'draft', draft);
  setParam(params, 'action', action);
  setParam(params, 'source', source);
  setParam(params, 'note', note);
  setParam(params, 'period', period);
  setParam(params, 'record', record);
  setParam(params, 'history_symbol', historySymbol);
  setParam(params, 'history_strategy', historyStrategy);
  setParam(params, 'workbench_refresh', workbenchRefresh);
  setParam(params, 'workbench_type', workbenchType);
  setParam(params, 'workbench_source', workbenchSource);
  setParam(params, 'workbench_reason', workbenchReason);
  setParam(params, 'workbench_snapshot_view', workbenchSnapshotView);
  setParam(params, 'workbench_snapshot_fingerprint', workbenchSnapshotFingerprint);
  setParam(params, 'workbench_snapshot_summary', workbenchSnapshotSummary);
  setParam(params, 'workbench_keyword', workbenchKeyword);
  setParam(params, 'workbench_queue_mode', workbenchQueueMode);
  setParam(params, 'workbench_queue_action', workbenchQueueAction);
  setParam(params, 'task', task);

  sanitizeParamsForView(params, view);

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
};

export const buildViewUrlForCurrentState = (
  view,
  currentSearch = window.location.search,
  pathname = window.location.pathname,
) => {
  const params = new URLSearchParams(currentSearch);
  sanitizeParamsForView(params, view);

  return buildAppUrl({
    pathname: normalizeAppShellPathname(pathname),
    currentSearch: `?${params.toString()}`,
    view,
    tab: view === 'backtest' || view === 'realtime' ? params.get(TAB_QUERY_KEY) : undefined,
    symbol: params.get('symbol'),
    symbols: params.get('symbols'),
    template: params.get('template'),
    draft: params.get('draft'),
    action: params.get('action'),
    source: params.get('source'),
    note: params.get('note'),
    period: params.get('period'),
    record: params.get('record'),
    historySymbol: params.get('history_symbol'),
    historyStrategy: params.get('history_strategy'),
    workbenchRefresh: params.get('workbench_refresh'),
    workbenchType: params.get('workbench_type'),
    workbenchSource: params.get('workbench_source'),
    workbenchReason: params.get('workbench_reason'),
    workbenchSnapshotView: params.get('workbench_snapshot_view'),
    workbenchSnapshotFingerprint: params.get('workbench_snapshot_fingerprint'),
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary'),
    workbenchKeyword: params.get('workbench_keyword'),
    workbenchQueueMode: params.get('workbench_queue_mode'),
    workbenchQueueAction: params.get('workbench_queue_action'),
    task: params.get('task'),
  });
};

const readWorkbenchParamsFromSearch = (currentSearch = window.location.search) => {
  const params = new URLSearchParams(currentSearch);
  return {
    workbenchSnapshotView: params.get('workbench_snapshot_view'),
    workbenchSnapshotFingerprint: params.get('workbench_snapshot_fingerprint'),
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary'),
    workbenchKeyword: params.get('workbench_keyword'),
    workbenchQueueMode: params.get('workbench_queue_mode'),
    workbenchQueueAction: params.get('workbench_queue_action'),
    workbenchRefresh: params.get('workbench_refresh'),
    workbenchType: params.get('workbench_type'),
    workbenchSource: params.get('workbench_source'),
    workbenchReason: params.get('workbench_reason'),
    task: params.get('task'),
  };
};

export const buildPricingLink = (
  symbol,
  source = 'godeye',
  note = '',
  currentSearch = window.location.search,
  period = undefined,
) => {
  const params = new URLSearchParams(currentSearch);
  const resolvedPeriod = period ?? params.get('period') ?? undefined;
  return buildAppUrl({
    currentSearch,
    view: 'pricing',
    symbol,
    source,
    action: 'pricing',
    note,
    period: resolvedPeriod,
    ...readWorkbenchParamsFromSearch(currentSearch),
  });
};

const readScreenerFiltersFromTask = (task) => {
  if (!task || typeof task !== 'object') {
    return null;
  }
  const context = (task.context && typeof task.context === 'object') ? task.context : null;
  if (!context) {
    return null;
  }
  const filters = context.screener_filters;
  if (!filters || typeof filters !== 'object') {
    return null;
  }
  return filters;
};

const isMeaningfulFilterValue = (value) => (
  value !== null && value !== undefined && value !== ''
);

export const summarizeScreenerProvenance = (task) => {
  const filters = readScreenerFiltersFromTask(task);
  if (!filters) {
    return null;
  }
  const filterMode = typeof filters.filter === 'string' ? filters.filter : '';
  const sectorFilter = typeof filters.sector_filter === 'string' ? filters.sector_filter : '';
  const minScore = isMeaningfulFilterValue(filters.min_score) ? Number(filters.min_score) : null;
  const universeSize = isMeaningfulFilterValue(filters.universe_size) ? Number(filters.universe_size) : null;
  const period = typeof filters.period === 'string' ? filters.period : '';

  const parts = [];
  if (filterMode) parts.push(`筛选 ${filterMode}`);
  if (sectorFilter) parts.push(sectorFilter);
  if (minScore !== null && Number.isFinite(minScore)) parts.push(`≥${minScore}`);
  if (universeSize !== null && Number.isFinite(universeSize)) parts.push(`候选 ${universeSize}`);
  if (period) parts.push(period);

  const label = parts.length ? parts.join(' · ') : '筛选条件';

  return {
    label,
    filterMode,
    sectorFilter,
    minScore: minScore !== null && Number.isFinite(minScore) ? minScore : null,
    universeSize: universeSize !== null && Number.isFinite(universeSize) ? universeSize : null,
    period,
  };
};

export const summarizeScreenerContext = (researchContext) => {
  if (!researchContext || researchContext.action !== 'screener') {
    return null;
  }
  const filters = {};
  if (researchContext.screenerFilter) filters.filter = researchContext.screenerFilter;
  if (researchContext.screenerSector) filters.sector_filter = researchContext.screenerSector;
  if (isMeaningfulFilterValue(researchContext.screenerMinScore)) {
    filters.min_score = researchContext.screenerMinScore;
  }
  const period = researchContext.screenerPeriod || researchContext.period || '';
  if (period) filters.period = period;

  const provenance = summarizeScreenerProvenance({ context: { screener_filters: filters } })
    || { label: '筛选条件', filterMode: '', sectorFilter: '', minScore: null, universeSize: null, period: '' };

  return {
    label: provenance.label,
    symbol: researchContext.symbol || '',
    source: researchContext.source || '',
    action: researchContext.action,
    filterMode: provenance.filterMode,
    sectorFilter: provenance.sectorFilter,
    minScore: provenance.minScore,
    period: provenance.period || period,
  };
};

export const buildPricingLinkFromTask = (
  task,
  currentSearch = window.location.search,
) => {
  const symbol = task && typeof task.symbol === 'string' ? task.symbol.trim() : '';
  if (!symbol) {
    return '';
  }
  const context = (task && task.context && typeof task.context === 'object') ? task.context : {};
  const screenerFilters = (context.screener_filters && typeof context.screener_filters === 'object')
    ? context.screener_filters
    : {};
  const source = (typeof task.source === 'string' && task.source) ? task.source : 'screener_task';
  const period = context.period || screenerFilters.period || undefined;
  return buildPricingLink(symbol, source, '', currentSearch, period);
};

const appendScreenerFilterParams = (url, screenerFilters) => {
  const [pathAndQuery, hash = ''] = url.split('#');
  const [pathname, query = ''] = pathAndQuery.split('?');
  const params = new URLSearchParams(query);

  const setIfMeaningful = (key, value) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  };

  setIfMeaningful('screener_filter', screenerFilters.filter);
  setIfMeaningful('screener_sector', screenerFilters.sector_filter);
  setIfMeaningful('screener_min_score', screenerFilters.min_score);
  setIfMeaningful('screener_period', screenerFilters.period);

  const nextQuery = params.toString();
  const nextHash = hash ? `#${hash}` : '';
  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${nextHash}`;
};

export const buildScreenerLinkFromTask = (
  task,
  currentSearch = window.location.search,
) => {
  const screenerFilters = readScreenerFiltersFromTask(task);
  if (!screenerFilters) {
    return '';
  }
  const symbolValue = task && typeof task.symbol === 'string' ? task.symbol.trim() : '';
  const period = (typeof screenerFilters.period === 'string' && screenerFilters.period)
    || (task && task.context && typeof task.context.period === 'string' ? task.context.period : '')
    || undefined;
  const baseUrl = buildAppUrl({
    currentSearch,
    view: 'pricing',
    symbol: symbolValue || undefined,
    source: 'screener_task',
    action: 'screener',
    period,
    ...readWorkbenchParamsFromSearch(currentSearch),
  });
  return appendScreenerFilterParams(baseUrl, screenerFilters);
};

export const buildCrossMarketLink = (
  templateId,
  source = 'godeye',
  note = '',
  currentSearch = window.location.search,
  draft = undefined,
) =>
  buildAppUrl({
    currentSearch,
    view: 'backtest',
    tab: 'cross-market',
    template: templateId,
    draft,
    source,
    action: 'cross_market',
    note,
    ...readWorkbenchParamsFromSearch(currentSearch),
  });

export const buildGodEyeLink = (currentSearch = window.location.search) =>
  buildAppUrl({
    currentSearch,
    view: 'godsEye',
  });

export const buildWorkbenchLink = (
  {
    refresh = '',
    type = '',
    sourceFilter = '',
    reason = '',
    snapshotView = '',
    snapshotFingerprint = '',
    snapshotSummary = '',
    keyword = '',
    queueMode = '',
    queueAction = '',
    taskId = '',
  } = {},
  currentSearch = window.location.search,
) =>
  buildAppUrl({
    currentSearch,
    view: 'workbench',
    workbenchRefresh: refresh,
    workbenchType: type,
    workbenchSource: sourceFilter,
    workbenchReason: reason,
    workbenchSnapshotView: snapshotView,
    workbenchSnapshotFingerprint: snapshotFingerprint,
    workbenchSnapshotSummary: snapshotSummary,
    workbenchKeyword: keyword,
    workbenchQueueMode: queueMode,
    workbenchQueueAction: queueAction,
    task: taskId,
  });

export const navigateToAppUrl = (url) => {
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const navigateByResearchAction = (action, currentSearch = window.location.search) => {
  if (!action?.target || action.target === 'observe') {
    return;
  }

  if (action.target === 'pricing') {
    navigateToAppUrl(
      buildPricingLink(action.symbol, action.source || 'playbook', action.note || '', currentSearch, action.period)
    );
    return;
  }

  if (action.target === 'cross-market') {
    navigateToAppUrl(
      buildCrossMarketLink(action.template, action.source || 'playbook', action.note || '', currentSearch, action.draft)
    );
    return;
  }

  if (action.target === 'godsEye') {
    navigateToAppUrl(buildGodEyeLink(currentSearch));
    return;
  }

  if (action.target === 'workbench') {
    navigateToAppUrl(
      buildWorkbenchLink(
        {
          refresh: action.refresh,
          type: action.type,
          sourceFilter: action.sourceFilter,
          reason: action.reason,
          snapshotView: action.snapshotView,
          snapshotFingerprint: action.snapshotFingerprint,
          snapshotSummary: action.snapshotSummary,
          keyword: action.keyword,
          queueMode: action.queueMode,
          queueAction: action.queueAction,
          taskId: action.taskId,
        },
        currentSearch
      )
    );
  }
};

export const formatResearchSource = (source = '') => {
  const mapping = {
    godeye: 'GodEye',
    alert_hunter: 'Alert Hunter',
    policy_timeline: 'Policy Timeline',
    factor_panel: 'Macro Factor Panel',
    risk_radar: 'Risk Premium Radar',
    cross_market_overview: 'Cross-Market Overview',
    cross_market_panel: 'Cross-Market Panel',
    pricing_playbook: 'Pricing Playbook',
    cross_market_playbook: 'Cross-Market Playbook',
  };
  return mapping[source] || source;
};
