/**
 * Aggregator entry point — preserves the historical public surface of `services/api.js`
 * after splitting it into per-domain modules under `services/api/`.
 *
 * 历史组件、hook 和测试曾经大量从 `services/api` 直接 import 命名 / 默认 export。
 * 拆分后保持这一接口完全不变：
 *   - 默认 export 仍然是 axios 实例 `api`
 *   - 全部命名 export 从领域模块 re-export
 *
 * 新代码推荐直接从领域模块 import，例如：
 *   import { runStrategyOptimizer } from 'services/api/quantLab'
 * backtest / realtime / industry 在本仓属于内部支撑兼容面；
 * 面向使用者的公开工作台已拆到 `quant-trading-system`。
 */

import api from './api/core';

// Core helpers（token cache、timeout profile、axios 实例本体）
export {
  api,
  API_BASE_URL,
  API_TIMEOUT,
  API_TIMEOUT_PROFILES,
  getApiAuthToken,
  getApiRefreshToken,
  setApiAuthToken,
  setApiRefreshToken,
  withTimeoutProfile,
} from './api/core';

// 业务领域 — 每个文件聚焦一个路由前缀
export * from './api/altDataAndMacro';
export * from './api/analysis';
export * from './api/backtest';
export * from './api/crossMarket';
export * from './api/industry';
export * from './api/infrastructure';
export * from './api/pricing';
export * from './api/quantLab';
export * from './api/realtime';
export * from './api/research';

export default api;
