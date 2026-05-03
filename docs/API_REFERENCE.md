# API参考文档

## 概述


    ## 宏观错误定价套利引擎

    ### 核心工作区
    - 💰 **定价研究**: CAPM / Fama-French 三因子 / DCF 估值 / Gap Analysis / 同行对比
    - 🛰️ **上帝视角 (GodEye)**: 宏观因子引擎 · 证据质量 · 政策雷达 · 结构性衰败 · 跨市场总览
    - 📂 **研究工作台**: 研究任务持久化 · 状态流转 · 深链重开 · 剧本联动
    - 🧪 **Quant Lab**: 参数优化 · 风险归因 · 估值历史 · 告警编排 · 数据质量诊断

    ### 私有系统支撑能力
    - 📊 **内部跨市场复盘**: 模板推荐 · 组合验证 · 执行诊断
    - 🔗 **另类数据**: 供应链 · 治理 · 人事 · 政策源 · 实体统一
    - 🔌 **共享运行时支撑**: 行情诊断、历史快照兼容与本地回归脚本
    - ⚡ **高性能后端**: 异步处理、缓存、诊断与健康检查

    ### API版本
    - **当前版本**: v4.1.0
    - **API版本**: v1
    - **最后更新**: 2026-04-22

    ### 认证
    研究与只读分析接口默认允许开发态匿名访问；认证、基础设施和管理类接口支持
    Bearer JWT、Refresh Token 与 X-API-Key。生产环境必须配置 `AUTH_SECRET`，
    CORS 仅放行显式配置的 `FRONTEND_URL` / `CORS_ORIGINS`。

    ### 限制
    - 请求频率: 100次/分钟
    - 数据范围: 最多5年历史数据
    - 并发实验: 最多10个


**版本**: 4.1.0

## 基础信息

- **基础URL**: `http://localhost:8100`
- **认证方式**: 开发态研究/只读接口可匿名访问；认证、基础设施和管理类接口支持 Bearer JWT / Refresh Token / X-API-Key，生产环境必须配置 `AUTH_SECRET`
- **数据格式**: JSON
- **字符编码**: UTF-8

## API端点

> 本文档只生成 `super-pricing-system` 的私有系统边界。公开研究仓主能力
> （`/backtest/*`、`/realtime/*`、`/industry/*`、`/trade/*` 等）在本仓
> 仅作为 Quant Lab、历史快照和本地验证的内部支撑路由保留，不进入
> OpenAPI/Postman 主文档。

### Asset Pricing Research

#### POST /pricing/factor-model

**Factor Model Analysis**

因子模型分析（CAPM + Fama-French 三因子）

返回 Alpha、Beta、因子暴露度、R² 等指标

**请求体: **

参考模型: `PricingRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /pricing/valuation

**Valuation Analysis**

内在价值估值分析（DCF + 可比估值法）

返回 DCF 估值、可比估值、公允价值区间

**请求体: **

参考模型: `ValuationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /pricing/valuation-sensitivity

**Valuation Sensitivity Analysis**

DCF 敏感性分析

允许覆盖折现率、增长率、终值增长率和估值权重，返回新的估值结果与敏感性矩阵。

**请求体: **

参考模型: `ValuationSensitivityRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /pricing/gap-analysis

**Gap Analysis**

定价差异分析（核心端点）

整合因子模型和估值模型，分析市价 vs 内在价值的偏差及驱动因素

**请求体: **

参考模型: `PricingRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /pricing/screener

**Pricing Screener**

定价候选池筛选

对一组标的运行定价差异分析，并按机会分排序返回。

**请求体: **

