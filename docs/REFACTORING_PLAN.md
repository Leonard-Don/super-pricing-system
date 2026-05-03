# 重构计划 · 当前大文件收敛指南

本文档记录 `main` 上的真实结构。最近一轮（截至 2026-05-03）已经把 7 项历史
热点中的 6 项收敛到目标行数以内；只剩 `researchTaskSignals.js` 这一处真正
意义上的"大文件"待动。

> 原则：先锁测试，再做零行为变更位移；每次只拆一个清晰边界，避免在拆分里顺手改业务规则。

---

## 当前状态（2026-05-03 复核）

| 优先级 | 路径 | 计划行数 | 实际行数 | 状态 |
|---|---:|---:|---:|---|
| **P1** | **`frontend/src/utils/researchTaskSignals.js`** | 1716 | **1716** | **唯一未动**：按 signal family 拆文件，保留 `buildResearchTaskRefreshSignals` barrel export |
| ✅ | `frontend/src/components/CrossMarketBacktestPanel.js` | 2847 | **983** | 达成 ≤1200 行目标；可选继续抽结果区子组件 |
| ✅ | `frontend/src/components/ResearchWorkbench.js` | 2250 | **1126** | 已减半；可选继续把 brief/send/history 状态机下沉到 hook |
| ✅ | `src/data/providers/sina_ths_adapter/_adapter.py` | 1815 | **690** | client.py / cache.py / parsers.py 已拆出 |
| ✅ | `backend/app/api/v1/endpoints/industry/routes.py` | 1251 | **430** | 已收敛 |
| ✅ | `backend/app/api/v1/endpoints/industry/_helpers.py` | 1245 | **304** | 已收敛 |
| ✅ | `backend/app/core/persistence/_manager.py` | 1101 | **242** | 已收敛 |

### 后端潜在新热点（参考，未列入 v4.2.0）

> 下列文件并非历史遗留巨型单文件，但已超 700 行，下一阶段评估时可纳入。

- `backend/app/api/v1/endpoints/analysis/routes.py` — 921 行
- `backend/app/api/v1/endpoints/infrastructure.py` — 818 行
- `backend/app/api/v1/endpoints/macro_quality/_summaries.py` — 786 行

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

## 下一阶段拆分顺序

1. `researchTaskSignals.js`（唯一剩余的 P1）
   - 按 signal family 拆：macro / bias / people / structural / tradeThesis / priority。
   - 顶层只保留 `buildResearchTaskRefreshSignals` 的 barrel export。
   - 验收：`frontend/src/__tests__/research-task-signals.test.js` 不改断言即通过。
   - 受 ≤600 行 diff 上限约束，拆 2–3 个 PR。

2. （可选）`backend/app/api/v1/endpoints/analysis/routes.py` 等 700+ 行后端入口
   - 按 endpoint 簇下沉到 service 层，路由层只保留参数校验与 response 包装。
   - 验收：OpenAPI path/schema diff 只允许顺序变化，不允许契约字段变化。

3. （可选）`CrossMarketBacktestPanel.js` / `ResearchWorkbench.js` 进一步精简
   - 已达 ≤1200 行目标，仅在新增功能时顺手抽，不强推独立 PR。

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
