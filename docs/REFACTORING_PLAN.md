# 重构计划 · 当前大文件收敛指南

**v4.2.0 已收尾（2026-05-05）**：原始 7 项 hot-spot + 3 项 endpoint 层
god-module + 4 个 package `__init__` 死 re-export 全部清理；同步完成多轮死代码
扫荡（5 个废 strategy/util 模块、4 个废 frontend orphan 目录、14 个废端点 +
配套测试与 service helper、`scripts/` 中 2 个 scratch 文件）。
**整个仓库当前没有拆分层面的高优先级技术债。**

质量门基线已对齐 CI 实测值：mypy 150（v4.2.0 起 342 → phase 1 后续清到 150）、
ruff pyflakes 177（原 181 → 177），未来 regressions 直接失败。

> 原则：先锁测试，再做零行为变更位移；每次只拆一个清晰边界，避免在拆分里顺手改业务规则。

---

## 当前状态（2026-05-05 复核 / v4.2.0 全收尾）

### v4.2.0 原始 7 项 hot-spots — 全部完成

| 路径 | 计划行数 | 实际行数 | 状态 |
|---|---:|---:|---|
| `frontend/src/utils/researchTaskSignals.js` | 1716 | **661** | ✅ 拆为 8 个文件（taskExtractors + 7 个 family 模块） |
| `frontend/src/components/CrossMarketBacktestPanel.js` | 2847 | **983** | ✅ 达成 ≤1200 行目标 |
| `frontend/src/components/ResearchWorkbench.js` | 2250 | **1126** | ✅ 已减半 |
| `src/data/providers/sina_ths_adapter/_adapter.py` | 1815 | **690** | ✅ client.py / cache.py / parsers.py 已拆出 |
| `backend/app/api/v1/endpoints/industry/routes.py` | 1251 | **290** | ✅ 已收敛（删 7 个 orphan endpoint 后） |
| `backend/app/api/v1/endpoints/industry/_helpers.py` | 1245 | **298** | ✅ 已收敛 |
| `backend/app/core/persistence/_manager.py` | 1101 | **242** | ✅ 已收敛 |

### endpoint 层 god-module 二次清理 — 全部完成

| 路径 | 起始 | 当前 | 拆分情况 |
|---|---:|---:|---|
| `backend/app/api/v1/endpoints/analysis/routes.py` | 921 | **325** | ✅ 4 个 sub-router：ml_prediction / sentiment / correlation / risk_and_peers |
| `backend/app/api/v1/endpoints/infrastructure/routes.py` | 818（曾 flat file） | **321** | ✅ 转 package + 2 个 sub-router：auth_routes / persistence_routes |
| `backend/app/api/v1/endpoints/macro_quality/_summaries.py` | 786 | **388** | ✅ 抽出 _confidence (190) + _source_summaries (231) |

---

## 已完成的主问题

- `backend/app/core/auth/` 已由旧 `auth.py` 拆为 package，并加入生产环境
  `AUTH_SECRET` 守卫。
- `src/settings/api.py` 已实现环境感知 CORS 解析，生产环境不会默认放行 localhost，
  也不会接受 `*` 与凭证模式的危险组合。
- `backend/app/api/v1/endpoints/backtest/` 已完成第一轮拆分，最大文件约 500 行。
- `frontend/src/services/api.js` 已缩为兼容 re-export，真实 API helper 已落到
  `frontend/src/services/api/*`。
- `src/data/providers/sina_ths_adapter/_normalizers.py` 已承接纯 normalization helper，
  `SinaIndustryAdapter._xxx` 调用方式保持兼容。
- `scripts/start_system.sh` / `scripts/stop_system.sh` 已支持进程树清理，并在停止后复查
  `3100/8100` 上是否仍有本项目监听进程。
- OpenAPI、Markdown API Reference、Postman collection 的认证描述已与当前安全行为对齐。
- `super-pricing-system` 的可见入口已收回到 `pricing / godsEye / workbench / quantlab`；
  `BacktestDashboard.js`、`RealTimePanel.js`、`IndustryDashboard.js` 以及公开回测工作台遗留的
  `StrategyForm.js`、`ResultsDisplay.js`、`BacktestHistory.js`、`AdvancedBacktestLab.js`、
  `StrategyComparison.js` 等页面/图表壳已移除。
  后续继续移除了公开实时看盘、交易面板、市场分析和行业热力图的 orphan 前端壳，包括
  `TradePanel.js`、`RealtimeStockDetailModal.js`、`MarketAnalysis.js`、`AIPredictionPanel.js`、
  `IndustryHeatmap.js` 及其子组件/本地 WebSocket 服务。
  回测、实时、行业相关底层代码只作为 Quant Lab、cross-market、历史快照和本地验证的内部支撑继续存在。

---

## 后续可选切片（diminishing returns，不强推独立 PR）

所有现存文件都在 600 行软上限之下，下面的切片只在新增功能或附带性维护时顺手做。

1. `analysis/routes.py`（325 行）— 趋势核心簇（analyze / comprehensive /
   overview / fundamental，共 ~180 行）可抽 `trend_core.py`。剩 `klines /
   volume-price / technical-indicators` 留在 `routes.py`。

2. `infrastructure/routes.py`（321 行）— 剩 5 个簇：tasks(4) /
   config-versions(4) / notifications(3) / status(1) / rate-limits(1)。
   config-versions 簇逻辑最重，可优先抽。

3. `macro_quality/_summaries.py`（388 行）— 已经分纯主题，无明显边界可继续拆。

4. `CrossMarketBacktestPanel.js`（983）/ `ResearchWorkbench.js`（1126）—
   已达 ≤1200 行目标，仅在新增功能时顺手抽。

---

## 不要做的事

- 不要在没有测试的前提下做语义重构。
- 不要在拆分提交里同时改推荐分数、诊断阈值、认证策略或 CORS 策略。
- 不要为了消除重复抽出过早抽象；重复先保留，等第三处出现后再提公共层。
- 不要一次合并超过约 600 行的纯拆分 diff，除非只是生成文档或 barrel export。

---

## 推荐验证

- 后端安全/配置：`python3 -m pytest tests/unit/test_auth_secret_guard.py tests/unit/test_cors_settings.py -q`
- Sina/THS 适配器：`python3 -m pytest tests/unit/test_sina_ths_adapter.py -q`
- 前端结构拆分：对应组件 Jest 子集，然后 `npm run build`
- 全面浏览器回归：`npm run verify:current-app`
- 停服校验：`./scripts/stop_system.sh` 后检查 `lsof -nP -iTCP:3100 -sTCP:LISTEN` 与
  `lsof -nP -iTCP:8100 -sTCP:LISTEN`
