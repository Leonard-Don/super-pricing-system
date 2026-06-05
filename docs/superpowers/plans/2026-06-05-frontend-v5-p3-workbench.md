# 前端 v5 · P3 研究工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 在 `web/` 建成"研究工作台"核心 `/workbench`:任务看板 + 任务详情 + 快照对比 + 精简外壳/筛选,并把 P1 定价页的"保存到工作台"接通。

**Architecture:** 复用 P0–P2 基座(`api`、`DataTable`、`ChartFrame`、暗金、shadcn、Recharts);**复用 P2 已移植的** `@/features/godeye/lib/{researchContext,researchTaskSignals,workbenchPriorityEvents}`(别重移植)。新代码归 `web/src/features/workbench/`。

**范围(核心垂直线):** 任务看板(4 列状态 + 卡片 + 状态流转)、任务详情(meta/状态/时间线/评论)、快照对比、精简外壳+筛选、定价保存接通。
**推迟到 P3.5/以后:**
- **每日简报** 集群(分发配置/邮件预设/发送/分享/PDF,~1,700 行)→ P3.5
- **AltDataCandidateQueue**(E3 候选 convert/dismiss/snooze)→ P3.5
- 批量操作、看板内拖拽重排持久化(`reorderResearchBoard`)、跨市场保存(v5 无跨市场页)→ 以后
- `WorkbenchOverviewPanels`(1027 行巨组件)只取筛选+少量统计,不照搬

**通用约束(每个子代理都适用):**
- **工作目录是这个 worktree:`/Users/leonardodon/.sps-wt/p3`**(分支 `frontend-v5-p3-workbench`)。旧代码在主仓 `/Users/leonardodon/super-pricing-system/frontend/`(只读参考)。**不改 `frontend/`,不碰 GodEye 相关文件(`web/src/features/godeye/`、`web/src/routes/godeye/`——那是并行的 P2.5 分支领域),不碰别的 worktree。**
- **禁止 `npm run dev`。** 验证(在本 worktree `web/` 下):`npx tsc --noEmit`、`npx vitest run <file>`、`npm run build`。
- **lint 看真退出码**:`npx eslint . ; echo "exit=$?"`。
- vitest 慢(60–170s)。无 `any`。Token 只用 shadcn 语义类 + `text-pos`/`text-neg`。
- 复用:`@/features/godeye/lib/researchContext`(导航/URL)、`researchTaskSignals`(刷新信号)、`workbenchPriorityEvents`(优先事件 payload);定价侧 `@/features/pricing/lib/pricingResearch` 的 `getPriceSourceLabel`。
- 每任务 `tsc`/`lint`/`vitest`/`build` 全绿后 commit。

---

### Task 1: 纯逻辑移植 — snapshot 对比 + 选择器 + 工具 + playbook payload

**源(只读):** `frontend/src/components/research-workbench/{snapshotCompare.js,snapshotComparePricing.js,snapshotCompareCrossMarket.js,snapshotCompareFormatters.js,workbenchSelectors.js,workbenchUtils.js}`、`frontend/src/utils/workbenchViewFingerprint.js`、`frontend/src/components/research-playbook/{playbookViewModels.js,_helpers.js}`。
**Files:** `web/src/features/workbench/lib/{snapshotCompare,snapshotComparePricing,snapshotCompareCrossMarket,snapshotCompareFormatters,workbenchSelectors,workbenchUtils,workbenchViewFingerprint,playbookViewModels,helpers}.ts` + `__tests__/{workbenchSelectors,snapshotComparePricing,playbookViewModels}.test.ts`
- [ ] 写测试(先失败):`filterWorkbenchTasks`(workbenchSelectors)给定任务+筛选返回子集;`buildPricingComparisonRows`(snapshotComparePricing)给两快照返回 rows;`buildPricingWorkbenchPayload`(playbookViewModels)给 context+data 返回含 type:'pricing'/snapshot 的 payload。以旧实现为准。
- [ ] 运行 → 失败。
- [ ] 移植转 TS。`getPriceSourceLabel` 从 `@/features/pricing/lib/pricingResearch` 引;`getGodEyeSourceModeLabel`/`localizeGodEyeText` 从 `@/features/godeye/lib/displayLabels` 引(P2 已移植,复用)。`escapeHtml` 等若被引到则一并小移植。无 `any`。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): port workbench pure logic (snapshot-compare/selectors/utils/playbook payloads) to TS`

---

### Task 2: API 扩展 — research.ts

**源:** `frontend/src/services/api/research.js`(取任务 CRUD/快照/时间线/评论/看板/统计子集)。
**Files:** 扩展 `web/src/services/api/research.ts`(P2 已有 getResearchTasks/createResearchTask;**追加不替换**)+ `__tests__/researchWorkbench.test.ts`
- [ ] 写测试(先失败):mock core,断言 `getResearchTask('id')` GET `/research-workbench/tasks/id`、`updateResearchTask('id',{})` PUT、`addResearchTaskSnapshot('id',{})` POST `.../snapshot`、`getResearchTaskTimeline('id')` GET `.../timeline`、`getResearchTaskStats()` GET `/research-workbench/stats`。
- [ ] 运行 → 失败。
- [ ] 追加:`getResearchTask`、`updateResearchTask`(PUT)、`getResearchTaskTimeline`、`addResearchTaskComment`、`deleteResearchTaskComment`、`addResearchTaskSnapshot`、`reorderResearchBoard`、`getResearchTaskStats`、`deleteResearchTask`、`bulkUpdateResearchTasks`。用 `api`+`withTimeoutProfile('workbench')`。类型引 `@/generated/api-types` 或 `unknown`+窄化。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): research-workbench API methods (task CRUD/snapshot/timeline/comments/stats)`

