# 前端 v5 · P2 上帝视角 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 在 `web/` 建成"上帝视角"核心仪表盘 `/godeye`(单页 6 段落:宏观态势 / 战场扫描 / 宏观因子&政策 / 猎杀&跨市场 / 衰败&战术 / 基础另类数据),暗金 + shadcn,测试走 RTL。

**Architecture:** 复用 P0/P1 基座(`api`、`DataTable`、`ChartFrame`、暗金 tokens、shadcn、Recharts 主题、`@/features/pricing/lib` 里已移植的 `getSourceModeLabel` 等)。纯逻辑从旧 `frontend/src/components/GodEyeDashboard/` 移植转 TS(旧文件即行为权威);UI 用 shadcn 重建。代码归 `web/src/features/godeye/`。

**范围:** 见 spec。7 个自取数深度 alt-data 诊断瓦片 → P2.5;工作台保存/草稿等耦合 research-task 的 CTA → P3(本期渲染面板但动作留 TODO,不半接线)。

**通用约束(每个子代理都适用):**
- 旧代码 `frontend/src/...`(只读参考,行为权威);新代码 `web/src/...`。**不改 `frontend/`。** 分支 `frontend-v5-p2-godeye`,不碰 main。
- **禁止 `npm run dev`(阻塞)。** 验证用 `npx tsc --noEmit`、`npx vitest run <file>`、`npm run build`。
- **lint 看真退出码**:`npx eslint . ; echo "exit=$?"`(别 `| tail` 后读 `$?`)。
- **vitest 慢(60–170s 环境启动),别当卡死。**
- 无 `any`(eslint 报错);用精确类型或 `unknown`+窄化。
- Token 只用 shadcn 语义类 + `text-pos`/`text-neg`(+ `macroFactorColors` 常量);**不用** `bg-bg`/`text-ink`/`text-muted`(色)/`border-line`/`bg-surface`/`text-accent`/`rounded-card`。弱文本=`text-muted-foreground`,卡=`bg-card`,边=`border-border`,品牌金=`text-primary`/`bg-primary`。
- 每任务:`tsc`/`lint`/相关 `vitest`/`build` 全绿后 commit(信息见各任务)。

---

### Task 1: 纯逻辑移植 A — labels / colors / shared

**源:** `GodEyeDashboard/displayLabels.js`(448)、`macroFactorColors.js`(20)、`viewModelShared.js`(191) + 其依赖的 `buildSnapshotComparison`(查 `viewModelShared.js` 的 import 来源,多半在 `frontend/src/components/research-workbench/snapshotCompare.js` 或类似;只移植 GodEye 用到的部分)。
**Files:** `web/src/features/godeye/lib/{displayLabels,macroFactorColors,viewModelShared}.ts`(+ 必要的 `snapshotCompare.ts`)+ `__tests__/displayLabels.test.ts`
- [ ] 写测试(先失败):`localizeGodEyeText` 把一个已知 enum/英文片段转中文;`viewModelShared` 的某个 tier/tone 映射给定输入返回预期。以旧实现为准调断言。
- [ ] 运行 → 失败。
- [ ] 移植三个文件转 TS(保持函数名/签名/行为)。`getSourceModeLabel` 从 `@/features/pricing/lib/pricingResearch` 引(P1 已移植)。
- [ ] `npx vitest run <test>` 过 + `tsc` + `eslint` exit 0。
- [ ] Commit:`feat(web): port godeye label/color/shared view-model logic to TS`

---

### Task 2: 纯逻辑移植 B — view-models / nav / data-helpers

