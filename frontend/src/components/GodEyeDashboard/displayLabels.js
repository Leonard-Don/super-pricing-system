import { getSourceModeLabel } from '../../utils/pricingResearch';

const CROSS_MARKET_TEMPLATE_COPY = {
  utilities_vs_growth: {
    label: '公用事业防御 vs 成长 beta',
    theme: '政策脆弱防御 vs 成长 beta',
    description: '当政策摩擦升温而实体电力需求仍在上行时，受监管的公用事业更容易承接防御资金，成长 beta 则更容易被重估。',
  },
  copper_vs_semis: {
    label: '铜价紧张 vs 半导体 beta',
    theme: '实体瓶颈 vs 半导体 beta',
    description: '当铜库存收紧、贸易摩擦抬升时，上游实体稀缺性往往比已经透支乐观预期的半导体 beta 更占优。',
  },
  energy_vs_ai_apps: {
    label: '能源基础设施 vs AI 应用热度',
    theme: '基荷稀缺 vs AI 应用热度',
    description: '当电力瓶颈和基荷错配同步恶化时，能源底座通常比需求假设过于平滑的 AI 应用层更具韧性。',
  },
  defensive_beta_hedge: {
    label: '防御 beta 对冲',
    theme: '技术稀释与防御 beta 对冲',
    description: '用低波动公用事业篮子对冲广义科技 beta，并用滚动 OLS 动态校准仓位。',
  },
  rates_pressure_vs_duration_tech: {
    label: '利率压力 vs 长久期科技',
    theme: '实际利率压力 vs 长久期科技',
    description: '当利率曲线和信用压力一起重估久期时，长久期科技 beta 往往比短久期利率代理更脆弱。',
  },
  dollar_squeeze_vs_china_beta: {
    label: '美元挤压 vs 中国 beta',
    theme: '美元错配 vs 中国 beta',
    description: '当美元资金压力和政策执行噪声同步走高时，中国 beta 资产更容易落后于防御性的美元代理。',
  },
  credit_stress_defensive_hedge: {
    label: '信用压力防御对冲',
    theme: '信用利差压力 vs 脆弱 beta',
    description: '当信用利差走阔、领导层质量走弱时，稳定现金流防御资产通常优于高 beta 的融资敏感资产。',
  },
  people_decay_short_vs_cashflow_defensive: {
    label: '组织衰败 vs 现金流防御',
    theme: '组织衰败 vs 韧性现金流',
    description: '当人的维度脆弱、执行层稀释和来源退化同时升温时，做空脆弱成长 beta、配对稳定现金流防御更清晰。',
  },
};

const EXECUTION_POSTURE_LABELS = {
  defensive_spread: '防御价差',
  commodity_vs_growth: '商品对成长',
  physical_vs_narrative: '实体对叙事',
  ols_hedged_defensive: 'OLS 防御对冲',
  macro_rate_spread: '利率压力价差',
  fx_macro_spread: '汇率/宏观价差',
  defensive_credit_hedge: '信用防御对冲',
  people_fragility_pair: '人的维度脆弱对冲',
};

const STRUCTURAL_RADAR_LABELS = {
  stable: '稳定',
  decay_watch: '衰败观察',
  decay_alert: '结构衰败警报',
};

const STALENESS_LABELS = {
  fresh: '新鲜',
  stale: '轻微陈旧',
  delayed: '更新延迟',
  unknown: '未知',
};

const SOURCE_MODE_LABELS = {
  'official-led': '官方/披露主导',
  'fallback-heavy': '回退源偏多',
  mixed: '混合来源',
  curated: '精选源主导',
  proxy: '代理回退主导',
  official: '官方源主导',
};

const GOD_EYE_GROUP_LABELS = {
  'Supply Chain': '供应链',
  'Macro HF': '宏观高频',
};

const GOD_EYE_ANOMALY_TYPE_LABELS = {
  alert: '告警',
  hot: '升温',
  cold: '承压',
  neutral: '观察',
};

const GOD_EYE_TEXT_REPLACEMENTS = [
  [/official-led/gi, '官方/披露主导'],
  [/fallback-heavy/gi, '回退源偏多'],
  [/People-layer decay vs resilient cashflow/gi, '组织衰败 vs 韧性现金流'],
  [/Talent dilution and defensive beta hedge/gi, '技术稀释与防御 beta 对冲'],
  [/Low-beta utility basket hedged against broad tech beta with rolling OLS\./gi, '用低波动公用事业篮子对冲广义科技 beta，并用滚动 OLS 动态校准仓位。'],
  [/Short fragile-people-layer tech beta against stable cashflow defensives\./gi, '做空人的维度脆弱的科技 beta，并配对稳定现金流防御资产。'],
  [/\bpeople_decay_short\b/g, '组织衰败空头'],
  [/\bpeople_fragility\b/g, '人的维度脆弱'],
  [/\btech_dilution\b/g, '技术稀释'],
  [/\bsource_mode_summary\b/g, '来源治理'],
  [/\bdefensive_beta_repricing\b/g, '防御 beta 重估'],
  [/\bpolicy_fragility_defensive\b/g, '政策脆弱防御'],
  [/\bphysical_world_vs_ai_beta\b/g, '实体链路 vs AI beta'],
  [/\benergy_backbone_vs_ai_apps\b/g, '能源底座 vs AI 应用'],
  [/\brates_vs_duration\b/g, '利率 vs 久期'],
  [/\bdollar_strength_vs_china_beta\b/g, '美元强势 vs 中国 beta'],
  [/\bcredit_stress_defensive\b/g, '信用压力防御'],
  [/\bbaseload_capacity\b/g, '基荷能力'],
  [/\bbaseload_mismatch\b/g, '基荷错配'],
  [/\binventory_tightness\b/g, '库存紧张'],
  [/\btrade_flow\b/g, '贸易流向'],
  [/\bdepartment_chaos\b/g, '部门混乱'],
  [/\breversal_cluster\b/g, '反转共振'],
  [/\bprecursor_cluster\b/g, '前兆共振'],
  [/\bbullish_cluster\b/g, '正向共振'],
  [/\bbearish_cluster\b/g, '逆向共振'],
  [/\bfading_cluster\b/g, '衰减共振'],
  [/\bdegraded provider\b/gi, '退化数据源'],
  [/\bfragility=/gi, '脆弱度 '],
  [/\bscore(?=[\s=:]|$)/gi, '评分'],
  [/\bscale(?=[\s=:]|$)/gi, '强度'],
  [/\becb\b/gi, 'ECB'],
  [/\bfed\b/gi, 'FED'],
];