---

### Task 3: Hook — useResearchWorkbenchData(精简)

**源:** `frontend/src/components/research-workbench/{useResearchWorkbenchData.js,useSelectedTaskIntelligence.js}`。
**Files:** `web/src/features/workbench/hooks/{useResearchWorkbenchData,useSelectedTaskIntelligence}.ts` + `__tests__/useResearchWorkbenchData.test.tsx`
- [ ] 写测试(先失败):`renderHook` + mock API(getResearchTasks/getResearchTaskStats/getResearchTask/getResearchTaskTimeline),断言 loading 收敛 + tasks 暴露 + 选中任务能拉详情。
- [ ] 运行 → 失败。
- [ ] 移植精简版:board 任务列表 + stats + filters(type/source/status/keyword)+ selectedTaskId + 选中任务 detail(getResearchTask + timeline 并行)+ 刷新信号(用 researchTaskSignals + live overview/snapshot via getMacroOverview/getAltDataSnapshot)+ 状态更新(updateResearchTask)+ 评论(add/delete)+ 快照对比(用 snapshotCompare)。URL 同步(researchContext)。**推迟**:每日简报 hook、alt 候选、批量、拖拽重排——留 TODO P3.5。用 reducer 或多 useState;无 `any`;注意 react-hooks v7 的 setState-in-effect(用 P1/P2 的 startTransition/惰性初始化范式)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): port research-workbench data hook (trimmed of briefing/candidates)`

---

### Task 4: shadcn 组件补齐

**Files:** `web/src/components/ui/*`(CLI)
- [ ] `cd web && npx shadcn@latest add dropdown-menu dialog sheet separator scroll-area textarea --yes`(textarea/某些可能已存在,已存在则跳过)。拉不到的按现有件风格手写。
- [ ] tsc + lint + build 绿。
- [ ] Commit:`feat(web): add shadcn components for workbench (dropdown/dialog/sheet/separator/scroll-area)`

---

### Task 5: 外壳 + 筛选条

**源:** `WorkbenchShell.js`(116)、`WorkbenchOverviewPanels.js`(只取筛选+刷新统计部分)。
**Files:** `web/src/features/workbench/components/{WorkbenchShell,WorkbenchFilters}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] WorkbenchShell(标题 + 关键指标 + 上下文 + 复制视图链接按钮);WorkbenchFilters(type/source/status/refresh/keyword 下拉 + 刷新信号计数 + 早间预设按钮)。props 注入。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): workbench shell + filters`

---

### Task 6: 任务看板 + 卡片

**源:** `WorkbenchBoardSection.js`(395)、`WorkbenchTaskCard.js`(369)。
**Files:** `web/src/features/workbench/components/{WorkbenchBoard,WorkbenchTaskCard}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] WorkbenchBoard(4 状态列 + archived 区;每列任务卡)。WorkbenchTaskCard(标题/类型/刷新信号 badge/选中高亮 + 点击选中 + 状态流转下拉)。**状态流转**:卡片上一个 dropdown 改状态(调 onStatusChange → updateResearchTask),**不做** HTML5 拖拽重排(推迟 P3.5)。props 注入(tasks 分组 + 回调)。
- [ ] vitest + tsc + lint + build 绿。
- [ ] Commit:`feat(web): workbench kanban board + task card (status-move via dropdown)`

---

### Task 7: 任务详情面板

**源:** `WorkbenchDetailPanel.js`(253)、`WorkbenchDetailSections.js`(413)、`SelectedTaskRefreshPanel.js`(279)。
**Files:** `web/src/features/workbench/components/{WorkbenchDetailPanel,SelectedTaskRefreshPanel}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] WorkbenchDetailPanel(选中任务:meta 显示、状态更新、时间线、评论 add/delete);SelectedTaskRefreshPanel(优先级 meta 提示 + 推荐)。快照对比区在 T8 接入。props 注入(selectedTask/timeline/回调)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): workbench task detail panel (meta/status/timeline/comments)`

---

### Task 8: 快照对比

**源:** `SnapshotComparePanel.js`(122)、`SnapshotSummary.js`(890,只取核心字段,别照搬体量)。
**Files:** `web/src/features/workbench/components/{SnapshotComparePanel,SnapshotSummary}.tsx` + `__tests__`
- [ ] 写测试(先失败)→ 失败。
- [ ] SnapshotComparePanel(对比行表 via DataTable,数据来自 lib 的 buildPricingComparisonRows/buildCrossMarketComparisonRows);SnapshotSummary(精简:核心快照字段展示,定价/跨市场两路)。接到详情面板里(当 latestSnapshotComparison 非空)。
- [ ] vitest + tsc + lint 绿。
- [ ] Commit:`feat(web): workbench snapshot compare + summary (core fields)`

---

### Task 9: WorkbenchPage 装配

**源:** `ResearchWorkbench.js`(1133)布局(去掉推迟项)。
**Files:** `web/src/routes/workbench/WorkbenchPage.tsx`(替换占位)+ `__tests__/WorkbenchPage.test.tsx`
- [ ] 写测试(先失败):mock useResearchWorkbenchData,断言无数据→空/加载,有数据→看板列 + 选中→详情面板。
- [ ] 运行 → 失败。
- [ ] 装配:Shell + Filters 顶部条 + 16/8 网格(左=Board,右=DetailPanel)。`Skeleton`/`Alert` 状态。手动刷新。**不引**每日简报/alt 候选。
- [ ] vitest + tsc + lint + build 绿。逻辑自检四态。
- [ ] Commit:`feat(web): workbench page assembly (board + detail split)`

---

### Task 10: 定价"保存到工作台"接通

**源:** `frontend/src/components/pricing/usePricingWorkbenchActions.js`(158)。
**Files:** `web/src/features/pricing/hooks/usePricingWorkbenchActions.ts` + 改 `web/src/routes/pricing/PricingAnalysisPage.tsx`(把 P1 留的 `// TODO` 保存动作接上)+ `__tests__`
- [ ] 写测试(先失败):mock createResearchTask/addResearchTaskSnapshot,渲染定价页(有 data),点"保存到工作台"调 createResearchTask(payload 含 type:'pricing'),再点更新快照调 addResearchTaskSnapshot。
- [ ] 运行 → 失败。
- [ ] 移植 `usePricingWorkbenchActions`(saveTask/updateSnapshot/savedTaskId,用 `buildPricingWorkbenchPayload` from `@/features/workbench/lib/playbookViewModels` + `createResearchTask`/`addResearchTaskSnapshot`)。在 `PricingAnalysisPage` 接上保存按钮(替换 P1 的 no-op/TODO)。**只动 pricing 页,不动 godeye。**
- [ ] vitest + tsc + lint + build 绿。
- [ ] Commit:`feat(web): wire pricing save-to-workbench (createResearchTask + snapshot)`

---

### Task 11: P3 收尾门禁 + 复审

- [ ] 全量:`cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`(真退出码逐条绿)。
- [ ] 确认无 godeye 文件改动(`git diff main --name-only | grep -E "features/godeye|routes/godeye"` 应为空——避免与 P2.5 冲突);旧 `frontend/` 未改。
- [ ] Commit(若有收尾):`chore(web): P3 workbench polish + green gate`

---

## 自检
- 看板/详情/快照/外壳/筛选/定价保存全覆盖;每日简报、alt 候选、拖拽重排、跨市场保存明确推迟,留 TODO。
- 复用 P2 的 researchContext/researchTaskSignals/workbenchPriorityEvents;不碰 godeye(避免与 P2.5 分支冲突)。
- 命名一致性:hook 暴露的 tasks/selectedTask/filters/stats/回调 跨 T3 与各组件(T5–T9)一致。