**源:** `GodEyeDashboard/{overviewViewModels.js(281),taskIntelligenceViewModels.js(889),navigationHelpers.js(156),dashboardDataHelpers.js(156),viewModels.js(14)}`。`taskIntelligenceViewModels` 依赖三个 `utils/` helper —— 查清后一并移植(或从 P1 已移植的 `@/features/pricing/lib` / `@/utils` 复用)。
**Files:** `web/src/features/godeye/lib/{overviewViewModels,taskIntelligenceViewModels,navigationHelpers,dashboardDataHelpers,viewModels}.ts` + `__tests__/{overviewViewModels,taskIntelligenceViewModels}.test.ts`
- [ ] 写测试(先失败):给 `buildHeatmapModel`/`buildFactorPanelModel`(overviewViewModels)和一个 `taskIntelligenceViewModels` 的 builder 喂最小输入,断言关键输出字段。以旧实现为准。
- [ ] 运行 → 失败。
- [ ] 移植转 TS。`dashboardDataHelpers` 的 `window.setTimeout` 换 `setTimeout`;API 调用改引新 `@/services/api/*`(Task 3 会建,可先用类型占位 import,Task 3 后再跑通——或把 Task 3 提前;实现时若 API 未就绪,先移植不依赖 API 的 `buildGodEyeDerivedState`,fetch 编排留到 hook)。
- [ ] vitest 过 + tsc + lint exit 0。
- [ ] Commit:`feat(web): port godeye overview + task-intelligence view-models to TS`

---

### Task 3: API 层 — altDataAndMacro / crossMarket / research + quantLab 扩展

**源:** `frontend/src/services/api/{altDataAndMacro.js,crossMarket.js,research.js,quantLab.js}`(只取 GodEye 用到的方法)。
**Files:** `web/src/services/api/{altDataAndMacro,crossMarket,research}.ts`、扩展 `web/src/services/api/quantLab.ts`、`__tests__/altDataAndMacro.test.ts`
- [ ] 写测试(先失败):mock `@/services/api/core`,断言 `getMacroOverview(true)` GET `/macro/overview`、`getAltDataSnapshot()` GET `/alt-data/snapshot`、`refreshAltData('all')` POST `/alt-data/refresh`、`getCrossMarketTemplates()` GET `/cross-market/templates`、`getResearchTasks({limit:60})` GET `/research-workbench/tasks`。
- [ ] 运行 → 失败。
- [ ] 实现:`altDataAndMacro.ts`(getMacroOverview/getAltDataSnapshot/getAltDataStatus/refreshAltData/getAltDataHistory)、`crossMarket.ts`(getCrossMarketTemplates)、`research.ts`(getResearchTasks + createResearchTask)、`quantLab.ts` 加 `publishQuantAlertEvent`(POST /quant-lab/alerts/publish)。都用 `api`+`withTimeoutProfile`(dashboard/standard 档)。类型尽量引 `@/generated/api-types`;否则 `unknown`+窄化。
- [ ] vitest 过 + tsc + lint exit 0。
- [ ] Commit:`feat(web): godeye API methods (alt-data/macro/cross-market/research, typed)`

---

### Task 4: Hook — useGodEyeDashboardData

**源:** `GodEyeDashboard/useGodEyeDashboardData.js`(121)。
**Files:** `web/src/features/godeye/hooks/useGodEyeDashboardData.ts` + `__tests__/useGodEyeDashboardData.test.tsx`
- [ ] 写测试(先失败):`renderHook` + mock 全部 API(返回最小 payload),断言 loading 收敛 + 暴露 `overview`/`snapshot`/派生 view-model(如 `factorPanelModel`)。
- [ ] 运行 → 失败。
- [ ] 移植:7 路并行 fetch(`dashboardDataHelpers.fetchGodEyeDashboardPayload`)→ `buildGodEyeDerivedState` 派生;`loading`/`refreshing`;手动刷新调 `refreshAltData('all')` 再 reload。**降级**:去 antd `message`;**不发** `publishQuantAlertEvent`(留 TODO P2.5);保存到工作台动作留 TODO(P3)。类型化 state,无 `any`。
- [ ] vitest 过 + tsc + lint exit 0。
- [ ] Commit:`feat(web): port godeye dashboard data hook (trimmed alert-bus/workbench)`

---

### Task 5: 段落① 宏观态势

