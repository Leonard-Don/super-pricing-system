// ---------------------------------------------------------------------------
// researchContext — ported from frontend/src/utils/researchContext.js
// Only the functions used by navigationHelpers (buildPricingLink, buildCrossMarketLink,
// buildWorkbenchLink, navigateToAppUrl).
// ---------------------------------------------------------------------------

const VIEW_QUERY_KEY = 'view';
const TAB_QUERY_KEY = 'tab';
const ROOT_PATHNAME = '/';
const PATHNAME_VIEW_ALIASES: Record<string, string> = {
  pricing: 'pricing',
  godeye: 'godsEye',
  godseye: 'godsEye',
  workbench: 'workbench',
  quantlab: 'quantlab',
  backtest: 'backtest',
  realtime: 'realtime',
};
const VIEW_QUERY_ALIASES: Record<string, string> = {
  godeye: 'godsEye',
  godseye: 'godsEye',
};

const RESEARCH_KEYS = ['symbol', 'symbols', 'template', 'draft', 'action', 'source', 'note', 'focus'];
const PRICING_KEYS = ['symbol', 'symbols', 'action', 'source', 'note', 'period'];
const CROSS_MARKET_KEYS = ['template', 'draft', 'action', 'source', 'note', 'focus'];
const SCREENER_KEYS = ['screener_filter', 'screener_sector', 'screener_min_score', 'screener_period'];
const WORKBENCH_KEYS = [
  'workbench_refresh', 'workbench_type', 'workbench_source', 'workbench_reason',
  'workbench_snapshot_view', 'workbench_snapshot_fingerprint', 'workbench_snapshot_summary',
  'workbench_keyword', 'workbench_queue_mode', 'workbench_queue_action', 'task',
];

const setParam = (params: URLSearchParams, key: string, value: string | undefined): void => {
  if (value === undefined || value === null || value === '') {
    params.delete(key);
  } else {
    params.set(key, value);
  }
};

const normalizeViewQueryValue = (view: string): string => {
  const rawView = String(view || 'backtest');
  return VIEW_QUERY_ALIASES[rawView.toLowerCase()] ?? rawView;
};

const readViewAliasFromPathname = (pathname = '/'): string | null => {
  const normalizedPathname =
    String(pathname || ROOT_PATHNAME)
      .split('?')[0]
      .replace(/\/+$/, '') || ROOT_PATHNAME;
  const segments = normalizedPathname.split('/').filter(Boolean);
  if (segments.length !== 1) return null;
  return PATHNAME_VIEW_ALIASES[segments[0].toLowerCase()] ?? null;
};

const normalizeAppShellPathname = (pathname = '/'): string =>
  readViewAliasFromPathname(pathname) ? ROOT_PATHNAME : (pathname || ROOT_PATHNAME);

