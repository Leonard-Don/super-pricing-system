import {
  buildCrossMarketLink,
  buildPricingLink,
  buildPricingLinkFromTask,
  buildScreenerLinkFromTask,
  buildViewUrlForCurrentState,
  buildWorkbenchLink,
  readResearchContext,
  readViewAliasFromPathname,
  summarizeScreenerContext,
  summarizeScreenerProvenance,
} from '../utils/researchContext';

describe('researchContext workbench deep links', () => {
  it('builds and reads workbench filter params', () => {
    const url = buildWorkbenchLink(
      {
        refresh: 'high',
        type: 'cross_market',
        sourceFilter: 'godeye',
        reason: 'resonance',
        snapshotView: 'filtered',
        snapshotFingerprint: 'wv_pricing_focus',
        snapshotSummary: '快速视图：自动排序升档 · 类型：Pricing',
        keyword: 'hedge',
        queueMode: 'pricing',
        queueAction: 'next_same_type',
        taskId: 'task_123',
      },
      '?view=godsEye'
    );

    expect(url).toContain('view=workbench');
    expect(url).toContain('workbench_refresh=high');
    expect(url).toContain('workbench_type=cross_market');
    expect(url).toContain('workbench_source=godeye');
    expect(url).toContain('workbench_reason=resonance');
    expect(url).toContain('workbench_snapshot_view=filtered');
    expect(url).toContain('workbench_snapshot_fingerprint=wv_pricing_focus');
    expect(url).toContain('workbench_snapshot_summary=');
    expect(url).toContain('workbench_keyword=hedge');
    expect(url).toContain('workbench_queue_mode=pricing');
    expect(url).toContain('workbench_queue_action=next_same_type');
    expect(url).toContain('task=task_123');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('workbench');
    expect(parsed.workbenchRefresh).toBe('high');
    expect(parsed.workbenchType).toBe('cross_market');
    expect(parsed.workbenchSource).toBe('godeye');
    expect(parsed.workbenchReason).toBe('resonance');
    expect(parsed.workbenchSnapshotView).toBe('filtered');
    expect(parsed.workbenchSnapshotFingerprint).toBe('wv_pricing_focus');
    expect(parsed.workbenchSnapshotSummary).toBe('快速视图：自动排序升档 · 类型：Pricing');
    expect(parsed.workbenchKeyword).toBe('hedge');
    expect(parsed.workbenchQueueMode).toBe('pricing');
    expect(parsed.workbenchQueueAction).toBe('next_same_type');
    expect(parsed.task).toBe('task_123');
  });

  it('preserves workbench filters when syncing the current workbench view url', () => {
    const url = buildViewUrlForCurrentState(
      'workbench',
      '?view=workbench&workbench_refresh=high&workbench_type=pricing&workbench_source=pricing_playbook&workbench_reason=policy_source&workbench_snapshot_view=scoped&workbench_snapshot_fingerprint=wv_policy_scope&workbench_snapshot_summary=%E5%BF%AB%E9%80%9F%E8%A7%86%E8%A7%92%EF%BC%9A%E8%87%AA%E5%8A%A8%E6%8E%92%E5%BA%8F%E7%BC%93%E5%92%8C&workbench_keyword=policy&workbench_queue_mode=pricing&workbench_queue_action=next_same_type&task=rw_123'
    );

    expect(url).toContain('view=workbench');
    expect(url).toContain('workbench_refresh=high');
    expect(url).toContain('workbench_type=pricing');
    expect(url).toContain('workbench_source=pricing_playbook');
    expect(url).toContain('workbench_reason=policy_source');
    expect(url).toContain('workbench_snapshot_view=scoped');
    expect(url).toContain('workbench_snapshot_fingerprint=wv_policy_scope');
    expect(url).toContain('workbench_snapshot_summary=');
    expect(url).toContain('workbench_keyword=policy');
    expect(url).toContain('workbench_queue_mode=pricing');
    expect(url).toContain('workbench_queue_action=next_same_type');
    expect(url).toContain('task=rw_123');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('workbench');
    expect(parsed.workbenchRefresh).toBe('high');
    expect(parsed.workbenchType).toBe('pricing');
    expect(parsed.workbenchSource).toBe('pricing_playbook');
    expect(parsed.workbenchReason).toBe('policy_source');
    expect(parsed.workbenchSnapshotView).toBe('scoped');
    expect(parsed.workbenchSnapshotFingerprint).toBe('wv_policy_scope');
    expect(parsed.workbenchSnapshotSummary).toBe('快速视角：自动排序缓和');
    expect(parsed.workbenchKeyword).toBe('policy');
    expect(parsed.workbenchQueueMode).toBe('pricing');
    expect(parsed.workbenchQueueAction).toBe('next_same_type');
    expect(parsed.task).toBe('rw_123');
  });

  it('preserves pricing period when syncing the pricing view url', () => {
    const url = buildViewUrlForCurrentState(
      'pricing',
      '?view=pricing&symbol=AAPL&period=2y&source=research_workbench&note=reopen'
    );

    expect(url).toContain('view=pricing');
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('period=2y');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('pricing');
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.period).toBe('2y');
  });

  it('canonicalizes view alias pathnames back to the app root', () => {
    const url = buildViewUrlForCurrentState(
      'quantlab',
      '?symbol=AAPL',
      '/quantlab',
    );

    expect(url).toBe('/?view=quantlab');
  });

  it('reads view aliases from pathname-based deep links', () => {
    expect(readViewAliasFromPathname('/quantlab')).toBe('quantlab');
    expect(readViewAliasFromPathname('/godeye')).toBe('godsEye');
    expect(readViewAliasFromPathname('/nested/quantlab')).toBeNull();
  });

  it('preserves realtime tab state when syncing the realtime view url', () => {
    const url = buildViewUrlForCurrentState(
      'realtime',
      '?view=realtime&tab=crypto'
    );

    expect(url).toContain('view=realtime');
    expect(url).toContain('tab=crypto');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('realtime');
    expect(parsed.tab).toBe('crypto');
  });

  it('preserves cross-market draft deep link params', () => {
    const url = buildCrossMarketLink(
      'macro_mispricing_relative_value',
      'pricing_thesis',
      '来自定价 thesis 的跨市场草案',
      '?view=workbench&symbol=BABA&workbench_snapshot_view=filtered&workbench_snapshot_fingerprint=wv_baba_pricing&workbench_snapshot_summary=%E5%BF%AB%E9%80%9F%E8%A7%86%E5%9B%BE%EF%BC%9A%E8%87%AA%E5%8A%A8%E6%8E%92%E5%BA%8F%E5%8D%87%E6%A1%A3%20%C2%B7%20%E7%B1%BB%E5%9E%8B%EF%BC%9APricing&workbench_keyword=hedge&workbench_queue_mode=pricing',
      'mm_baba_123',
    );

    expect(url).toContain('tab=cross-market');
    expect(url).toContain('template=macro_mispricing_relative_value');
    expect(url).toContain('draft=mm_baba_123');
    expect(url).toContain('workbench_snapshot_fingerprint=wv_baba_pricing');
    expect(url).toContain('workbench_keyword=hedge');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('backtest');
    expect(parsed.tab).toBe('cross-market');
    expect(parsed.template).toBe('macro_mispricing_relative_value');
    expect(parsed.draft).toBe('mm_baba_123');
    expect(parsed.workbenchSnapshotFingerprint).toBe('wv_baba_pricing');
    expect(parsed.workbenchKeyword).toBe('hedge');
    expect(parsed.workbenchQueueMode).toBe('pricing');
  });

  it('builds a pricing deep link from a screener-sourced task, preserving symbol, source and period', () => {
    const task = {
      id: 'rw_abc',
      symbol: 'AAPL',
      source: 'screener',
      context: {
        period: 'ttm',
        primary_view: '低估',
        screener_filters: {
          filter: 'undervalued',
          sector_filter: 'tech',
          min_score: 12,
          universe_size: 50,
          period: 'ttm',
        },
      },
    };

    const url = buildPricingLinkFromTask(task, '?view=workbench&task=rw_abc');

    expect(url).toContain('view=pricing');
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('source=screener');
    expect(url).toContain('period=ttm');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('pricing');
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.source).toBe('screener');
    expect(parsed.period).toBe('ttm');
  });

  it('falls back to a screener_task source and screener_filters period when task fields are sparse', () => {
    const task = {
      symbol: 'msft',
      context: {
        screener_filters: { period: '1y' },
      },
    };

    const url = buildPricingLinkFromTask(task, '');

    expect(url).toContain('view=pricing');
    expect(url).toContain('symbol=msft');
    expect(url).toContain('source=screener_task');
    expect(url).toContain('period=1y');
  });

  it('returns an empty string when the task has no symbol', () => {
    expect(buildPricingLinkFromTask({ source: 'screener' }, '')).toBe('');
    expect(buildPricingLinkFromTask(null, '')).toBe('');
    expect(buildPricingLinkFromTask(undefined, '')).toBe('');
  });

  it('summarizes screener provenance into a concise label for screener-sourced tasks', () => {
    const task = {
      id: 'rw_screener',
      symbol: 'AAPL',
      source: 'screener',
      context: {
        screener_filters: {
          filter: 'undervalued',
          sector_filter: 'tech',
          min_score: 12,
          universe_size: 50,
          period: 'ttm',
        },
      },
    };

    const provenance = summarizeScreenerProvenance(task);

    expect(provenance).not.toBeNull();
    expect(provenance.label).toBe('筛选 undervalued · tech · ≥12 · 候选 50 · ttm');
    expect(provenance.filterMode).toBe('undervalued');
    expect(provenance.sectorFilter).toBe('tech');
    expect(provenance.minScore).toBe(12);
    expect(provenance.universeSize).toBe(50);
    expect(provenance.period).toBe('ttm');
  });

  it('returns null when the task has no screener_filters context', () => {
    expect(summarizeScreenerProvenance({ context: { note: 'manual' } })).toBeNull();
    expect(summarizeScreenerProvenance({ context: {} })).toBeNull();
    expect(summarizeScreenerProvenance({})).toBeNull();
    expect(summarizeScreenerProvenance(null)).toBeNull();
    expect(summarizeScreenerProvenance(undefined)).toBeNull();
  });

  it('omits missing or empty fields from the screener provenance label', () => {
    const sparse = summarizeScreenerProvenance({
      context: {
        screener_filters: {
          filter: 'undervalued',
          period: '1y',
        },
      },
    });

    expect(sparse).not.toBeNull();
    expect(sparse.label).toBe('筛选 undervalued · 1y');
    expect(sparse.sectorFilter).toBe('');
    expect(sparse.minScore).toBeNull();
    expect(sparse.universeSize).toBeNull();
  });

  it('returns a generic 筛选条件 label when screener_filters has only unrecognized keys', () => {
    const provenance = summarizeScreenerProvenance({
      context: {
        screener_filters: { custom_dim: 'foo' },
      },
    });

    expect(provenance).not.toBeNull();
    expect(provenance.label).toBe('筛选条件');
  });

  it('builds a return-to-screener deep link from a screener-sourced task with all filter dimensions restored', () => {
    const task = {
      id: 'rw_screener_back',
      symbol: 'AAPL',
      source: 'screener',
      context: {
        period: 'ttm',
        primary_view: '低估',
        screener_filters: {
          filter: 'undervalued',
          sector_filter: 'tech',
          min_score: 12,
          universe_size: 50,
          period: 'ttm',
        },
      },
    };

    const url = buildScreenerLinkFromTask(task, '?view=workbench&task=rw_screener_back');

    expect(url).toContain('view=pricing');
    expect(url).toContain('action=screener');
    expect(url).toContain('source=screener_task');
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('period=ttm');
    expect(url).toContain('screener_filter=undervalued');
    expect(url).toContain('screener_sector=tech');
    expect(url).toContain('screener_min_score=12');
    expect(url).toContain('screener_period=ttm');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('pricing');
    expect(parsed.action).toBe('screener');
    expect(parsed.source).toBe('screener_task');
    expect(parsed.screenerFilter).toBe('undervalued');
    expect(parsed.screenerSector).toBe('tech');
    expect(parsed.screenerMinScore).toBe('12');
    expect(parsed.screenerPeriod).toBe('ttm');
  });

  it('omits absent screener filter params and works without a task symbol', () => {
    const task = {
      context: {
        screener_filters: {
          filter: 'high-confidence',
          period: '1y',
        },
      },
    };

    const url = buildScreenerLinkFromTask(task, '');

    expect(url).toContain('view=pricing');
    expect(url).toContain('action=screener');
    expect(url).toContain('screener_filter=high-confidence');
    expect(url).toContain('screener_period=1y');
    expect(url).not.toContain('screener_sector');
    expect(url).not.toContain('screener_min_score');
    expect(url).not.toContain('symbol=');
  });

  it('returns an empty string when the task has no screener_filters', () => {
    expect(buildScreenerLinkFromTask({ context: { note: 'manual' } }, '')).toBe('');
    expect(buildScreenerLinkFromTask({ context: {} }, '')).toBe('');
    expect(buildScreenerLinkFromTask({}, '')).toBe('');
    expect(buildScreenerLinkFromTask(null, '')).toBe('');
    expect(buildScreenerLinkFromTask(undefined, '')).toBe('');
  });

  it('reads screener filter params from the URL via readResearchContext', () => {
    const parsed = readResearchContext(
      '?view=pricing&action=screener&screener_filter=aligned&screener_sector=energy&screener_min_score=8&screener_period=2y'
    );

    expect(parsed.view).toBe('pricing');
    expect(parsed.action).toBe('screener');
    expect(parsed.screenerFilter).toBe('aligned');
    expect(parsed.screenerSector).toBe('energy');
    expect(parsed.screenerMinScore).toBe('8');
    expect(parsed.screenerPeriod).toBe('2y');
  });

  it('preserves workbench snapshot context when reopening pricing research', () => {
    const url = buildPricingLink(
      'AAPL',
      'research_workbench',
      '从工作台重开',
      '?view=workbench&workbench_snapshot_view=filtered&workbench_snapshot_fingerprint=wv_pricing_focus&workbench_snapshot_summary=%E5%BF%AB%E9%80%9F%E8%A7%86%E5%9B%BE%EF%BC%9A%E8%87%AA%E5%8A%A8%E6%8E%92%E5%BA%8F%E5%8D%87%E6%A1%A3%20%C2%B7%20%E7%B1%BB%E5%9E%8B%EF%BC%9APricing&workbench_keyword=hedge&workbench_queue_mode=pricing&task=rw_123',
      '6mo',
    );

    expect(url).toContain('view=pricing');
    expect(url).toContain('symbol=AAPL');
    expect(url).toContain('period=6mo');
    expect(url).toContain('workbench_snapshot_fingerprint=wv_pricing_focus');
    expect(url).toContain('workbench_keyword=hedge');
    expect(url).toContain('workbench_queue_mode=pricing');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.view).toBe('pricing');
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.period).toBe('6mo');
    expect(parsed.workbenchSnapshotFingerprint).toBe('wv_pricing_focus');
    expect(parsed.workbenchKeyword).toBe('hedge');
    expect(parsed.workbenchQueueMode).toBe('pricing');
  });

  it('summarizes a screener research context with all filter dimensions populated', () => {
    const summary = summarizeScreenerContext({
      view: 'pricing',
      action: 'screener',
      symbol: 'AAPL',
      source: 'screener_task',
      period: 'ttm',
      screenerFilter: 'undervalued',
      screenerSector: 'tech',
      screenerMinScore: '12',
      screenerPeriod: 'ttm',
    });

    expect(summary).not.toBeNull();
    expect(summary.label).toBe('筛选 undervalued · tech · ≥12 · ttm');
    expect(summary.symbol).toBe('AAPL');
    expect(summary.source).toBe('screener_task');
    expect(summary.action).toBe('screener');
    expect(summary.filterMode).toBe('undervalued');
    expect(summary.sectorFilter).toBe('tech');
    expect(summary.minScore).toBe(12);
    expect(summary.period).toBe('ttm');
  });

  it('returns null when the research context is not a screener deep link', () => {
    expect(summarizeScreenerContext(null)).toBeNull();
    expect(summarizeScreenerContext(undefined)).toBeNull();
    expect(summarizeScreenerContext({})).toBeNull();
    expect(summarizeScreenerContext({ action: '', symbol: 'AAPL' })).toBeNull();
    expect(summarizeScreenerContext({ action: 'pricing', symbol: 'AAPL' })).toBeNull();
  });

  it('falls back to the research context period when screenerPeriod is empty', () => {
    const summary = summarizeScreenerContext({
      action: 'screener',
      symbol: 'AAPL',
      source: 'screener_task',
      period: '1y',
      screenerFilter: 'undervalued',
      screenerSector: '',
      screenerMinScore: '',
      screenerPeriod: '',
    });

    expect(summary.label).toBe('筛选 undervalued · 1y');
    expect(summary.period).toBe('1y');
    expect(summary.sectorFilter).toBe('');
    expect(summary.minScore).toBeNull();
  });

  it('returns a generic 筛选条件 label when no filter dimensions are present', () => {
    const summary = summarizeScreenerContext({
      action: 'screener',
      symbol: 'AAPL',
      source: 'screener_task',
    });

    expect(summary).not.toBeNull();
    expect(summary.label).toBe('筛选条件');
    expect(summary.symbol).toBe('AAPL');
    expect(summary.action).toBe('screener');
  });

  it('drops screener_* params when switching from a screener pricing url to a non-pricing view', () => {
    const screenerSearch =
      '?view=pricing&action=screener&symbol=AAPL&period=ttm&source=screener_task'
      + '&screener_filter=undervalued&screener_sector=tech&screener_min_score=12&screener_period=ttm';

    const workbenchUrl = buildViewUrlForCurrentState('workbench', screenerSearch);
    expect(workbenchUrl).toContain('view=workbench');
    expect(workbenchUrl).not.toContain('screener_filter');
    expect(workbenchUrl).not.toContain('screener_sector');
    expect(workbenchUrl).not.toContain('screener_min_score');
    expect(workbenchUrl).not.toContain('screener_period');

    const godEyeUrl = buildViewUrlForCurrentState('godsEye', screenerSearch);
    expect(godEyeUrl).toContain('view=godsEye');
    expect(godEyeUrl).not.toContain('screener_filter');
    expect(godEyeUrl).not.toContain('screener_sector');
    expect(godEyeUrl).not.toContain('screener_min_score');
    expect(godEyeUrl).not.toContain('screener_period');

    const backtestUrl = buildViewUrlForCurrentState('backtest', screenerSearch);
    expect(backtestUrl).not.toContain('screener_filter');
    expect(backtestUrl).not.toContain('screener_sector');
    expect(backtestUrl).not.toContain('screener_min_score');
    expect(backtestUrl).not.toContain('screener_period');
  });

  it('preserves screener_* params when staying on the pricing view', () => {
    const url = buildViewUrlForCurrentState(
      'pricing',
      '?view=pricing&action=screener&symbol=AAPL&period=ttm&source=screener_task'
      + '&screener_filter=undervalued&screener_sector=tech&screener_min_score=12&screener_period=ttm'
    );

    expect(url).toContain('view=pricing');
    expect(url).toContain('action=screener');
    expect(url).toContain('screener_filter=undervalued');
    expect(url).toContain('screener_sector=tech');
    expect(url).toContain('screener_min_score=12');
    expect(url).toContain('screener_period=ttm');

    const parsed = readResearchContext(url.split('?')[1] ? `?${url.split('?')[1]}` : '');
    expect(parsed.screenerFilter).toBe('undervalued');
    expect(parsed.screenerSector).toBe('tech');
    expect(parsed.screenerMinScore).toBe('12');
    expect(parsed.screenerPeriod).toBe('ttm');
  });
});