**源:** `GodEyeHeader.js`(76)、`GodEyeStatusStats.js`(92)、`GodEyeAlerts.js`(206) + `index.js` hero 段。
**Files:** `web/src/features/godeye/components/{GodEyeHeader,GodEyeStatusStats,GodEyeAlerts}.tsx` + `__tests__`(至少 GodEyeStatusStats、GodEyeAlerts 渲染测试)
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建为 shadcn 展示组件(props 注入):Header(标题/宏观信号 chip/刷新按钮)、StatusStats(宏观分/源数/健康/快照时间 stat 行)、Alerts(宏观信号/源退化/衰败/刷新计数 横幅)。暗金 token。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye section — macro posture (header/status/alerts)`

---

### Task 6: 段落② 战场扫描

**源:** `SupplyChainHeatmap.js`(86)、`RiskPremiumRadar.js`(74,Recharts radar)。
**Files:** `web/src/features/godeye/components/{SupplyChainHeatmap,RiskPremiumRadar}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建:Heatmap(2×3 网格 + 异常列表,色用 `macroFactorColors`/语义)、Radar(Recharts `RadarChart` via `ChartFrame`,暗金轴/网格)。props 注入(`heatmapModel`/`radarData`)。
- [ ] vitest + tsc + lint + build 绿。
- [ ] Commit:`feat(web): godeye section — battlefield scan (heatmap + radar)`

---

### Task 7: 段落③ 宏观因子 & 政策

**源:** `MacroFactorPanel.js`(111)、`FactorCard.js`(201)、`FactorTable.js`(116)、`PolicyTimelineBar.js`(94)、`MacroSummaryPanels.js`(113)。
**Files:** `web/src/features/godeye/components/{MacroFactorPanel,FactorCard,FactorTable,PolicyTimelineBar,MacroSummaryPanels}.tsx` + `__tests__`(至少 MacroFactorPanel、PolicyTimelineBar)
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建:FactorCard(单因子卡:趋势 delta/证据质量/CTA)、MacroFactorPanel(排序因子列表 + 共振/证据元信息)、FactorTable(因子表 via `DataTable`)、PolicyTimelineBar(政策事件时间线 + 刺激/收紧方向 chip)、MacroSummaryPanels(共振/证据/输入可靠性补充面板)。props 注入(`factorPanelModel`/`timelineItems`)。导航 CTA 用 `navigateDashboardAction`(URL 路由,P3 耦合的目标留 TODO)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye section — macro factors & policy`

---

### Task 8: 段落④ 猎杀信号 & 跨市场

**源:** `AlertHunterPanel.js`(59)、`CrossMarketOverview.js`(318)。
**Files:** `web/src/features/godeye/components/{AlertHunterPanel,CrossMarketOverview}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建:AlertHunterPanel(高/中告警列表 + severity badge + 动作按钮)、CrossMarketOverview(排序的跨市场模板卡 + 刷新 badge + 导航 CTA,用 `crossMarketCards`)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye section — hunter alerts & cross-market`

---

### Task 9: 段落⑤ 衰败 & 战术(面板部分)

**源:** `StructuralDecayRadarPanel.js`(111)、`DecayWatchPanel.js`(109)、`TradeThesisWatchPanel.js`(98)。
**Files:** `web/src/features/godeye/components/{StructuralDecayRadarPanel,DecayWatchPanel,TradeThesisWatchPanel}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建:StructuralDecayRadarPanel(衰败分 gauge + label + action hint)、DecayWatchPanel(衰败分任务观察列表;**"保存到工作台" CTA 留 TODO P3**,按钮可见但 onSave 占位)、TradeThesisWatchPanel(交易论点任务 + drift 指示 + CTA)。用 `decayWatchModel`/`tradeThesisWatchModel`。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye section — decay & tactical panels`

---

### Task 10: P1 推迟的 3 张洞察卡

**源:** `frontend/src/components/pricing/PricingInsightCards.js`(857)的 `PeopleLayerCard` / `StructuralDecayCard` / `MacroMispricingThesisCard` 三个 export。
**Files:** `web/src/features/godeye/components/{PeopleLayerCard,StructuralDecayCard,MacroMispricingThesisCard}.tsx` + `__tests__`(至少 StructuralDecayCard、MacroMispricingThesisCard)
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建三卡(shadcn + Recharts where used):PeopleLayerCard(管理画像/内部交易/招聘稀释三栏 + 源治理/政策执行 footer)、StructuralDecayCard(衰败确定性进度条 + 主导失效模式 + 证据 tags + 成分网格)、MacroMispricingThesisCard(立场/类型/期限 tags + 主腿/对冲腿 + trade_legs 网格 + kill 条件 + 执行备注;`onOpenDraft` CTA 留 TODO P3)。读取路径以旧组件为准,加窄类型。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye insight cards (people-layer/structural-decay/macro-mispricing) ported from P1`

