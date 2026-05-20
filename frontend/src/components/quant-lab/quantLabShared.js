export const PERIOD_OPTIONS = [
  { value: '6mo', label: '6个月' },
  { value: '1y', label: '1年' },
  { value: '2y', label: '2年' },
  { value: '3y', label: '3年' },
];

export const formatPct = (value) => `${(Number(value || 0) * 100).toFixed(2)}%`;
export const formatSignedPct = (value) => `${Number(value || 0).toFixed(2)}%`;
export const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
export const formatDateTime = (value) => String(value || '').slice(0, 19).replace('T', ' ');

export const describeExecution = (execution, fallback) => {
  if (!execution) {
    return fallback;
  }
  const details = [];
  if (execution.source) {
    details.push(`来源 ${execution.source}`);
  }
  if (execution.cache_status && execution.cache_status !== 'miss') {
    details.push(`缓存 ${execution.cache_status}`);
  }
  if (execution.fallback_reason) {
    details.push(`原因 ${execution.fallback_reason}`);
  }
  if (execution.snapshot_timestamp) {
    details.push(`快照 ${String(execution.snapshot_timestamp).slice(0, 19).replace('T', ' ')}`);
  }
  return details.length ? details.join('，') : fallback;
};

export const executionAlertType = (execution) => (execution?.degraded ? 'warning' : 'info');

export const lifecycleStageColor = (value) => ({
  discovered: 'blue',
  backtesting: 'geekblue',
  optimizing: 'purple',
  paper: 'gold',
  live: 'green',
  retired: 'default',
}[value] || 'default');

export const lifecycleStatusColor = (value) => ({
  active: 'cyan',
  watching: 'gold',
  blocked: 'red',
  closed: 'default',
}[value] || 'default');

export const QUANT_LAB_BOUNDARY_META = {
  pricing: {
    label: '定价内核',
    tone: 'pricing',
    summary: '继续保留在本仓',
    description: '直接服务估值、模型解释和定价判断，是 super-pricing-system 的核心能力。',
  },
  migration: {
    label: '迁移候选',
    tone: 'migration',
    summary: '继续开发归 quant-trading-system',
    description: '策略、回测、实时信号和行业轮动类能力只保留入口，后续主开发应放到 quant-trading-system。',
  },
  support: {
    label: '内部支撑',
    tone: 'support',
    summary: '只做运行态支撑',
    description: '用于任务队列、告警、数据质量和历史快照兼容，不扩成独立交易产品面。',
  },
};

export const QUANT_LAB_BOUNDARY_ORDER = ['pricing', 'migration', 'support'];

export const QUANT_LAB_TAB_META = [
  {
    key: 'optimizer',
    title: '策略优化器',
    shortTitle: '优化',
    summary: '把参数搜索、稳健性验证和候选策略筛选压缩到同一个执行台。',
    boundary: 'migration',
    boundarySummary: '策略交易类能力，新功能迁往 quant-trading-system。',
  },
  {
    key: 'backtest-enhance',
    title: '回测增强',
    shortTitle: '回测',
    summary: '补 Monte Carlo、多周期和市场冲击，把回测结果做成可复盘的压力测试。',
    boundary: 'migration',
    boundarySummary: '回测扩展属于交易研究主线，仅保留历史实验入口。',
  },
  {
    key: 'risk',
    title: '风险归因中心',
    shortTitle: '风险',
    summary: '把收益、回撤、相关性和压力测试收进同一张风险剖面。',
    boundary: 'migration',
    boundarySummary: '组合风险更贴近策略仓，后续能力迁往 quant-trading-system。',
  },
  {
    key: 'valuation',
    title: '估值历史与集成',
    shortTitle: '估值',
    summary: '统一历史估值、模型集成和市场偏离，减少估值判断的跳转成本。',
    boundary: 'pricing',
    boundarySummary: '估值历史与模型集成是本仓定价核心。',
  },
  {
    key: 'industry',
    title: '行业轮动策略',
    shortTitle: '轮动',
    summary: '围绕行业轮动结果、执行诊断和因子映射做集中回看。',
    boundary: 'migration',
    boundarySummary: '行业轮动属于交易研究，继续开发归 quant-trading-system。',
  },
  {
    key: 'industry-intel',
    title: '行业智能',
    shortTitle: '行业智能',
    summary: '把行业情报、联动网络和行业事件放到一条可扫描视图里。',
    boundary: 'migration',
    boundarySummary: '行业热度和情报主线应收口到 quant-trading-system。',
  },
  {
    key: 'signal-validation',
    title: '信号验证与行情深度',
    shortTitle: '信号',
    summary: '连接宏观验证、另类信号和实时深度探测，首屏先给出可疑点。',
    boundary: 'migration',
    boundarySummary: '实时行情与信号验证只作为兼容入口保留。',
  },
  {
    key: 'factor',
    title: '自定义因子语言',
    shortTitle: '因子',
    summary: '把因子表达式、样本检查和结果预览留在同一个实验面板。',
    boundary: 'pricing',
    boundarySummary: '用于估值解释和定价实验，继续留在本仓。',
  },
  {
    key: 'infrastructure',
    title: '基础设施',
    shortTitle: '基础设施',
    summary: '任务队列、认证、通知和持久化都归到同一个运行面板。',
    boundary: 'support',
    boundarySummary: '只作为本仓任务、认证和持久化支撑。',
  },
  {
    key: 'ops',
    title: '研究运营中心',
    shortTitle: '运营',
    summary: '把交易日志、告警编排和数据质量观测组成研究闭环的最后一段。',
    boundary: 'support',
    boundarySummary: '只做告警、数据质量和历史研究闭环支撑。',
  },
];

export const QUANT_LAB_TAB_META_MAP = QUANT_LAB_TAB_META.reduce((accumulator, item) => {
  accumulator[item.key] = item;
  return accumulator;
}, {});

export const getQuantLabBoundaryMeta = (boundary) => (
  QUANT_LAB_BOUNDARY_META[boundary] || QUANT_LAB_BOUNDARY_META.support
);

export const buildQuantLabBoundarySummary = (items = QUANT_LAB_TAB_META) => (
  QUANT_LAB_BOUNDARY_ORDER.map((boundary) => {
    const boundaryItems = items.filter((item) => item.boundary === boundary);
    const boundaryMeta = getQuantLabBoundaryMeta(boundary);
    return {
      key: boundary,
      ...boundaryMeta,
      count: boundaryItems.length,
      titles: boundaryItems.map((item) => item.title),
    };
  })
);