参考模型: `PricingScreenerRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /pricing/symbol-suggestions

**Pricing Symbol Suggestions**

股票代码/公司名搜索建议

**请求参数: **

- `q` （可选）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /pricing/gap-history

**Pricing Gap History**

历史偏差时间序列，用于观察均值回归和情绪演化。

**请求参数: **

- `symbol` （必需）: 无描述
- `period` （可选）: 无描述
- `points` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /pricing/peers

**Pricing Peer Comparison**

同行估值对比，优先从扩展研究股票池中选择更接近的同行。

**请求参数: **

- `symbol` （必需）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /pricing/benchmark-factors

**Get Benchmark Factors**

获取当前市场因子数据快照

返回最新的 Fama-French 三因子和市场指标

**响应: **

- **200**: Successful Response

---

### Alternative Data

#### GET /alt-data/snapshot

**另类数据作战快照**

**请求参数: **

- `refresh` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /alt-data/signals

**另类数据统一信号**

**请求参数: **

- `category` （可选）: 无描述
- `timeframe` （可选）: 无描述
- `refresh` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /alt-data/providers

**另类数据提供器状态**

**响应: **

- **200**: Successful Response

---

#### GET /alt-data/status

**另类数据治理状态**

**响应: **

- **200**: Successful Response

---

#### POST /alt-data/refresh

**手动刷新另类数据**

**请求参数: **

- `provider` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /alt-data/history

**另类数据历史记录**

**请求参数: **

- `category` （可选）: 无描述
- `timeframe` （可选）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /alt-data/diagnostics/signals

**另类数据信号命中率与衰减诊断**

**请求参数: **

- `category` （可选）: 无描述
- `timeframe` （可选）: 无描述
- `limit` （可选）: 无描述
- `half_life_days` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

### Macro Mispricing

#### GET /macro/overview

**宏观错误定价总览**

**请求参数: **

- `refresh` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /macro/history

**宏观错误定价历史**

**请求参数: **

- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /macro/factor-backtest

**宏观因子历史验证**

**请求参数: **

- `benchmark` （可选）: 用于验证宏观信号方向的市场基准
- `period` （可选）: 基准价格历史区间
- `horizons` （可选）: 逗号分隔的 forward-return 天数
- `limit` （可选）: 最多读取的宏观历史快照数量

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

### Cross Market

#### GET /cross-market/templates

**Get cross-market demo templates**

**响应: **

- **200**: Successful Response

---

#### POST /cross-market/backtest

**Run cross-market backtest**

**请求体: **

参考模型: `CrossMarketBacktestRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

### Research Workbench

#### GET /research-workbench/tasks

**获取研究工作台任务**

**请求参数: **

- `limit` （可选）: 无描述
- `type` （可选）: 无描述
- `status` （可选）: 无描述
- `source` （可选）: 无描述
- `view` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/tasks

**创建研究工作台任务**

**请求体: **

参考模型: `ResearchTaskCreateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/tasks/bulk-update

**批量更新研究工作台任务**

**请求体: **

参考模型: `ResearchTaskBulkUpdateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /research-workbench/tasks/{task_id}

**获取研究工作台任务详情**

**请求参数: **

- `task_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### PUT /research-workbench/tasks/{task_id}

**更新研究工作台任务**

**请求参数: **

- `task_id` （必需）: 无描述

**请求体: **

参考模型: `ResearchTaskUpdateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### DELETE /research-workbench/tasks/{task_id}

**删除研究工作台任务**

**请求参数: **

- `task_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /research-workbench/tasks/{task_id}/timeline

**获取研究任务时间线**

**请求参数: **

- `task_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/tasks/{task_id}/comments

**为研究任务添加评论**

**请求参数: **

- `task_id` （必需）: 无描述

**请求体: **

参考模型: `ResearchTaskCommentCreateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### DELETE /research-workbench/tasks/{task_id}/comments/{comment_id}

**删除研究任务评论**

**请求参数: **

- `task_id` （必需）: 无描述
- `comment_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/tasks/{task_id}/snapshot

**追加研究任务快照**

**请求参数: **

- `task_id` （必需）: 无描述

**请求体: **

参考模型: `ResearchTaskSnapshotCreateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/board/reorder

**批量更新研究工作台看板顺序**

**请求体: **

参考模型: `ResearchWorkbenchReorderRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /research-workbench/briefing/distribution

**获取每日简报分发配置**

**响应: **

- **200**: Successful Response

---

#### PUT /research-workbench/briefing/distribution

**保存每日简报分发配置**

**请求体: **

参考模型: `ResearchBriefingDistributionRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/briefing/dry-run

**记录每日简报 dry-run 分发**

**请求体: **

参考模型: `ResearchBriefingDryRunRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /research-workbench/briefing/send

**发送每日简报到通知通道**

**请求体: **

参考模型: `ResearchBriefingSendRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /research-workbench/stats

**获取研究工作台统计**

**响应: **

- **200**: Successful Response

---

### Quant Lab

#### POST /quant-lab/optimizer

**策略参数自动优化器**

**请求体: **

参考模型: `StrategyOptimizationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/optimizer/async