---

### Task 11: 段落⑥ 基础另类数据

**源:** `PeopleLayerWatchlistPanel.js`(102)、`DepartmentChaosBoard.js`(101)、`PhysicalWorldTrackerPanel.js`(114)。
**Files:** `web/src/features/godeye/components/{PeopleLayerWatchlistPanel,DepartmentChaosBoard,PhysicalWorldTrackerPanel}.tsx` + `__tests__`(至少一个)
- [ ] 写测试(先失败)→ 失败。
- [ ] 重建:PeopleLayerWatchlistPanel(脆弱公司观察 + stance/risk chips)、DepartmentChaosBoard(混乱部门榜 + 混乱分 + 政策噪声)、PhysicalWorldTrackerPanel(港口拥堵/商品库存/海关信号)。props 注入(来自 hook 的 `overview`/`snapshot`)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): godeye section — alt-data basics (people/dept-chaos/physical-world)`

---

### Task 12: GodeyePage 装配

**源:** `GodEyeDashboard/index.js`(610)布局(去掉推迟段)。
**Files:** `web/src/routes/godeye/GodeyePage.tsx`(替换占位)+ `__tests__/GodeyePage.test.tsx`
- [ ] 写测试(先失败):mock `useGodEyeDashboardData`,断言无数据→空/加载态,有数据→渲染各段落标志(如某段 kicker 文案 + 一个面板标题)。
- [ ] 运行 → 失败。
- [ ] 装配:用 `useGodEyeDashboardData` → hero 条 + 6 段落(按 §1 顺序),`Skeleton` 加载 / `Alert` 错误 / 段落 block 包裹(kicker 标签)。**不引**任何 P2.5 自取数瓦片。手动刷新按钮接 hook 的 refresh。
- [ ] vitest + tsc + lint + build 绿。逻辑自检:空/加载/错误/有数据。
- [ ] Commit:`feat(web): godeye page assembly (6 sections)`

---

### Task 13: P2 收尾门禁 + 复审

- [ ] 全量:`cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`(真退出码,逐条绿)。
- [ ] 确认无对 7 个推迟瓦片的残留 import;无旧 token 残留(grep)。
- [ ] 旧 `frontend/` 未改:`git diff main --name-only -- frontend/`(空)。
- [ ] Commit(若有收尾):`chore(web): P2 godeye polish + green gate`

---

## 自检(对照 spec)
- §3.1 纯逻辑 → T1/T2;§3.2 API → T3;§3.3 hook → T4;§3.4 UI → T5–T11;装配 → T12。
- 推迟项(7 自取数瓦片 / workbench-save / 草稿 CTA)**未**作为任务出现,降级处留 TODO —— 有意,符合 spec §1。
- 命名一致性:`useGodEyeDashboardData` 暴露的派生 model 名(`factorPanelModel`/`heatmapModel`/`radarData`/`crossMarketCards`/`decayWatchModel`/`tradeThesisWatchModel`/`timelineItems`/`hunterAlerts`)跨 hook(T4)与各段落(T5–T11)一致;装配(T12)按这些名取数。
