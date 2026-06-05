# 前端 v5 · P1 定价研究 设计

> **日期**:2026-06-04 · **状态**:设计已确认(范围=核心垂直线),待写计划
> **依赖**:P0 基座(已合并 `main` #88)——Vite+React19+TS5.9+Tailwind v4+shadcn(暗金)+React Router+TanStack DataTable+类型化 API 客户端。
> **上位设计**:`docs/superpowers/specs/2026-06-04-frontend-v5-redesign-design.md`(§3 设计系统、§4 IA、§5 移植范式、§6 数据层)。

## 1. 目标与范围

在 `web/` 里把"定价研究"工作区做成一条**可用的核心垂直线**,替换旧 `frontend/` 里 ~5,230 行的 antd 版本。三个子页(沿用上位设计的 IA 决策 B):

- **分析** `/pricing` —— 标的搜索 → `gap-analysis` → 结果区(核心结果卡)+ 批量筛选器。
- **估值历史** `/pricing/valuation` —— 移植 QuantLab 估值面板。
- **自定义因子** `/pricing/factors` —— 移植 QuantLab 因子表达式面板。

**有意推迟(放到真正所属的阶段,非偷工):**
- 定性洞察卡:人事层 / 结构性衰败 / 宏观错误定价(→ P2 上帝视角,耦合 alt-data/宏观域)
- 研究剧本 Playbook、工作台上下文栏、保存任务/快照动作(→ P3 研究工作台,耦合 research-task 持久化)
- `AltDataContextPanel`(→ P2,耦合 alt-data)
- `getFactorModelAnalysis` / `getBenchmarkFactors`(旧代码里已定义但当前流程未调用,不移植)

## 2. 信息架构与路由

`/pricing` 下用**子导航(Tabs)**承载三个子页(替换旧 `?view=`):
```
/pricing            → 分析(默认)
/pricing/valuation  → 估值历史
/pricing/factors    → 自定义因子
```
子页用 React Router 嵌套路由 + 一个 shadcn `Tabs` 风格的子导航条;`分析` 是 index 路由。深链接到子页可直接打开。

## 3. 移植:保留 vs 重建(基于代码勘察)

### 3.1 纯逻辑移植(转 TS,带单测)
| 源(旧) | 目标(新) | 内容 |
|---|---|---|
| `utils/pricingResearch.js`(387) | `web/src/features/pricing/lib/pricingResearch.ts` | `parsePricingUniverseInput`、`HOT_PRICING_SYMBOLS`、`SCREENING_PRESETS`、`buildScreeningScore`、`buildScreeningRowFromAnalysis`、`sortScreeningRows`、`getConfidenceLabel`/`getPriceSourceLabel`/`getDriverImpactMeta` 等纯函数 |
| `utils/pricingSectionConstants.js`(15) | `web/src/features/pricing/lib/constants.ts` | `DEFAULT_SCREENING_UNIVERSE`、`ALIGNMENT_TAG_COLORS`、`RANGE_BASIS_LABELS` 等 |
| `utils/pricingResearchReport.js`(486) | `web/src/features/pricing/lib/report.ts` | `buildPricingResearchReportHtml`、`buildPricingResearchAuditPayload`、`openPricingResearchPrintWindow`(导出 HTML/JSON);`utils/export.ts` 配套 |

### 3.2 API 层(TS,尽量用 `@/generated/api-types` 的类型)
| 源 | 目标 | 端点 |
|---|---|---|
| `services/api/pricing.js` | `web/src/services/api/pricing.ts` | `getGapAnalysis`(POST /pricing/gap-analysis)、`runPricingScreener`(POST /pricing/screener)、`getPricingSymbolSuggestions`(GET /pricing/symbol-suggestions)、`getPricingGapHistory`(GET /pricing/gap-history)、`getPricingPeerComparison`(GET /pricing/peers)、`getValuationSensitivityAnalysis`(POST /pricing/valuation-sensitivity) |
| (quant-lab 子集) | `web/src/services/api/quantLab.ts` | `runQuantValuationLab`/`queueQuantValuationLab`(POST /quant-lab/valuation-lab[/async])、`runQuantFactorExpression`/`queueQuantFactorExpressionTask`(POST /quant-lab/factor-expression[/async]) |

> 都复用 P0 的 `api` 实例 + `withTimeoutProfile`(screener 用 `analysis` 档,≥180s)。

### 3.3 Hooks(重建为 TS,标准 React hooks)
- `usePricingResearchData`(精简版:symbol/period/data/loading/error + URL 同步;**去掉**工作台自动触发/context 注入)
- `usePricingSearch`(suggestions + localStorage 历史)
- `usePricingScreening`(screener 状态 + 过滤/排序)
- `usePricingAnalysisDetails`(并行拉 gap-history + peers)
- `usePricingSensitivity`(WACC/增长/FCF 滑杆 + sensitivity 调用)

### 3.4 UI 组件(shadcn/Tailwind 重建,Recharts 沿用)
- 外壳:`PricingLayout`(子导航 Tabs)
- 分析页:`PricingAnalysisPage` + `PricingSearchPanel` + `PricingScreenerCard` + `PricingResults`
- 结果卡:`FactorModelCard`(CAPM/FF3/FF5)、`ValuationCard`(DCF/MonteCarlo/Comparable)、`GapOverviewCard` + `GapHistoryCard` + `PeerComparisonCard` + `SensitivityCard`
- 子页:`ValuationLabPage`、`FactorLabPage`
- 巨组件拆分:旧 `PricingInsightCards.js`(857)/`PricingModelCards.js`(687)按卡片拆成有界小组件(本期只做核心卡,不照搬体量)

## 4. 需要新增的 shadcn 组件
`card`、`input`、`select`、`tabs`、`slider`、`textarea`、`alert`、`badge`、`skeleton`、`tooltip`、`table`(或直接用 P0 的 `DataTable`)。用 `npx shadcn@latest add ...` 生成,统一暗金主题。

## 5. 图表
Recharts(P0 已在 DataTable 旁验证可用),为暗色台配统一的轴/网格/tooltip 主题(一个 `chartTheme.ts` + 复用的 `<ChartFrame>`)。涨跌用 `--pos`/`--neg`,强调线用 `--primary`(金)。

## 6. 测试与质量
- Vitest + RTL:移植 `pricingResearch`/`report` 的纯逻辑测试;给关键交互组件(搜索面板、筛选器、结果区渲染、估值/因子面板提交)补渲染+交互测试。
- 沿用 P0 门禁:`tsc --noEmit` / `eslint --max-warnings 0` / `vitest` / `build`,全绿才合。

## 7. 目录结构(P1 结束时)
```
web/src/
  features/pricing/
    lib/{pricingResearch.ts, constants.ts, report.ts, chartTheme.ts}
    hooks/{usePricingResearchData,usePricingSearch,usePricingScreening,usePricingAnalysisDetails,usePricingSensitivity}.ts
    components/{PricingSearchPanel,PricingScreenerCard,PricingResults,FactorModelCard,ValuationCard,GapOverviewCard,GapHistoryCard,PeerComparisonCard,SensitivityCard,ChartFrame}.tsx
  routes/pricing/{PricingLayout,PricingAnalysisPage,ValuationLabPage,FactorLabPage}.tsx
  services/api/{pricing.ts, quantLab.ts}
  components/ui/*  (新增 shadcn 组件)
```

## 8. 验收(DoD)
- `/pricing` 三个子页可切换;分析页能搜索→分析→看到核心结果卡;筛选器能跑批量;估值历史/自定义因子能提交并展示结果。
- 全程暗金、等宽数字、涨跌语义色;无旧 token 残留。
- 门禁全绿。旧 `frontend/` 未动。

## 9. 风险
- **结果卡数据形状**:gap-analysis 返回的嵌套结构复杂;移植时以旧组件读取路径为准,必要时给关键响应加 TS 类型(从 `api-types` 或手写窄类型)。
- **巨组件**:按卡片拆分,单文件控制在合理行数。
- **异步任务(估值/因子的 async 排队)**:本期可先只做同步提交,async 排队作为加分项(若超时则标注 TODO,不阻塞)。
