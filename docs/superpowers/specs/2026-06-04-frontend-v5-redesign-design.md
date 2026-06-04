# 前端 v5 重做设计:暗金研究台

> **日期**:2026-06-04 · **状态**:设计已确认,待写实施计划
> **范围**:替换拆分前继承自 quant trading system 的整套前端,改为只服务"定价 + 宏观研究"的全新前端。
> **后端**:不改动。同一套 FastAPI(`:8100`),新前端只调用公开研究路由。

---

## 1. 背景与动机

当前 `frontend/` 是拆分前从 quant trading system 整体搬来的:Create React App(`react-scripts` 5,已停止维护)+ Ant Design 5 + 纯 JS,约 52k 行、130 组件。问题有四,全部在本次范围内:

1. **视觉**:深色"通用量化终端"长相(AntD 默认 + 蓝青渐变),没有"定价研究"自己的身份。
2. **信息架构**:仍暴露整个交易平台宽度(交易日志、回测、运维/限流/任务队列面板),与收窄后的"定价 + 宏观研究"定位不符。
3. **技术栈**:CRA 已停维、无 TypeScript。
4. **代码质量**(见 `docs/CODEBASE_ASSESSMENT.md`):零 `React.memo`、零组件渲染测试、268 处硬编码色值绕过主题、若干 1000+ 行巨型展示组件、长列表无虚拟化。

底层架构本身评估为 B(API 层、容器/展示分离做得好),因此**保留可移植的逻辑层,重建 UI 层**,而非从零重写一切。

## 2. 目标与非目标

**目标**
- 全新视觉身份:精修暗色台 + 单一金色强调。
- 现代技术栈:Vite + TypeScript + Tailwind + shadcn/ui。
- 收窄信息架构到三个研究工作区。
- 系统性修掉评估里的前端短板(硬编码色、零组件测试、无虚拟化、巨型组件)。

**非目标**
- 不改后端、不改业务算法、不改数据契约。
- 不一次性大爆改:分期可独立交付,旧前端在切换前保持可跑。
- 不引入交易/下单/实时撮合等已拆分出去的能力。

## 3. 视觉设计系统(暗金台)

**Design tokens**(收口为 Tailwind theme + CSS 变量,根治硬编码 hex):

| 角色 | 值 |
|---|---|
| 背景 `--bg` | `#0E0E12` |
| 面板 `--surface` | `#17171C` |
| 升起面 `--elevated` | `#1C1C22` |
| 分隔线 `--line` | `#2A2A33` |
| 主文本 `--ink` | `#ECECEE` |
| 次文本 `--muted` | `#8E8E98` |
| 强调(招牌)`--accent` | `#E2B23C`(amber) |
| 强调软背景 | `rgba(226,178,60,.12)` |
| 涨/正 `--pos` | `#5FBF7E` |
| 跌/负 `--neg` | `#E5685A` |

> 招牌色(金)刻意与涨跌语义色(绿/红)分离,避免在表格里混淆。

