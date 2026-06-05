# 前端 v5 · P2 上帝视角 (GodEye) 设计

> **日期**:2026-06-05 · **状态**:设计已确认(范围=核心仪表盘),待写计划
> **依赖**:P0 基座 + P1 定价(均已合并 `main`)。复用 `api` 客户端、`DataTable`、`ChartFrame`、暗金 tokens、shadcn 组件、Recharts 主题。
> **上位设计**:`docs/superpowers/specs/2026-06-04-frontend-v5-redesign-design.md`。

## 1. 目标与范围

把"上帝视角"宏观/另类数据仪表盘做成新 `web/` 里的 `/godeye` 工作区(替换旧 ~5,310 行 + P1 推迟的 ~1,064 行)。**单页长滚动**,按段落分组(旧代码已有这些 kicker 分组)。

**P2 核心(本期)** —— 6 个段落:
- **宏观态势**:`GodEyeHeader` · `GodEyeStatusStats` · `GodEyeAlerts` · hero 条
- **战场扫描**:`SupplyChainHeatmap` · `RiskPremiumRadar`
- **宏观因子 & 政策**:`MacroFactorPanel`(+`FactorCard`/`FactorTable`)· `PolicyTimelineBar` · `MacroSummaryPanels`
- **猎杀信号 & 跨市场**:`AlertHunterPanel` · `CrossMarketOverview`
- **衰败 & 战术**:`StructuralDecayRadarPanel` · `DecayWatchPanel` · `TradeThesisWatchPanel` + **P1 推迟的 3 张洞察卡**(`PeopleLayerCard` / `StructuralDecayCard` / `MacroMispricingThesisCard`)
- **另类数据(基础)**:`PeopleLayerWatchlistPanel` · `DepartmentChaosBoard` · `PhysicalWorldTrackerPanel`(均由 hook 喂 prop)

**有意推迟到 P2.5(自取数深度诊断,各自独立,~2,700 行)**:`AltDataNarrativeTile`、`CompositeSignalTile`、`AltSignalDiagnosticsTile`、`AltDataAdvancedDiagnosticsTile`、`MacroBriefingTile`、`CrossArchiveThemesTile`、`AltDataHealthTile`。
**推迟到 P3(研究工作台)**:衰败观察的"保存到工作台"动作(`createResearchTask`)、跨市场草稿导航等耦合 research-task 持久化的 CTA —— 本期渲染面板但这些动作降级/留 TODO。
**不做**:`DriversCard`/`ImplicationsCard`(纯定价工作台用,留在 P1 域)。

## 2. 路由

`/godeye` 单页(已在 P0 路由表占位)。本期把占位页换成真实仪表盘;不引子路由(段落用锚点/区块即可)。

## 3. 移植:保留 vs 重建

### 3.1 纯逻辑移植(转 TS,带测试)— 归到 `web/src/features/godeye/lib/`
| 源(`frontend/src/components/GodEyeDashboard/`) | 目标 | 说明 |
|---|---|---|
| `displayLabels.js`(448) | `displayLabels.ts` | 中文 label/enum 映射 + `localizeGodEyeText`;依赖 pricing 的 `getSourceModeLabel`(P1 已移植到 `@/features/pricing/lib/pricingResearch`) |
| `macroFactorColors.js`(20) | `macroFactorColors.ts` | 颜色常量 |
| `viewModelShared.js`(191) | `viewModelShared.ts` | action builders、符号/模板映射、tier/tone、`buildSnapshotComparison`(其依赖的 util 一并移植) |
| `overviewViewModels.js`(281) | `overviewViewModels.ts` | heatmap/radar/factor/timeline model builders |
| `taskIntelligenceViewModels.js`(889) | `taskIntelligenceViewModels.ts` | hunter/decay/thesis/cross-market 卡片 builder(最大文件) |
| `navigationHelpers.js`(156) | `navigationHelpers.ts` | `navigateDashboardAction`(URL 路由)、`buildRefreshCounts` |
| `dashboardDataHelpers.js`(156) | `dashboardDataHelpers.ts` | 并行 fetch 编排 + `buildGodEyeDerivedState` |
| `viewModels.js`(14) | `viewModels.ts` | barrel |