const sanitizeParamsForView = (params: URLSearchParams, view: string): URLSearchParams => {
  if (view === 'pricing') {
    params.delete(TAB_QUERY_KEY);
    params.delete('record');
    params.delete('history_symbol');
    params.delete('history_strategy');
    RESEARCH_KEYS.forEach((key) => { if (!PRICING_KEYS.includes(key)) params.delete(key); });
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
      RESEARCH_KEYS.forEach((key) => { if (!CROSS_MARKET_KEYS.includes(key)) params.delete(key); });
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

interface BuildAppUrlOptions {
  pathname?: string;
  currentSearch?: string;
  view?: string;
  tab?: string;
  symbol?: string;
  symbols?: string;
  template?: string;
  draft?: string;
  action?: string;
  source?: string;
  note?: string;
  focus?: string;
  period?: string;
  record?: string;
  historySymbol?: string;
  historyStrategy?: string;
  workbenchRefresh?: string;
  workbenchType?: string;
  workbenchSource?: string;
  workbenchReason?: string;
  workbenchSnapshotView?: string;
  workbenchSnapshotFingerprint?: string;
  workbenchSnapshotSummary?: string;
  workbenchKeyword?: string;
  workbenchQueueMode?: string;
  workbenchQueueAction?: string;
  task?: string;
}

const buildAppUrl = ({
  pathname = '/',
  currentSearch = '',
  view = 'backtest',
  tab,
  symbol,
  symbols,
  template,
  draft,
  action,
  source,
  note,
  focus,
  period,
  record,
  historySymbol,
  historyStrategy,
  workbenchRefresh,
  workbenchType,
  workbenchSource,
  workbenchReason,
  workbenchSnapshotView,
  workbenchSnapshotFingerprint,
  workbenchSnapshotSummary,
  workbenchKeyword,
  workbenchQueueMode,
  workbenchQueueAction,
  task,
}: BuildAppUrlOptions = {}): string => {
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
  setParam(params, 'focus', focus);
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
  // Use empty hash in tests (no window.location)
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
};

const readWorkbenchParamsFromSearch = (currentSearch = ''): Partial<BuildAppUrlOptions> => {
  const params = new URLSearchParams(currentSearch);
  return {
    workbenchSnapshotView: params.get('workbench_snapshot_view') ?? undefined,
    workbenchSnapshotFingerprint: params.get('workbench_snapshot_fingerprint') ?? undefined,
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary') ?? undefined,
    workbenchKeyword: params.get('workbench_keyword') ?? undefined,
    workbenchQueueMode: params.get('workbench_queue_mode') ?? undefined,
    workbenchQueueAction: params.get('workbench_queue_action') ?? undefined,
    workbenchRefresh: params.get('workbench_refresh') ?? undefined,
    workbenchType: params.get('workbench_type') ?? undefined,
    workbenchSource: params.get('workbench_source') ?? undefined,
    workbenchReason: params.get('workbench_reason') ?? undefined,
    task: params.get('task') ?? undefined,
  };
};

export const buildPricingLink = (
  symbol: string,
  source = 'godeye',
  note = '',
  currentSearch = '',
  period?: string,
): string => {
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

export const buildCrossMarketLink = (
  templateId: string,
  source = 'godeye',
  note = '',
  currentSearch = '',
  draft?: string,
  focus?: string,
): string =>
  buildAppUrl({
    currentSearch,
    view: 'backtest',
    tab: 'cross-market',
    template: templateId,
    draft,
    source,
    action: 'cross_market',
    note,
    focus,
    ...readWorkbenchParamsFromSearch(currentSearch),
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
  }: {
    refresh?: string;
    type?: string;
    sourceFilter?: string;
    reason?: string;
    snapshotView?: string;
    snapshotFingerprint?: string;
    snapshotSummary?: string;
    keyword?: string;
    queueMode?: string;
    queueAction?: string;
    taskId?: string;
  } = {},
  currentSearch = '',
): string =>
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

export const navigateToAppUrl = (url: string): void => {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const buildGodEyeLink = (currentSearch = ''): string =>
  buildAppUrl({ currentSearch, view: 'godsEye' });

export const buildViewUrlForCurrentState = (
  view: string,
  currentSearch = '',
  pathname = '/',
): string => {
  const params = new URLSearchParams(currentSearch);
  sanitizeParamsForView(params, view);
  return buildAppUrl({
    pathname: normalizeAppShellPathname(pathname),
    currentSearch: `?${params.toString()}`,
    view,
    tab: view === 'backtest' || view === 'realtime' ? (params.get(TAB_QUERY_KEY) ?? undefined) : undefined,
    symbol: params.get('symbol') ?? undefined,
    symbols: params.get('symbols') ?? undefined,
    template: params.get('template') ?? undefined,
    draft: params.get('draft') ?? undefined,
    action: params.get('action') ?? undefined,
    source: params.get('source') ?? undefined,
    note: params.get('note') ?? undefined,
    focus: params.get('focus') ?? undefined,
    period: params.get('period') ?? undefined,
    record: params.get('record') ?? undefined,
    historySymbol: params.get('history_symbol') ?? undefined,
    historyStrategy: params.get('history_strategy') ?? undefined,
    workbenchRefresh: params.get('workbench_refresh') ?? undefined,
    workbenchType: params.get('workbench_type') ?? undefined,
    workbenchSource: params.get('workbench_source') ?? undefined,
    workbenchReason: params.get('workbench_reason') ?? undefined,
    workbenchSnapshotView: params.get('workbench_snapshot_view') ?? undefined,
    workbenchSnapshotFingerprint: params.get('workbench_snapshot_fingerprint') ?? undefined,
    workbenchSnapshotSummary: params.get('workbench_snapshot_summary') ?? undefined,
    workbenchKeyword: params.get('workbench_keyword') ?? undefined,
    workbenchQueueMode: params.get('workbench_queue_mode') ?? undefined,
    workbenchQueueAction: params.get('workbench_queue_action') ?? undefined,
    task: params.get('task') ?? undefined,
  });
};

export { normalizeViewQueryValue, normalizeAppShellPathname, readViewAliasFromPathname };
