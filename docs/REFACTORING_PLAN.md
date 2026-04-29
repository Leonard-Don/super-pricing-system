# 重构计划 · 巨型文件拆分指南

本文档列出当前仓库中**单文件 ≥1500 行**的"应用级文件"，给出可执行的拆分目标、策略与验收。

> 原则：**任何拆分先有测试，再动刀**；先做"零行为变更"的纯位移，再在小步内做收敛。

---

## 优先级总览

| 顺序 | 路径 | 当前行数 | 痛点 | 工作量 | 收益 |
|---|---|---|---|---|---|
| P1 | `backend/app/api/v1/endpoints/industry.py` | 2464 | 路由 + 业务 + 数据整形混杂 | M（3-5 天）| 高 |
| P1 | `backend/app/api/v1/endpoints/backtest.py` | 1998 | 同上 | M | 高 |
| P1 | `frontend/src/components/CrossMarketBacktestPanel.js` | 3165 | 组件 + 状态机 + 渲染 + 业务规则 | L（5-8 天）| 高 |
| P2 | `frontend/src/components/RealTimePanel.js` | 2942 | 行情面板 god component | L | 高 |
| P2 | `src/data/providers/sina_ths_adapter.py` | 2075 | 抓取 + 解析 + 缓存 + 容错 | M | 中 |
| P2 | `frontend/src/components/MarketAnalysis.js` | 2629 | 多面板单组件 | L | 中 |
| P3 | `backend/app/api/v1/endpoints/analysis.py` | 1366 | 路由 + 业务 | S | 中 |
| P3 | `backend/app/api/v1/endpoints/macro_quality.py` | 1306 | 路由 + 业务 | S | 中 |
| P3 | `backend/app/core/persistence.py` | 1287 | 多 record 类型 + 序列化 | M | 中 |
| P3 | `backend/app/core/auth.py` | 1154 | OAuth + JWT + 用户 + Policy | M | 中 |
| P3 | `frontend/src/services/api.js` | 1303 | 全域 API 客户端 | M | 中 |

S=≤2 天 · M=3-5 天 · L=5-8 天

---

## 通用拆分策略（适用所有 P1-P3）

1. **冻结公共契约**：在动手前，把当前文件的"对外导出"列出来（公共函数/路由/组件 props），形成契约清单。
2. **写"位移测试"**：对每一个对外契约写或核对一个测试用例（happy path 即可），确保位移过程行为不变。
3. **平移而非重写**：第一阶段只把代码块挪到新文件，**不改任何内部实现**。新文件原样 import 旧依赖。
4. **小批量提交**：每次拆出一个完整子模块就提交一次（不超过 ~400 行迁移），便于回滚。
5. **删除原文件中的死代码**：仅在所有引用迁移完成后再删，避免循环依赖。
6. **再做语义重构**：所有平移完成、CI 全绿后，再做内部 API 优化、类型补全、抽象提取。

---

## P1-A · `backend/app/api/v1/endpoints/industry.py`（2464 行）

### 目标结构

```
backend/app/
├── api/v1/endpoints/industry/
│   ├── __init__.py            # 仅 re-export router（保持 import 路径不变）
│   ├── router.py              # 仅 FastAPI 路由声明 + Depends + 入参校验
│   ├── heatmap.py             # 热力图相关 endpoint handler
│   ├── ranking.py             # 排名 / 龙头股 endpoint handler
│   ├── trend.py               # 趋势 endpoint handler
│   └── rotation.py            # 行业轮动 endpoint handler
└── services/industry/
    ├── __init__.py
    ├── heatmap_service.py     # 业务编排
    ├── ranking_service.py
    ├── trend_service.py
    └── transformers.py        # DataFrame → response schema 转换
```

### 步骤

1. 把所有 `def *_endpoint(...)` 中的业务逻辑下沉到 `services/industry/*.py`，endpoint 层只剩"取参数 → 调 service → 包装响应"。
2. 把 `industry.py` 改名为目录 + `__init__.py` 只 re-export `router`，保留 `from backend.app.api.v1.endpoints.industry import router` 兼容。
3. 单测从 `tests/unit/test_industry_analyzer*.py` 增补对 service 层的直接调用，逐步替换原 endpoint 测试。

### 验收

- 行数：单文件 ≤ 500
- pytest 全绿
- `/industry/*` 路由 OpenAPI schema 与拆分前一致（用 `docs/openapi.json` diff）

---

## P1-B · `backend/app/api/v1/endpoints/backtest.py`（1998 行）

同 P1-A 的策略：

```
endpoints/backtest/
├── __init__.py
├── router.py
├── single_asset.py        # 单标的回测
├── portfolio.py           # 组合回测
├── batch.py               # 批量回测
├── walk_forward.py        # Walk-Forward
└── reports.py             # 回测报告生成
services/backtest/
├── __init__.py
├── single_asset_service.py
├── portfolio_service.py
├── batch_service.py
├── walk_forward_service.py
└── report_normalizer.py   # 复用 tests/unit/test_backtest_report_normalization.py 的契约
```

