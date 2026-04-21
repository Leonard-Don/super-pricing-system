import { getSourceModeLabel } from '../../utils/pricingResearch';

const CROSS_MARKET_TEMPLATE_LABELS = {
  utilities_vs_growth: '公用事业防御 vs 成长 beta',
  copper_vs_semis: '铜价紧张 vs 半导体 beta',
  energy_vs_ai_apps: '能源基础设施 vs AI 应用热度',
  defensive_beta_hedge: '防御 beta 对冲',
  rates_pressure_vs_duration_tech: '利率压力 vs 长久期科技',
  dollar_squeeze_vs_china_beta: '美元挤压 vs 中国 beta',
  credit_stress_defensive_hedge: '信用压力防御对冲',
  people_decay_short_vs_cashflow_defensive: '组织衰败 vs 现金流防御',
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

export const getGodEyeTemplateLabel = (template = {}) => {
  const templateId = String(template?.id || '').trim();
  if (templateId && CROSS_MARKET_TEMPLATE_LABELS[templateId]) {
    return CROSS_MARKET_TEMPLATE_LABELS[templateId];
  }
  return template?.display_name || template?.displayName || template?.name || '等待模板信号汇聚';
};

export const getGodEyeExecutionPostureLabel = (posture = '') => {
  const normalized = String(posture || '').trim().toLowerCase();
  if (!normalized) {
    return '待确认';
  }
  return EXECUTION_POSTURE_LABELS[normalized] || String(posture || '').replace(/_/g, ' / ');
};

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