**异步提交策略参数优化任务**

**请求体: **

参考模型: `StrategyOptimizationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/risk-center

**风险分析与归因中心**

**请求体: **

参考模型: `RiskCenterRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/risk-center/async

**异步提交风险归因任务**

**请求体: **

参考模型: `RiskCenterRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /quant-lab/trading-journal

**交易日志与绩效追踪**

**请求参数: **

- `profile_id` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### PUT /quant-lab/trading-journal

**更新交易日志扩展信息**

**请求参数: **

- `profile_id` （可选）: 无描述

**请求体: **

参考模型: `TradingJournalUpdateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /quant-lab/alerts

**智能告警编排中心**

**请求参数: **

- `profile_id` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### PUT /quant-lab/alerts

**更新智能告警编排**

**请求参数: **

- `profile_id` （可选）: 无描述

**请求体: **

参考模型: `AlertOrchestrationUpdateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/alerts/publish

**发布统一告警事件并执行级联动作**

**请求参数: **

- `profile_id` （可选）: 无描述

**请求体: **

参考模型: `AlertEventPublishRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /quant-lab/data-quality

**数据质量可观测平台**

**响应: **

- **200**: Successful Response

---

#### POST /quant-lab/valuation-lab

**估值历史与多模型集成**

**请求体: **

参考模型: `ValuationLabRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/valuation-lab/async

**异步提交估值实验任务**

**请求体: **

参考模型: `ValuationLabRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/industry-rotation

**行业轮动量化策略**

**请求体: **

参考模型: `IndustryRotationLabRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/industry-rotation/async

**异步提交行业轮动任务**

**请求体: **

参考模型: `IndustryRotationLabRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/factor-expression

**自定义因子表达式**

**请求体: **

参考模型: `FactorExpressionRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /quant-lab/factor-expression/async

**异步提交自定义因子表达式任务**

**请求体: **

参考模型: `FactorExpressionRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

### Infrastructure

#### GET /infrastructure/status

**基础设施状态**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/token

**签发本地研究令牌**

**请求体: **

参考模型: `TokenRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/login

**本地用户密码登录**

**请求体: **

参考模型: `LoginRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/refresh

**使用 refresh token 刷新访问令牌**

**请求体: **

参考模型: `RefreshRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/oauth/token

**OAuth2 Password / Refresh Token 交换**

**请求体: **

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/auth/users

**查看本地用户目录**

**响应: **

- **200**: Successful Response

---

#### POST /infrastructure/auth/users

**创建或更新本地用户**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `AuthUserRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/auth/oauth/providers

**查看 OAuth Provider 配置**

**响应: **

- **200**: Successful Response

---

#### POST /infrastructure/auth/oauth/providers

**创建或更新 OAuth Provider**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `OAuthProviderRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/oauth/providers/sync-env

**从环境变量同步 OAuth Provider**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/auth/oauth/providers/{provider_id}/diagnostics

**诊断 OAuth Provider 配置**

**请求参数: **

- `provider_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/oauth/providers/{provider_id}/authorize

**生成 OAuth 授权链接**

**请求参数: **

- `provider_id` （必需）: 无描述

**请求体: **

参考模型: `OAuthAuthorizationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/oauth/providers/{provider_id}/exchange

**交换 OAuth 授权码**

**请求参数: **

- `provider_id` （必需）: 无描述

**请求体: **

参考模型: `OAuthExchangeRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/auth/oauth/providers/{provider_id}/callback

**OAuth 登录回调**

**请求参数: **

- `provider_id` （必需）: 无描述
- `code` （可选）: 无描述
- `state` （可选）: 无描述
- `error` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/sessions/{session_id}/revoke

**撤销 refresh session**

**请求参数: **

- `session_id` （必需）: 无描述
- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/auth/policy

**更新认证策略**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `AuthPolicyRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/tasks

**提交异步任务**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `TaskRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/tasks

**查看任务队列**

**请求参数: **

- `limit` （可选）: 无描述
- `cursor` （可选）: 无描述
- `status` （可选）: 无描述
- `execution_backend` （可选）: 无描述
- `task_view` （可选）: 无描述
- `sort_by` （可选）: 无描述
- `sort_direction` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/tasks/{task_id}

**查看任务状态**

**请求参数: **

