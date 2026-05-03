# 重构计划 · 当前大文件收敛指南

本文档记录 `main` 在 2026-04-29 合并安全与拆分工作后的真实结构。此前的
`industry.py`、`backtest.py`、`auth.py`、`services/api.js` 巨型单文件已经完成第一轮
物理拆分；后续重构应基于下面的当前热点继续小步推进。

> 原则：先锁测试，再做零行为变更位移；每次只拆一个清晰边界，避免在拆分里顺手改业务规则。

---

## 当前状态

| 优先级 | 路径 | 当前行数 | 状态 | 下一步 |
|---|---:|---:|---|---|
| P1 | `frontend/src/components/CrossMarketBacktestPanel.js` | 2847 | 已拆出 `cross-market/panelConstants.js`、`panelHelpers.js`、诊断/篮子卡片 | 抽 `hooks/useCrossMarketBacktestState.js` 与结果区子组件 |
| P2 | `frontend/src/components/ResearchWorkbench.js` | 2250 | 已有 `research-workbench/*` 支撑模块 | 继续把 brief/send/history 状态机下沉到 hook |
| P2 | `src/data/providers/sina_ths_adapter/_adapter.py` | 1815 | 已拆出 constants/mappers/normalizers | 下一步拆 HTTP client、cache、parsers |
| P2 | `frontend/src/utils/researchTaskSignals.js` | 1716 | 规则与文案混杂 | 按 signal family 拆文件并保留 barrel export |
| P3 | `backend/app/api/v1/endpoints/industry/routes.py` | 1251 | 已从单文件拆成 package，但 route 仍偏重 | route 只做入参和 response，业务下沉 service |
| P3 | `backend/app/api/v1/endpoints/industry/_helpers.py` | 1245 | helper 边界过宽 | 按 heatmap/ranking/trend 拆 helpers |
| P3 | `backend/app/core/persistence/_manager.py` | 1101 | 已从 `persistence.py` 拆出，但 manager 仍聚合多 record 类型 | 按 auth/workbench/backtest record 拆 repository |

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

1. `CrossMarketBacktestPanel.js`
   - 先抽状态与副作用：模板加载、运行回测、保存任务、刷新信号。
   - 再抽结果区 JSX：摘要、表格、诊断、研究剧本入口。
   - 验收：主组件 ≤ 1200 行，现有跨市场测试不改断言即通过。

2. `sina_ths_adapter/_adapter.py`
   - 拆 `client.py`：HTTP session、重试、限流。
   - 拆 `cache.py`：symbol/history/market-cap snapshot cache。
   - 拆 `parsers.py`：Sina/THS 原始响应解析。
   - 验收：`tests/unit/test_sina_ths_adapter.py` 全绿，行业热度浏览器路径不降级。

3. `industry/routes.py` 与 `_helpers.py`
   - 按 heatmap/ranking/trend/rotation 拆 service。
   - 路由文件只保留 FastAPI decorator、参数校验、response 包装。
   - 验收：OpenAPI path/schema diff 只允许顺序变化，不允许契约字段变化。

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