export const getGodEyeTemplateLabel = (template = {}) => {
  const templateId = String(template?.id || '').trim();
  if (templateId && CROSS_MARKET_TEMPLATE_COPY[templateId]?.label) {
    return CROSS_MARKET_TEMPLATE_COPY[templateId].label;
  }
  return localizeGodEyeText(template?.display_name || template?.displayName || template?.name || '等待模板信号汇聚');
};

export const getGodEyeExecutionPostureLabel = (posture = '') => {
  const normalized = String(posture || '').trim().toLowerCase();
  if (!normalized) {
    return '待确认';
  }
  return EXECUTION_POSTURE_LABELS[normalized] || String(posture || '').replace(/_/g, ' / ');
};

export const getGodEyeTemplateTheme = (template = {}) => {
  const templateId = String(template?.id || '').trim();
  if (templateId && CROSS_MARKET_TEMPLATE_COPY[templateId]?.theme) {
    return CROSS_MARKET_TEMPLATE_COPY[templateId].theme;
  }
  return localizeGodEyeText(template?.theme || '');
};

export const getGodEyeTemplateDescription = (template = {}) => {
  const templateId = String(template?.id || '').trim();
  if (templateId && CROSS_MARKET_TEMPLATE_COPY[templateId]?.description) {
    return CROSS_MARKET_TEMPLATE_COPY[templateId].description;
  }
  return localizeGodEyeText(template?.description || template?.narrative || '');
};

export const getGodEyeGroupLabel = (group = '') => (
  GOD_EYE_GROUP_LABELS[String(group || '').trim()] || String(group || '')
);

export const getGodEyeAnomalyTypeLabel = (type = '') => (
  GOD_EYE_ANOMALY_TYPE_LABELS[String(type || '').trim().toLowerCase()] || String(type || '')
);

export const getGodEyeStructuralRadarLabel = (radar = {}) => {
  const displayLabel = String(radar?.display_label || '').trim();
  if (displayLabel) {
    return displayLabel;
  }
  const normalized = String(radar?.label || '').trim().toLowerCase();
  if (normalized && STRUCTURAL_RADAR_LABELS[normalized]) {
    return STRUCTURAL_RADAR_LABELS[normalized];
  }
  return radar?.label || '稳定';
};

export const getGodEyeSourceModeLabel = (summary = {}) => {
  const raw = String(summary?.display_label || summary?.label || summary?.dominant || '').trim();
  if (!raw) {
    return getSourceModeLabel(summary);
  }

  const normalized = raw.toLowerCase();
  if (SOURCE_MODE_LABELS[normalized]) {
    return SOURCE_MODE_LABELS[normalized];
  }

  if (raw.includes('/')) {
    return raw
      .split('/')
      .map((item) => {
        const token = String(item || '').trim().toLowerCase();
        return SOURCE_MODE_LABELS[token] || String(item || '').trim();
      })
      .join(' / ');
  }

  return raw;
};

export const localizeGodEyeText = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  return GOD_EYE_TEXT_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    raw
  ).replace(/\s+\|\s+/g, ' ｜ ');
};

export const getGodEyeStalenessLabel = (staleness = {}) => {
  const normalized = String(staleness?.label || '').trim().toLowerCase();
  if (!normalized) {
    return '未知';
  }
  return STALENESS_LABELS[normalized] || staleness?.label || '未知';
};

export const formatGodEyeSnapshotTimestamp = (timestamp) => {
  const raw = String(timestamp || '').trim();
  if (!raw) {
    return {
      date: '未刷新',
      time: '',
      display: '未刷新',
    };
  }

  const normalized = raw.replace('T', ' ').replace(/Z$/, '').trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}:\d{2})(?:\.\d+)?)?/);
  if (match) {
    const date = String(match[1] || '').replace(/-/g, '/');
    const time = String(match[2] || '');
    return {
      date,
      time,
      display: time ? `${date} ${time}` : date,
    };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const date = parsed.toLocaleDateString('zh-CN');
    const time = parsed.toLocaleTimeString('zh-CN', { hour12: false });
    return {
      date,
      time,
      display: `${date} ${time}`,
    };
  }

  return {
    date: raw,
    time: '',
    display: raw,
  };
};