- `task_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/tasks/{task_id}/cancel

**取消异步任务**

**请求参数: **

- `task_id` （必需）: 无描述
- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/rate-limits

**更新按用户 / 按端点限流规则**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `RateLimitUpdateRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/persistence/records

**写入持久化记录**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `RecordRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/persistence/records

**读取持久化记录**

**请求参数: **

- `record_type` （可选）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/persistence/diagnostics

**查看数据库 / TimescaleDB 接入诊断**

**响应: **

- **200**: Successful Response

---

#### POST /infrastructure/persistence/bootstrap

**初始化 PostgreSQL / TimescaleDB 持久化结构**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `PersistenceBootstrapRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/persistence/migration/preview

**预览 SQLite fallback -> PostgreSQL 迁移**

**请求参数: **

- `sqlite_path` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/persistence/migration/run

**执行 SQLite fallback -> PostgreSQL 迁移**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `PersistenceMigrationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/persistence/timeseries

**写入时序记录**

**请求体: **

参考模型: `TimeSeriesRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/persistence/timeseries

**读取时序记录**

**请求参数: **

- `series_name` （可选）: 无描述
- `symbol` （可选）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/config-versions

**保存配置版本**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `ConfigVersionRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/config-versions

**读取配置版本**

**请求参数: **

- `config_type` （必需）: 无描述
- `config_key` （必需）: 无描述
- `owner_id` （可选）: 无描述
- `limit` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /infrastructure/config-versions/diff

**对比配置版本**

**请求参数: **

- `config_type` （必需）: 无描述
- `config_key` （必需）: 无描述
- `from_version` （必需）: 无描述
- `to_version` （必需）: 无描述
- `owner_id` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/config-versions/restore

**从历史配置恢复为新版本**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `ConfigRestoreRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/notifications/test

**测试通知通道**

**请求参数: **

- `authorization` （可选）: 无描述
- `x-api-key` （可选）: 无描述

**请求体: **