- **排版**:Inter 正文;等宽字体(SF Mono / Roboto Mono)用于所有数字、价格、百分比;高信息密度表格。
- **形状/动效**:卡片圆角 10px、控件 8px、chip 999px;克制的过渡(120ms)。
- **明暗**:暗色为主、单一主题(本期不做浅色切换;`ThemeContext` 的多主题能力暂不迁移)。
- **组件基础**:shadcn/ui(基于 Radix)。组件源码进自有仓库,便于定制与维护。
- **数据表**:TanStack Table + TanStack Virtual(排序/筛选/**虚拟化**,补 `CODEBASE_ASSESSMENT.md` H2 长列表卡顿)。
- **图表**:沿用 Recharts,套暗金主题。

## 4. 信息架构与路由

三个顶层工作区,基于 React Router 的真实 URL 路由(替换现有 `?view=`/`popstate` 手搓逻辑):

- **定价研究** `/pricing`
  - 子页:`分析` `/pricing`(默认)· `估值历史` `/pricing/valuation` · `自定义因子` `/pricing/factors`
- **上帝视角** `/godeye` —— 宏观因子引擎、证据质量、政策雷达、结构性衰败、跨市场总览
- **研究工作台** `/workbench` —— 研究任务持久化、状态流转、快照对比、每日简报

**深链/分享**:保留现 `researchContext` 的深链与分享链接能力,迁移到路由层(规范化别名、可重开视图)。

## 5. 代码迁移:保留 vs 重建

### 5.1 框架无关层(迁移 + 顺手转 TS,保留其单测)
- **API 服务层** `src/services/api/*`:单 axios 实例、超时档位、`refreshInFlight` 防并发刷新风暴、拦截器统一错误(评估"教科书级")。
- **纯视图模型/构造器**:`components/**/viewModels.js`、`overviewViewModels`、`taskIntelligenceViewModels`、`playbookViewModels`、`snapshotCompare*`、`buildQuantLab*`(仅估值/因子相关)、`dashboardDataHelpers`。
- **纯工具** `utils/*`:`formatting`、`pricingResearch`、`researchTaskSignals/*`、`macroMispricingDraft`、`relativeTime` 等(剔除 `crossMarketRecommendations` 中仅服务回测面板的部分)。

> 价值大头在这一层。连同其现有单测一起迁移——核心领域逻辑与回归网不丢。

### 5.2 重建(UI 层)
- 所有组件 `.jsx → .tsx`,用 shadcn/Tailwind 重写。
- 应用外壳(导航 / 主题 / 路由 / 错误边界 / 懒加载)全新实现。
- 叶子展示组件默认 `React.memo` + 稳定 props 引用(补 H2)。

## 6. 数据层与后端契约

- **类型化 API 客户端**:用 `openapi-typescript` 从 `docs/openapi.json` 生成请求/响应类型,服务层全程有类型(相对现纯 JS 是显著安全升级)。
- **调用面以登记表为准**(`docs/public_route_surface_registry.md` + `docs/legacy_route_retirement.md`):
  - **接入(公开研究路由)**:`/pricing`、`/alt-data`、`/macro`、`/research-workbench`、`/quant-lab`(仅估值/因子)、`/cross-market`(仅 GodEye 跨市场总览)、`/infrastructure`(仅鉴权/登录会话)。
  - **不接(隐藏遗留路由)**:`/market-data`、`/strategies`、`/backtest`、`/realtime`、`/analysis`、`/optimization`、`/trade`、`/industry`、`/events`。后端仍挂载这些(供旧任务回放),但新前端零调用点。
- **鉴权**:沿用现有 `/infrastructure/auth`(含 OAuth 回调窗口 `quant-oauth-callback` postMessage 机制)。token 存储重做时收紧(评估提到 localStorage token + 简报 `innerHTML` 的 XSS→token 外泄链路):简报外部 HTML 经 DOMPurify 后再渲染。

## 7. 测试与工程化

- **测试**:Vitest + React Testing Library。迁移现有纯逻辑测试;为关键交互组件(定价工作台、估值历史、GodEye 关键面板、工作台看板)**补渲染 + 交互测试**(补 H3)。
- **质量门禁**:TypeScript `strict`、ESLint(typescript-eslint)、Prettier;CI 跑 `tsc --noEmit` + lint + `vitest run` + `npm audit`,与现有后端 CI 并列。
- **构建/端口**:Vite dev server 沿用现有 `3100`(评估记录:后端 8100 / 前端 3100 全链一致),代理 `/api → 127.0.0.1:8100`。

## 8. 明确砍掉的功能(范围外)

- 交易日志面板(`QuantLabTradingJournalPanel`)
- 跨市场回测面板(`CrossMarketBacktestPanel` 及 `components/cross-market/*` 中仅服务该面板的部分;GodEye 的跨市场总览保留)
- 基础设施/运维面板:鉴权配置、限流、任务队列、告警编排、数据质量运维(`QuantLabInfrastructure*`、`QuantLabOps*`、`QuantLabAlertOrchestrationPanel`、`QuantLabDataQualityPanel`)
- 实验台中非估值、非因子的部分

> 仅保留实验台的 `QuantLabValuationPanel`(估值历史)与 `QuantLabFactorPanel`(自定义因子),并入定价研究。

## 9. 迁移策略与分期

新代码建在并行目录 **`web/`**;旧 `frontend/` 在 P4 切换前保持可跑。每期可独立上线。

| 期 | 内容 | 交付物 |
|---|---|---|
| **P0 基座** | Vite+TS+Tailwind+shadcn 脚手架;设计 tokens;`openapi-typescript` 类型化客户端;移植框架无关层(API 服务 + 视图模型 + 工具 + 其单测);应用外壳(路由 / 暗金主题 / 错误边界 / 懒加载);登录/鉴权;Vitest+RTL 基座 | 能跑的空壳 + 完整数据层 + 登录 |
| **P1** | 定价研究(分析 / 估值历史 / 自定义因子) | 第一个可用工作区 |
| **P2** | 上帝视角(宏观因子 / 证据质量 / 政策雷达 / 结构性衰败 / 跨市场总览) | |
| **P3** | 研究工作台(任务 / 快照对比 / 每日简报) | |
| **P4 切换** | `frontend/` → `web/`,删旧前端,更新 CI / 端口 / 文档,清掉交易/运维死 UI;README 技术栈表同步(顺带修 M7) | v5 正式上线 |

## 10. 风险与缓解

- **数据表重建是最大成本项** → P0 先把 TanStack Table 封一个统一的 `DataTable`(排序/筛选/虚拟化/数字等宽列),后续各期复用。
- **巨型组件**(如 `CrossMarketResultsSection` 1031 行、`WorkbenchOverviewPanels` 1027 行)→ 重建时按职责拆成有界小组件,不照搬体量。
- **范围蔓延** → 以 §8 砍掉清单 + §6 不接路由清单为硬边界,新增调用点必须落在公开研究路由。
- **并行期重复维护** → 切换前旧前端只接受关键修复,不在旧栈上做新功能。

## 11. 本次 spec 覆盖范围

项目较大,本设计文档锁定 **总体架构 + P0 基座** 到可实施粒度;**P1–P4 作为路线图**。P0 落地后,每期各自 `spec → plan → 实现`。下一步:对 P0 写详细实施计划。