测试对照：`test_backtest_history.py`、`test_backtester.py`、`test_batch_backtester.py`、`test_portfolio_backtester.py` 已存在，可直接锁住契约。

---

## P1-C · `frontend/src/components/CrossMarketBacktestPanel.js`（3165 行）

### 目标结构

```
frontend/src/features/cross-market-backtest/
├── CrossMarketBacktestPanel.jsx        # 仅 ≤ 200 行的容器组件
├── components/
│   ├── TemplateSelector.jsx
│   ├── ParameterForm.jsx
│   ├── ResultSummary.jsx
│   ├── ResultsTable.jsx
│   ├── DiagnosticsTabs.jsx
│   └── DeepLinkBar.jsx
├── hooks/
│   ├── useCrossMarketTemplates.js
│   ├── useBacktestRunner.js
│   ├── useBacktestResultStore.js
│   └── useDeepLinkState.js
├── state/
│   ├── reducer.js                       # 把组件内的多 useState 合并为 useReducer
│   └── selectors.js
├── api/
│   └── crossMarketApi.js                # 从 services/api.js 抽出
└── __tests__/
    ├── reducer.test.js
    ├── useBacktestRunner.test.js
    └── CrossMarketBacktestPanel.test.jsx
```

### 步骤

1. **先抽 hooks**：useEffect/useCallback 串成的 ~10 个状态机移到 `hooks/`，不动 JSX。
2. **抽 reducer**：把零散的 `setState` 合并到 `state/reducer.js`，组件内只 dispatch。
3. **抽子组件**：JSX 按"卡片/区块"边界拆出，props 接 reducer state 切片。
4. **抽 API 层**：相关 axios 调用从 `services/api.js` 切到 `api/crossMarketApi.js`。

### 验收

- 主容器 ≤ 250 行
- 所有子组件单文件 ≤ 400 行
- 现有 `__tests__/cross-market-backtest-panel.test.js` 不需修改即通过

---

## P2-A · `frontend/src/components/RealTimePanel.js`（2942 行）

已经有现成的 hooks 拆分基础（`useRealtimeFeed`、`useRealtimeDerivedState`、`useRealtimeDiagnostics`、`useRealtimeJournal`、`useRealtimeMetadata`、`useRealtimePreferences`），说明作者已经在做这个工作。

剩下的活：

1. 把 `RealTimePanel.js` 内剩余 JSX 按"行情列表 / K线 / 详情抽屉 / 告警 / 日志"拆为 `components/realtime/*` 下子组件。
2. 主组件改为纯组合器（hooks → context provider → 子组件渲染）。

---

## P2-B · `src/data/providers/sina_ths_adapter.py`（2075 行）

### 目标结构

```
src/data/providers/sina_ths/
├── __init__.py               # 暴露 SinaThsAdapter
├── adapter.py                # 高层接口（保持原 API 不变）
├── client.py                 # HTTP/会话 / 重试 / 限流
├── parsers/
│   ├── quote.py              # 行情解析
│   ├── orderbook.py
│   ├── intraday.py
│   └── industry.py
├── normalizers.py            # 列名统一、日期/时区
└── cache.py                  # 缓存键 / TTL 策略
```

测试对照：`tests/unit/test_sina_ths_adapter.py`（1115 行）已经在锁契约。

---

## P3 · 其他（共性原则）

- `analysis.py` / `macro_quality.py`：与 P1 相同模式，路由层 ≤ 300 行，业务下沉到 `services/`。
- `persistence.py`：按 record 类型拆为独立 repository 模块（`auth_repository.py`、`workbench_repository.py` 等），核心保留事务/序列化。
- `auth.py`：`oauth.py` / `jwt_tokens.py` / `users.py` / `policy.py` 四件套，`auth.py` 仅做对外 facade。
- `services/api.js`：按 4 大工作区拆出 `services/api/{pricing,godEye,workbench,quantLab}.js`，原 `api.js` re-export 保兼容。

---

## 不要做的事

- ❌ 不要在没有测试的前提下做"语义重构"。
- ❌ 不要在拆分 PR 里同时改业务规则。
- ❌ 不要为了消除重复抽出过早抽象（例如把两个长得像的 endpoint 抽成"通用 endpoint"——通常事后会变得更难维护）。
- ❌ 不要一次合并 1000+ 行的拆分 PR；每个 PR 控制在 ≤ 600 行 diff。

---

## 跟踪

每个 P1/P2 拆分项建议在仓库 issue 跟踪：

- 标题：`refactor(<scope>): split <file>`
- 标签：`refactor`、`tech-debt`、`P1|P2|P3`
- 验收清单：行数 ≤ 目标、CI 全绿、OpenAPI/快照 diff 为空、引用方未需修改。
