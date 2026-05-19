/**
 * 前端 fallback 词典 — 把 alt-data / policy / macro 子系统里的英文 enum
 * token 翻成中文。
 *
 * 优先策略（重要）：
 * 1. 如果 payload 自己带 `_zh` 字段（例如 `link.component_zh`）— 直接用，
 *    后端权威。这是 commit 0c10536 引入的并行字段，目前由
 *    ``scripts/export_public_summary.py`` 写入 ``alt_data_summary.json``。
 * 2. 否则用本文件的 fallback dict。当前 FastAPI 直接驱动的端点
 *    (``/alt-data/macro-briefing`` 等) 暂时还没有 `_zh` 字段，所以
 *    fallback 是真实在跑的代码路径。
 * 3. 字典里没有的 token — 直接返回原 token（永不丢字符）。
 *
 * 这份字典与 ``scripts/export_public_summary.py`` 里的
 * ``_PROVIDER_LABELS_ZH`` / ``_ARCHIVE_LABELS_ZH`` /
 * ``_SOURCE_MODE_LABELS_ZH`` / ``_EXECUTION_STATUS_LABELS_ZH`` /
 * ``_DEPARTMENT_LABELS_ZH`` 一一对应，扩展新 token 时两边都要更新。
 */

export const PROVIDER_LABELS_ZH = {
  policy_radar: '政策雷达',
  policy_execution: '政策执行',
  supply_chain: '供应链',
  macro_hf: '宏观高频',
  fund_holdings: '基金持仓',
  northbound: '北向资金',
  block_trades: '大宗交易',
  composite_signal: '综合信号',
  people_layer: '人事层',
  governance: '治理结构',
  entity_resolution: '实体识别',
  narrative: '叙事档案',
  macro_briefing: '宏观简报',
};

export const ARCHIVE_LABELS_ZH = {
  narrative: '叙事档案',
  composite: '综合信号档案',
  composite_signal: '综合信号档案',
  macro_briefing: '宏观简报',
};

export const SOURCE_MODE_LABELS_ZH = {
  public_disclosure: '公开披露',
  regulated_data: '授权数据',
  scraped: '抓取数据',
  curated: '策展数据',
  live: '实时数据',
  proxy: '代理数据',
  official: '官方',
  market: '市场',
  derived: '派生',
};

export const EXECUTION_STATUS_LABELS_ZH = {
  reversal_cluster: '政策反转簇',
  alignment_cluster: '政策共振簇',
  neutral: '中性',
  active: '正常推进',
  lagging: '执行滞后',
};

export const DEPARTMENT_LABELS_ZH = {
  ndrc_tz: '发改委体改司',
  ndrc_jjs: '发改委经济运行司',
  mof_kjzx: '财政部库款中心',
  mof_ggczs: '财政部国库司',
  pboc_mpd: '人民银行货币政策司',
  pboc_fsd: '人民银行金融稳定局',
  csrc_fxbgs: '证监会风险办',
  fed: '美联储',
  ecb: '欧洲央行',
  boe: '英国央行',
  nea: '国家能源局',
  ndrc: '发改委',
};

// Component labels share the provider namespace.
export const COMPONENT_LABELS_ZH = {
  ...PROVIDER_LABELS_ZH,
};

/**
 * 通用 helper：优先用 payload 自己带的 ``${field}_zh``，否则查 fallback
 * 词典，最后回退到原 token。永不返回 ``undefined`` / 空字符串覆盖。
 *
 * @example
 *   const label = preferZh(link, 'component', PROVIDER_LABELS_ZH);
 *   // link.component_zh ?? PROVIDER_LABELS_ZH[link.component] ?? link.component
 *
 * @param {object} payload     - 数据对象（可能为空）
 * @param {string} field       - 字段名（不带 `_zh` 后缀）
 * @param {object} [fallbackDict]
 * @param {string} [defaultValue]
 * @returns {string}
 */
export function preferZh(payload, field, fallbackDict = {}, defaultValue = '') {
  if (!payload || typeof payload !== 'object') {
    return defaultValue;
  }
  const zhValue = payload[`${field}_zh`];
  if (zhValue) {
    return String(zhValue);
  }
  const rawValue = payload[field];
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return defaultValue;
  }
  const raw = String(rawValue);
  return fallbackDict[raw] || raw;
}

/**
 * 列表版：例如 ``supporting_archives`` / ``redundancy_clusters`` 这类
 * 字段，优先取 ``${field}_zh`` 数组，否则用 fallback 词典对原数组逐项翻译。
 *
 * @param {object} payload
 * @param {string} field
 * @param {object} [fallbackDict]
 * @returns {string[]}
 */
export function preferZhList(payload, field, fallbackDict = {}) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const zhList = payload[`${field}_zh`];
  if (Array.isArray(zhList) && zhList.length) {
    return zhList.map((t) => (t === null || t === undefined ? '' : String(t)));
  }
  const rawList = payload[field];
  if (!Array.isArray(rawList)) {
    return [];
  }
  return rawList.map((t) => {
    const raw = String(t || '');
    return fallbackDict[raw] || raw;
  });
}
