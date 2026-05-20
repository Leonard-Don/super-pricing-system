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
 *   import { runQuantValuationLab } from 'services/api/quantLab'
 * 策略回测 / 实时行情 / 行业热度的使用者入口已迁移到 `quant-trading-system`。
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
export * from './api/crossMarket';
export * from './api/infrastructure';
export * from './api/pricing';
export * from './api/quantLab';
export * from './api/research';

export default api;
