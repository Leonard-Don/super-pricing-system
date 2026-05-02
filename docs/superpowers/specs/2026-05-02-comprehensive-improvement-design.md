# Super Pricing System · 全面改善设计文档

**日期**：2026-05-02  
**版本**：v4.1.0 → v4.2.0（目标）  
**范围**：CI 质量门禁升级 + 后端结构重组 + 前端大文件拆分  
**验证级别**：严格合约（OpenAPI diff 零破坏 + Playwright E2E 全通）

---

## 背景与目标

super-pricing-system 是一个面向 A 股宏观错误定价分析的量化研究平台，当前 v4.1.0。
已有 REFACTORING_PLAN.md 记录了已知热点，本次改善在此基础上系统推进：

1. 先搭保护网（CI 门禁），再做结构重组，避免无保护状态下的大范围改动
2. 后端按职责拆 repository 和 service，消除超千行文件
3. 前端按 REFACTORING_PLAN P1→P2 顺序拆巨型组件

---

## Layer 1：CI 质量门禁升级

### 1.1 requirements 精确 pin

**问题**：`requirements.txt` 使用范围版本（`>=X,<Y`），不同时间安装结果不同。  
**方案**：用 `pip-compile`（pip-tools）生成 `requirements.lock`，包含所有直接和传递依赖的精确版本。CI 改用 `pip install -r requirements.lock`。  
**开发工作流**：`requirements.txt` 仍作为人工维护的"意图文件"，`requirements.lock` 由工具生成，不手工编辑。

### 1.2 mypy：advisory → 增量 gate

**问题**：mypy 在 CI 里 `continue-on-error: true`，类型错误不阻断合并。  
**方案**：
- 跑 `mypy backend src --ignore-missing-imports` 建立当前错误基线，存入 `scripts/mypy_baseline_count.txt`
- CI 新增步骤：`mypy --ignore-missing-imports 2>&1 | wc -l`，若超过基线则 exit 1
- 这样不要求一次清零历史债，但阻止退化

### 1.3 coverage 阈值

**问题**：CI 产出 coverage.xml 但无最低阈值，覆盖率可以悄悄下降。  
**方案**：`pyproject.toml` 加 `[tool.coverage.report] fail_under = 60`，作为起点。

### 1.5 check_openapi_diff.py（新脚本）

**问题**：Layer 2 验收需要 OpenAPI 契约 diff 检查，但该脚本不存在。  
**方案**：在 Layer 1 阶段创建 `scripts/check_openapi_diff.py`：
- 读取 `docs/openapi.json` 作为基线
- 调用 FastAPI 的 `/openapi.json` 端点获取当前 schema
- 对比所有 path 的 requestBody/responses 字段，报告破坏性变更（字段删除、类型变更、required 新增）
- 正常退出 code 0，有破坏性变更则 exit 1 并打印 diff

### 1.4 CLAUDE.md

**问题**：项目无 CLAUDE.md，AI 助手每次进入需重新探索。  
**内容**：
- 项目定位与四大工作区说明
- 目录结构（backend/ src/ frontend/ tests/ scripts/ docs/）
- 启动命令（`./scripts/start_system.sh`）
- 测试命令（pytest、Jest、Playwright）
- 重构原则（来自 REFACTORING_PLAN.md）
- CI 各 job 说明与验证命令

### 验收标准
- `pip install -r requirements.lock` 在干净 venv 可重现
- mypy 新增错误时 CI exit 1，现有错误通过
- coverage < 60% 时 CI exit 1
- CLAUDE.md 存在且包含所有必要章节

---

## Layer 2：后端结构重组

原则：先锁测试，再做零行为变更位移。每步 OpenAPI diff 验证无破坏性变更。

### 2.1 persistence/_manager.py (1101 行) → 3 Repository

**现状**：单文件同时处理 auth、workbench、backtest 三类记录。  
**拆分**：
```
backend/app/core/persistence/
├── _manager.py          # 保留为薄 facade（向后兼容）
├── auth_repository.py   # OAuth token、session 记录
├── workbench_repository.py  # 研究任务持久化
└── backtest_repository.py   # 回测历史记录
```
**测试**：每个 repository 新增对应单元测试，覆盖 CRUD 核心路径。  
**验收**：`test_infrastructure_oauth_async.py` + `test_research_workbench_*.py` + `test_backtest_*.py` 全绿。

### 2.2 industry/routes.py + _helpers.py → Service 层

