import dayjs from '../../utils/dayjs';

/**
 * 跨市场回测面板的静态常量与默认值。
 *
 * 抽离原因：原 CrossMarketBacktestPanel.js 单文件 3165 行，常量和默认值占了
 * line 70-103；让常量与组件解耦后，可独立 import / mock。
 */

export const ASSET_CLASS_OPTIONS = [
  { value: 'US_STOCK', label: '美股' },
  { value: 'ETF', label: 'ETF 基金' },
  { value: 'COMMODITY_FUTURES', label: '商品期货' },
];

export const ASSET_CLASS_LABELS = Object.fromEntries(
  ASSET_CLASS_OPTIONS.map((option) => [option.value, option.label])
);

export const CONSTRUCTION_MODE_LABELS = {
  equal_weight: '等权配置',
  ols_hedge: '滚动 OLS 对冲',
};

// 注意：这两个值在模块加载时计算一次。若调用方需要"今天"语义最新值，请在
// 渲染时重新计算 `dayjs().format(...)`。
export const DEFAULT_CROSS_MARKET_START_DATE = dayjs().subtract(1, 'year').format('YYYY-MM-DD');
export const DEFAULT_CROSS_MARKET_END_DATE = dayjs().format('YYYY-MM-DD');

export const DEFAULT_PARAMETERS = {
  lookback: 20,
  entry_threshold: 1.5,
  exit_threshold: 0.5,
};

export const DEFAULT_QUALITY = {
  construction_mode: 'equal_weight',
  min_history_days: 60,
  min_overlap_ratio: 0.7,
};

export const DEFAULT_CONSTRAINTS = {
  max_single_weight: null,
  min_single_weight: null,
};

export const createAsset = (side, index) => ({
  key: `${side}-${index}-${Date.now()}`,
  side,
  symbol: '',
  asset_class: 'ETF',
  weight: null,
});

export const normalizeAssets = (assets, side) =>
  assets
    .filter((asset) => asset.side === side)
    .map((asset) => ({
      ...asset,
      symbol: (asset.symbol || '').trim().toUpperCase(),
    }));