### 3.2 API 层(TS,复用 `api` + `withTimeoutProfile`,类型尽量引 `@/generated/api-types`)
- `web/src/services/api/altDataAndMacro.ts`:`getMacroOverview`(GET /macro/overview)、`getAltDataSnapshot`(GET /alt-data/snapshot)、`getAltDataStatus`(GET /alt-data/status)、`refreshAltData`(POST /alt-data/refresh)、`getAltDataHistory`(GET /alt-data/history)。(P2.5 再补深度诊断那批。)
- `web/src/services/api/crossMarket.ts`:`getCrossMarketTemplates`(GET /cross-market/templates)。
- `web/src/services/api/research.ts`:`getResearchTasks`(GET /research-workbench/tasks)。(`createResearchTask` 也加上,供 P3;本期 hook 不触发。)
- 扩展 `web/src/services/api/quantLab.ts`:加 `publishQuantAlertEvent`(POST /quant-lab/alerts/publish)。

### 3.3 Hook — `web/src/features/godeye/hooks/useGodEyeDashboardData.ts`
移植自旧 hook:7 路并行 fetch(macro overview / alt snapshot / status / history / policy-history / cross-market templates / research tasks)→ `buildGodEyeDerivedState` 派生 view-model;`loading`/`refreshing` + 手动刷新(`refreshAltData('all')`)。**降级**:去掉 antd `message`;去掉 alert-bus 的 `publishQuantAlertEvent` 副作用(本期不发告警事件,或留 TODO);"保存到工作台"动作留 TODO(P3)。

### 3.4 UI 组件(shadcn/Tailwind 重建,Recharts 沿用 `ChartFrame`)— `web/src/features/godeye/components/`
按 §1 的 6 段落重建 17 个核心面板 + 3 张 P1 洞察卡。巨组件按职责拆,单文件控行数。数据读取路径以旧组件为准,关键响应字段加窄 TS 类型。

## 4. 设计与图表
- 暗金 tokens;等宽数字;涨跌/强弱用 `text-pos`/`text-neg` + `macroFactorColors`(收口为主题色,不散硬编码 hex)。
- 热力图/雷达/时间线用 Recharts(`RiskPremiumRadar` 已是 radar)+ `ChartFrame`。

## 5. 测试与质量
- Vitest + RTL:移植纯逻辑测试(`overviewViewModels`/`taskIntelligenceViewModels`/`displayLabels` 的关键 builder);给关键面板(因子面板、热力图、猎杀面板、衰败观察、跨市场总览、3 张洞察卡)补渲染测试;hook 用 `renderHook` + mock API 测一条主路径。
- 沿用门禁:`tsc --noEmit` / `eslint --max-warnings 0` / `vitest` / `build` 全绿才合;PR 上 CI(含 Playwright E2E)全绿。

## 6. 目录结构(P2 结束)
```
web/src/
  features/godeye/
    lib/{displayLabels,macroFactorColors,viewModelShared,overviewViewModels,taskIntelligenceViewModels,navigationHelpers,dashboardDataHelpers,viewModels,snapshotCompare}.ts
    hooks/useGodEyeDashboardData.ts
    components/{GodEyeHeader,GodEyeStatusStats,GodEyeAlerts,SupplyChainHeatmap,RiskPremiumRadar,MacroFactorPanel,FactorCard,FactorTable,PolicyTimelineBar,MacroSummaryPanels,AlertHunterPanel,CrossMarketOverview,StructuralDecayRadarPanel,DecayWatchPanel,TradeThesisWatchPanel,PeopleLayerWatchlistPanel,DepartmentChaosBoard,PhysicalWorldTrackerPanel,PeopleLayerCard,StructuralDecayCard,MacroMispricingThesisCard}.tsx
  routes/godeye/GodeyePage.tsx   (替换占位,装配 6 段落)
  services/api/{altDataAndMacro,crossMarket,research}.ts + quantLab.ts(扩展)
```

## 7. 验收(DoD)
- `/godeye` 一页加载,6 段落渲染:态势/扫描/因子&政策/猎杀&跨市场/衰败&战术/基础另类数据;手动刷新可用;空/加载/错误态可控。
- 暗金、等宽数字、涨跌色;无旧 token 残留;P1 推迟的 3 张洞察卡落在衰败&战术段。
- 门禁全绿 + PR CI 全绿。旧 `frontend/` 未动。

## 8. 风险
- **巨型 view-model**(`taskIntelligenceViewModels` 889 行):纯逻辑移植 + 测关键 builder,别重写算法。
- **响应形状复杂**:hero/factor/heatmap/radar 字段深嵌;以旧组件读取路径为准 + 防御式可选链 + 窄类型。
- **自取数瓦片推迟**:确保 P2 不残留对那 7 个瓦片的引用(import 干净)。
- **alert-bus / workbench-save 降级**:确保降级处留 TODO 注释,不半接线导致坏引用。