**现状**：路由文件（1251 行）承担业务逻辑，helper（1245 行）边界过宽。  
**拆分**：
```
backend/app/api/v1/endpoints/industry/
├── routes.py            # 只保留 decorator、参数校验、response 包装（目标 ≤400 行）
├── _helpers.py          # 保留为兼容层，逐步清空
├── heatmap_service.py   # 热力图业务逻辑
├── ranking_service.py   # 行业排行业务逻辑
├── trend_service.py     # 趋势分析业务逻辑
└── rotation_service.py  # 轮动分析业务逻辑
```
**OpenAPI 契约**：拆分后运行 `python scripts/check_openapi_diff.py`，字段不允许破坏性变更（rename/remove/type change）。  
**验收**：`test_industry_*.py` 全绿，OpenAPI diff 无破坏性变更。

### 2.3 sina_ths_adapter/_adapter.py (1815 行) → 3 模块

**现状**：HTTP、缓存、解析逻辑混杂在单文件。  
**拆分**：
```
src/data/providers/sina_ths_adapter/
├── _adapter.py      # 组装入口（保留，现有调用方零感知）
├── client.py        # HTTP session、重试、限流
├── cache.py         # symbol/history/market-cap 快照缓存
└── parsers.py       # Sina/THS 原始响应解析
```
**验收**：`test_sina_ths_adapter.py` 全绿，行业热度浏览器路径不降级。

---

## Layer 3：前端大文件拆分

原则：每次只拆一个组件，拆后 Jest + build + Playwright 全绿再进行下一个。

### P1：CrossMarketBacktestPanel.js (2847 行)

**拆分**：
```
frontend/src/components/cross-market/
├── CrossMarketBacktestPanel.js      # 主组件（目标 ≤1200 行）
├── hooks/
│   └── useCrossMarketBacktestState.js  # 模板加载、运行、保存、刷新信号
└── results/
    ├── ResultSummary.js
    ├── ResultTable.js
    ├── DiagnosticPanel.js
    └── PlaybookEntryPoint.js
```
**验收**：主组件 ≤1200 行，跨市场 Jest 测试不改断言即通过，Playwright E2E 通过。

### P1：RealTimePanel.js (2730 行)

**拆分**：
```
frontend/src/components/realtime/
├── RealTimePanel.js                 # 主组件（目标 ≤1500 行）
├── RealTimeSearchControl.js         # 顶部搜索/控制区
├── RealTimeMonitorGroup.js          # 监控组合管理区
└── RealTimeDetailDrawer.js          # 懒加载抽屉编排区
```
**验收**：主组件 ≤1500 行，realtime Jest + Playwright 通过。

### P2：MarketAnalysis.js (2629 行)

**拆分**：
- `hooks/useMarketAnalysisData.js` — 数据加载与缓存
- 各分析区块子组件（按现有 section 边界拆）

### P2：ResearchWorkbench.js (2250 行)

**拆分**：
- `hooks/useResearchWorkbenchState.js` — brief/send/history 状态机
- 对话区、历史区、发送区子组件

### P2：IndustryHeatmap.js (1967 行)

**拆分**：
- `hooks/useIndustryHeatmapFilter.js` — 筛选状态
- `IndustryHeatmapChart.js` — 图表渲染

---

## 完整验收链

```bash
# Layer 1 验收
pip install -r requirements.lock        # 可重现安装
pytest --cov --cov-fail-under=60 -q    # 覆盖率门禁
mypy backend src --ignore-missing-imports  # 新错误数 = 0

# Layer 2 验收（每个子任务后）
pytest tests/unit tests/integration -q
python scripts/check_openapi_diff.py    # 零破坏性变更

# Layer 3 验收（每个组件拆分后）
cd frontend && CI=1 npm test -- --watchAll=false
npm run build
cd tests/e2e && npm run verify:research
```

---

## 不做的事

- 不在拆分提交里改业务规则、推荐分数、诊断阈值
- 不为消除重复抽过早抽象（等第三处出现后再提公共层）
- 不一次合并超过 600 行的纯拆分 diff
- 不改 OpenAPI 接口的字段名、类型、必选/可选属性

---

## 文件变更预览

| 层 | 新增/修改文件 | 行数变化 |
|---|---|---|
| L1 | requirements.lock（新）、CLAUDE.md（新）、pyproject.toml、.github/workflows/ci.yml、scripts/mypy_baseline_count.txt（新）| +300 |
| L2 | auth/workbench/backtest_repository.py（新）、industry/*_service.py（新）、sina_ths_adapter/client/cache/parsers.py（新）、对应测试（新）| +800 |
| L3 | 10+ 新子组件/hook 文件，5 个主组件精简 | 净增 ~1000，主组件各减 1000-1600 行 |