参考模型: `NotificationRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### POST /infrastructure/notifications/channels

**保存通知渠道**

**请求体: **

参考模型: `NotificationChannelRequest`

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### DELETE /infrastructure/notifications/channels/{channel_id}

**删除通知渠道**

**请求参数: **

- `channel_id` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

### System

#### GET /system/status

**系统状态检查**

系统状态检查接口

Args:
    detailed: 是否执行详细检查 (默认 False，仅返回基础资源使用情况)

**请求参数: **

- `detailed` （可选）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /system/performance

**获取性能指标概览**

获取性能指标

**响应: **

- **200**: Successful Response

---

#### GET /system/health-check

**综合健康检查**

综合健康检查

**响应: **

- **200**: Successful Response

---

#### GET /system/metrics

**获取详细性能指标**

获取性能指标

**响应: **

- **200**: Successful Response

---

#### GET /system/alerts/summary

**获取告警摘要**

获取告警摘要

**响应: **

- **200**: Successful Response

---

#### POST /system/alerts/{alert_index}/resolve

**解决告警**

解决告警

**请求参数: **

- `alert_index` （必需）: 无描述

**响应: **

- **200**: Successful Response
- **422**: Validation Error

---

#### GET /system/dependencies

**依赖项连通性检查**

检查所有外部依赖项的连通性
包括：yfinance API、缓存系统、ML模型等

**响应: **

- **200**: Successful Response

---

### 健康检查

#### GET /health

**基础健康检查**

基础健康检查接口

**响应: **

- **200**: Successful Response

---

### 未分类

#### GET /

**Root**

根路径

**响应: **

- **200**: Successful Response

---

## 内部支撑路由说明

本仓运行时仍挂载部分与 `quant-trading-system` 共享的底层能力，用于 Quant Lab 实验、
历史研究快照、深链重开和本地回归脚本。这些路由不会进入当前 OpenAPI/Postman 主文档；
如果要开发公开的回测、实时行情、行业热度或交易工作台，请切换到同级目录中的
`quant-trading-system`。

## 数据模型

### AlertEventPublishRequest

**字段: **

- `source_module` (string): 无描述
- `rule_name` (string): 无描述
- `symbol` (string): 无描述
- `severity` (string): 无描述
- `message` (string): 无描述
- `condition_summary` (string): 无描述
- `condition` (unknown): 无描述
- `trigger_value` (unknown): 无描述
- `threshold` (unknown): 无描述
- `rule_ids` (array): 无描述
- `notify_channels` (array): 无描述
- `create_workbench_task` (boolean): 无描述
- `workbench_task_type` (string): 无描述
- `workbench_status` (string): 无描述
- `persist_event_record` (boolean): 无描述
- `cascade_actions` (array): 无描述

### AlertOrchestrationUpdateRequest

**字段: **

- `composite_rules` (array): 无描述
- `channels` (array): 无描述
- `module_alerts` (array): 无描述
- `history_entry` (unknown): 无描述
- `history_updates` (array): 无描述

### AuthPolicyRequest

**字段: **

- `required` (boolean): 无描述

### AuthUserRequest

**字段: **

- `subject` (string): 无描述
- `password` (unknown): 无描述
- `role` (string): 无描述
- `display_name` (string): 无描述
- `enabled` (boolean): 无描述
- `scopes` (array): 无描述
- `metadata` (object): 无描述

### Body_issue_oauth_token_infrastructure_oauth_token_post

**字段: **

- `grant_type` (string): 无描述
- `username` (unknown): 无描述
- `password` (unknown): 无描述
- `refresh_token` (unknown): 无描述
- `scope` (string): 无描述

### ConfigRestoreRequest

**字段: **

- `config_type` (string): 无描述
- `config_key` (string): 无描述
- `version` (integer): 无描述
- `owner_id` (string): 无描述

### ConfigVersionRequest

**字段: **

- `config_type` (string): 无描述
- `config_key` (string): 无描述
- `payload` (object): 无描述
- `owner_id` (string): 无描述

### CrossMarketAllocationConstraints

**字段: **

- `max_single_weight` (unknown): 无描述
- `min_single_weight` (unknown): 无描述

### CrossMarketAsset

**字段: **

- `symbol` (string): Ticker symbol, e.g. XLU
- `asset_class` (string): 无描述
- `side` (string): 无描述
- `weight` (unknown): 无描述

### CrossMarketBacktestRequest

**字段: **

- `assets` (array): 无描述
- `template_context` (unknown): 无描述
- `allocation_constraints` (unknown): 无描述
- `strategy` (string): 无描述
- `construction_mode` (string): 无描述
- `parameters` (object): 无描述
- `min_history_days` (integer): 无描述
- `min_overlap_ratio` (number): 无描述
- `start_date` (unknown): 无描述
- `end_date` (unknown): 无描述
- `initial_capital` (number): 无描述
- `commission` (number): 无描述
- `slippage` (number): 无描述

### CrossMarketBacktestResponse

**字段: **

- `success` (boolean): 无描述
- `data` (unknown): 无描述
- `error` (unknown): 无描述

### CrossMarketTemplateAsset

**字段: **

- `symbol` (string): Ticker symbol, e.g. XLU
- `asset_class` (string): 无描述
- `side` (string): 无描述
- `weight` (unknown): 无描述

### CrossMarketTemplateContext

**字段: **

- `template_id` (unknown): 无描述
- `template_name` (unknown): 无描述
- `theme` (unknown): 无描述
- `allocation_mode` (unknown): 无描述
- `bias_summary` (unknown): 无描述
- `bias_strength_raw` (unknown): 无描述
- `bias_strength` (unknown): 无描述
- `bias_scale` (unknown): 无描述
- `bias_quality_label` (unknown): 无描述
- `bias_quality_reason` (unknown): 无描述
- `base_recommendation_score` (unknown): 无描述
- `recommendation_score` (unknown): 无描述
- `base_recommendation_tier` (unknown): 无描述
- `recommendation_tier` (unknown): 无描述
- `ranking_penalty` (unknown): 无描述
- `ranking_penalty_reason` (unknown): 无描述
- `input_reliability_label` (unknown): 无描述
- `input_reliability_score` (unknown): 无描述
- `input_reliability_lead` (unknown): 无描述
- `input_reliability_posture` (unknown): 无描述
- `input_reliability_reason` (unknown): 无描述
- `input_reliability_action_hint` (unknown): 无描述
- `department_chaos_label` (unknown): 无描述
- `department_chaos_score` (unknown): 无描述
- `department_chaos_top_department` (unknown): 无描述
- `department_chaos_reason` (unknown): 无描述
- `department_chaos_risk_budget_scale` (unknown): 无描述
- `policy_execution_label` (unknown): 无描述
- `policy_execution_score` (unknown): 无描述
- `policy_execution_top_department` (unknown): 无描述
- `policy_execution_reason` (unknown): 无描述
- `policy_execution_risk_budget_scale` (unknown): 无描述
- `people_fragility_label` (unknown): 无描述
- `people_fragility_score` (unknown): 无描述
- `people_fragility_focus` (unknown): 无描述
- `people_fragility_reason` (unknown): 无描述
- `people_fragility_risk_budget_scale` (unknown): 无描述
- `source_mode_label` (unknown): 无描述
- `source_mode_dominant` (unknown): 无描述
- `source_mode_reason` (unknown): 无描述
- `source_mode_risk_budget_scale` (unknown): 无描述
- `structural_decay_radar_label` (unknown): 无描述
- `structural_decay_radar_display_label` (unknown): 无描述
- `structural_decay_radar_score` (unknown): 无描述
- `structural_decay_radar_action_hint` (unknown): 无描述
- `structural_decay_radar_risk_budget_scale` (unknown): 无描述
- `structural_decay_radar_top_signals` (array): 无描述
- `bias_highlights_raw` (array): 无描述
- `bias_highlights` (array): 无描述
- `bias_actions` (array): 无描述
- `signal_attribution` (array): 无描述
- `driver_summary` (array): 无描述
- `dominant_drivers` (array): 无描述
- `core_legs` (array): 无描述
- `support_legs` (array): 无描述
- `theme_core` (unknown): 无描述
- `theme_support` (unknown): 无描述
- `execution_posture` (unknown): 无描述
- `base_assets` (array): 无描述
- `raw_bias_assets` (array): 无描述

### FactorExpressionRequest

**字段: **

- `symbol` (string): 无描述
- `expression` (string): 无描述
- `period` (string): 无描述
- `preview_rows` (integer): 无描述

### HTTPValidationError

**字段: **

- `detail` (array): 无描述

### IndustryRotationLabRequest

**字段: **

- `start_date` (string): 无描述
- `end_date` (string): 无描述
- `rebalance_freq` (string): 无描述
- `top_industries` (integer): 无描述
- `stocks_per_industry` (integer): 无描述
- `weight_method` (string): 无描述
- `initial_capital` (number): 无描述
- `commission` (number): 无描述
- `slippage` (number): 无描述

### LoginRequest

**字段: **

- `subject` (string): 无描述
- `password` (string): 无描述
- `expires_in_seconds` (integer): 无描述
- `refresh_expires_in_seconds` (integer): 无描述

### NotificationChannelRequest

**字段: **

- `id` (string): 无描述
- `type` (string): 无描述
- `label` (string): 无描述
- `enabled` (boolean): 无描述
- `settings` (object): 无描述

### NotificationRequest

**字段: **

- `channel` (string): 无描述
- `payload` (object): 无描述

### OAuthAuthorizationRequest

**字段: **

- `frontend_origin` (string): 无描述
- `redirect_uri` (string): 无描述

### OAuthExchangeRequest

**字段: **

- `code` (string): 无描述
- `state` (string): 无描述
- `redirect_uri` (string): 无描述
- `expires_in_seconds` (integer): 无描述
- `refresh_expires_in_seconds` (integer): 无描述

### OAuthProviderRequest

**字段: **

- `provider_id` (string): 无描述
- `label` (string): 无描述
- `provider_type` (string): 无描述
- `enabled` (boolean): 无描述
- `client_id` (string): 无描述
- `client_secret` (unknown): 无描述
- `auth_url` (unknown): 无描述
- `token_url` (unknown): 无描述
- `userinfo_url` (unknown): 无描述
- `redirect_uri` (string): 无描述
- `frontend_origin` (string): 无描述
- `scopes` (array): 无描述
- `auto_create_user` (boolean): 无描述
- `default_role` (string): 无描述
- `default_scopes` (array): 无描述
- `subject_field` (string): 无描述
- `display_name_field` (string): 无描述
- `email_field` (string): 无描述
- `extra_params` (object): 无描述
- `metadata` (object): 无描述

### PersistenceBootstrapRequest

**字段: **

- `enable_timescale_schema` (boolean): 无描述

### PersistenceMigrationRequest

**字段: **

- `sqlite_path` (unknown): 无描述
- `dry_run` (boolean): 无描述
- `include_records` (boolean): 无描述
- `include_timeseries` (boolean): 无描述
- `dedupe_timeseries` (boolean): 无描述
- `record_limit` (unknown): 无描述
- `timeseries_limit` (unknown): 无描述

### PricingRequest

**字段: **

- `symbol` (string): 股票代码，如 AAPL
- `period` (string): 分析周期: 6mo, 1y, 2y, 3y, 5y

### PricingScreenerRequest

**字段: **

- `symbols` (array): 候选股票代码列表
- `period` (string): 分析周期: 6mo, 1y, 2y, 3y, 5y
- `limit` (integer): 返回前 N 个结果
- `max_workers` (integer): 并行执行数

### RateLimitRuleRequest

**字段: **

- `id` (unknown): 无描述
- `pattern` (string): 无描述
- `requests_per_minute` (integer): 无描述
- `burst_size` (integer): 无描述
- `enabled` (boolean): 无描述

### RateLimitUpdateRequest

**字段: **

- `default_requests_per_minute` (integer): 无描述
- `default_burst_size` (integer): 无描述
- `rules` (array): 无描述

### RecordRequest

**字段: **

- `record_type` (string): 无描述
- `record_key` (string): 无描述
- `payload` (object): 无描述
- `record_id` (unknown): 无描述

### RefreshRequest

**字段: **

- `refresh_token` (string): 无描述
- `expires_in_seconds` (integer): 无描述
- `refresh_expires_in_seconds` (integer): 无描述

### ResearchBriefingDistributionRequest

**字段: **

- `enabled` (boolean): 无描述
- `send_time` (string): 无描述
- `timezone` (string): 无描述
- `weekdays` (array): 无描述
- `notification_channels` (array): 无描述
- `default_preset_id` (string): 无描述
- `presets` (array): 无描述
- `to_recipients` (string): 无描述
- `cc_recipients` (string): 无描述
- `team_note` (string): 无描述

### ResearchBriefingDryRunRequest

**字段: **

- `subject` (string): 无描述
- `body` (string): 无描述
- `current_view` (string): 无描述
- `headline` (string): 无描述
- `summary` (string): 无描述
- `to_recipients` (string): 无描述
- `cc_recipients` (string): 无描述
- `team_note` (string): 无描述
- `task_count` (integer): 无描述
- `channel` (string): 无描述

### ResearchBriefingEmailPreset

**字段: **

- `id` (string): 无描述
- `name` (string): 无描述
- `to_recipients` (string): 无描述
- `cc_recipients` (string): 无描述

### ResearchBriefingSendRequest

**字段: **

- `subject` (string): 无描述
- `body` (string): 无描述
- `current_view` (string): 无描述
- `headline` (string): 无描述
- `summary` (string): 无描述
- `to_recipients` (string): 无描述
- `cc_recipients` (string): 无描述
- `team_note` (string): 无描述
- `task_count` (integer): 无描述
- `channel` (string): 无描述
- `channels` (array): 无描述

### ResearchTaskBulkUpdateRequest

**字段: **

- `task_ids` (array): 无描述
- `status` (unknown): 无描述
- `comment` (string): 无描述
- `author` (string): 无描述

### ResearchTaskCommentCreateRequest

**字段: **

- `author` (string): 无描述
- `body` (string): 无描述

### ResearchTaskCreateRequest

**字段: **

- `type` (string): 无描述
- `title` (string): 无描述
- `status` (string): 无描述
- `source` (string): 无描述
- `symbol` (string): 无描述
- `template` (string): 无描述
- `note` (string): 无描述
- `board_order` (unknown): 无描述
- `context` (object): 无描述
- `snapshot` (unknown): 无描述
- `refresh_priority_event` (unknown): 无描述

### ResearchTaskRefreshPriorityEvent

**字段: **

- `reason_key` (string): 无描述
- `reason_label` (string): 无描述
- `severity` (string): 无描述
- `lead` (string): 无描述
- `detail` (string): 无描述
- `urgency_score` (unknown): 无描述
- `priority_weight` (unknown): 无描述
- `recommendation` (string): 无描述
- `summary` (string): 无描述

### ResearchTaskReorderItem

**字段: **

- `task_id` (string): 无描述
- `status` (string): 无描述
- `board_order` (integer): 无描述
- `refresh_priority_event` (unknown): 无描述

### ResearchTaskSnapshot

**字段: **

- `headline` (string): 无描述
- `summary` (string): 无描述
- `highlights` (array): 无描述
- `payload` (object): 无描述
- `saved_at` (string): 无描述

### ResearchTaskSnapshotCreateRequest

**字段: **

- `snapshot` (unknown): 无描述
- `refresh_priority_event` (unknown): 无描述

### ResearchTaskUpdateRequest

**字段: **

- `status` (unknown): 无描述
- `title` (unknown): 无描述
- `note` (unknown): 无描述
- `board_order` (unknown): 无描述
- `context` (unknown): 无描述
- `snapshot` (unknown): 无描述
- `refresh_priority_event` (unknown): 无描述

### ResearchWorkbenchReorderRequest

**字段: **

- `items` (array): 无描述

### RiskCenterRequest

**字段: **

- `symbols` (array): 无描述
- `weights` (unknown): 无描述
- `period` (string): 无描述

### StrategyOptimizationRequest

**字段: **

- `symbol` (string): 无描述
- `strategy` (string): 无描述
- `parameters` (object): 无描述
- `parameter_grid` (unknown): 无描述
- `start_date` (unknown): 无描述
- `end_date` (unknown): 无描述
- `initial_capital` (number): 无描述
- `commission` (number): 无描述
- `slippage` (number): 无描述
- `density` (integer): 无描述
- `optimization_metric` (string): 无描述
- `optimization_method` (string): 无描述
- `optimization_budget` (unknown): 无描述
- `run_walk_forward` (boolean): 无描述
- `train_period` (integer): 无描述
- `test_period` (integer): 无描述
- `step_size` (integer): 无描述
- `monte_carlo_simulations` (integer): 无描述

### TaskRequest

**字段: **

- `name` (string): 无描述
- `payload` (object): 无描述
- `execution_backend` (string): 无描述

### TimeSeriesRequest

**字段: **

- `series_name` (string): 无描述
- `symbol` (string): 无描述
- `timestamp` (string): 无描述
- `value` (unknown): 无描述
- `payload` (object): 无描述

### TokenRequest

**字段: **

- `subject` (string): 无描述
- `role` (string): 无描述
- `expires_in_seconds` (integer): 无描述
- `refresh_expires_in_seconds` (integer): 无描述

### TradingJournalUpdateRequest

**字段: **

- `notes` (object): 无描述
- `strategy_lifecycle` (array): 无描述

### ValidationError

**字段: **

- `loc` (array): 无描述
- `msg` (string): 无描述
- `type` (string): 无描述

### ValuationLabRequest

**字段: **

- `symbol` (string): 无描述
- `period` (string): 无描述
- `peer_symbols` (array): 无描述
- `peer_limit` (integer): 无描述

### ValuationRequest

**字段: **

- `symbol` (string): 股票代码

### ValuationSensitivityRequest

**字段: **

- `symbol` (string): 股票代码
- `wacc` (unknown): 覆盖 WACC
- `initial_growth` (unknown): 覆盖初始增长率
- `terminal_growth` (unknown): 覆盖终值增长率
- `fcf_margin` (unknown): 覆盖现金流转化率
- `dcf_weight` (unknown): 覆盖 DCF 权重
- `comparable_weight` (unknown): 覆盖可比估值权重

## 错误代码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 422 | 请求数据验证失败 |
| 500 | 服务器内部错误 |

## 示例

### 运行定价差异分析

```bash
curl -X POST "http://localhost:8100/pricing/gap-analysis" \
     -H "accept: application/json" \
     -H "Content-Type: application/json" \
     -d '{
       "symbol": "AAPL",
       "period": "1y"
     }'
```

### 运行 Quant Lab 策略优化

```bash
curl -X POST "http://localhost:8100/quant-lab/optimizer" \
     -H "accept: application/json" \
     -H "Content-Type: application/json" \
     -d '{
       "symbol": "AAPL",
       "strategy": "moving_average",
       "period": "1y",
       "optimization_metric": "sharpe_ratio",
       "optimization_method": "grid"
     }'
```

## 更新日志

完整版本记录请查看 [`CHANGELOG.md`](CHANGELOG.md)。

## 支持

如有问题，请联系技术支持或查看项目文档。
