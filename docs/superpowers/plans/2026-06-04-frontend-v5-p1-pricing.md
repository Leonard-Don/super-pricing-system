# 前端 v5 · P1 定价研究 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 在 `web/` 建成"定价研究"核心垂直线:分析(搜索→gap分析→核心结果卡+筛选器)+ 估值历史 + 自定义因子,三个子页,暗金 + shadcn,测试走 RTL。

**Architecture:** 复用 P0 基座(`api` 客户端、`DataTable`、暗金 tokens、路由)。纯逻辑从旧 `frontend/` 移植转 TS(旧文件即行为权威);UI 用 shadcn 重建;图表 Recharts。代码归到 `web/src/features/pricing/`。

**Tech Stack:** React 19 · TS 5.9 · Tailwind v4 · shadcn/ui · React Router · Recharts · TanStack Table · Vitest/RTL.

**范围:** 仅核心垂直线(见 spec)。洞察卡(人事/衰败/宏观)、Playbook、工作台保存/快照/上下文栏、AltDataContextPanel **不在本期**。

**通用约束(每个子代理都适用):**
- 旧代码在 `frontend/src/...`(只读参考,行为权威);新代码在 `web/src/...`。**不要改 `frontend/`。** 分支 `frontend-v5-p1-pricing`,不碰 main。
- **禁止 `npm run dev`(阻塞)。** 验证用 `npx tsc --noEmit`、`npx vitest run <file>`、`npm run build`。
- **lint 看真退出码**:`npx eslint . ; echo "exit=$?"`(别 `| tail` 后读 `$?`)。
- **vitest 在本机很慢(60–170s 环境启动),别当卡死。**
- Token 工具类只用 shadcn 语义类 + `text-pos`/`text-neg`(见上位计划的映射表):`bg-background/text-foreground/text-muted-foreground/bg-card/border-border/text-primary/bg-primary/10` 等。
- 每个任务结束:`tsc`、`lint`、相关 `vitest`、`build` 全绿后 commit。

---

### Task 1: shadcn 组件批量补齐

**Files:** `web/src/components/ui/*`(CLI 生成)

- [ ] 安装本期要用的 shadcn 组件:
```bash
cd web && npx shadcn@latest add card input select tabs slider textarea alert badge skeleton tooltip label
```
- [ ] 若某组件 CLI 拉不到(v4 命名差异),按现有 `button.tsx` 风格手写等价件(用 CVA + `cn`,token 用 CSS 变量)。
- [ ] 验证:`npx tsc --noEmit` exit 0;`npx eslint .` exit 0(生成件已在 `src/components/ui/**` 的 eslint ignore 内);`npm run build` 成功。
- [ ] Commit:`feat(web): add shadcn components for pricing (card/input/select/tabs/slider/textarea/alert/badge/skeleton/tooltip)`

---

### Task 2: 纯逻辑移植 — 常量 + pricingResearch

**参考源:** `frontend/src/utils/pricingSectionConstants.js`、`frontend/src/utils/pricingResearch.js`(零 React,行为权威)。
**Files:** `web/src/features/pricing/lib/constants.ts`、`web/src/features/pricing/lib/pricingResearch.ts`、`web/src/features/pricing/lib/__tests__/pricingResearch.test.ts`

- [ ] **Step 1:** 写测试(覆盖关键纯函数,先失败)。`pricingResearch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parsePricingUniverseInput, sortScreeningRows, getConfidenceLabel } from '@/features/pricing/lib/pricingResearch';

describe('parsePricingUniverseInput', () => {
  it('splits on commas/newlines/spaces, dedupes, uppercases', () => {
    expect(parsePricingUniverseInput('aapl, msft\nAAPL  nvda')).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });
  it('returns [] for empty', () => {
    expect(parsePricingUniverseInput('   ')).toEqual([]);
  });
});

describe('sortScreeningRows', () => {
  it('sorts by score desc by default', () => {
    const rows = [{ symbol: 'A', score: 1 }, { symbol: 'B', score: 3 }, { symbol: 'C', score: 2 }];
    expect(sortScreeningRows(rows).map((r) => r.symbol)).toEqual(['B', 'C', 'A']);
  });
});

describe('getConfidenceLabel', () => {
  it('maps a high confidence to a label string', () => {
    expect(typeof getConfidenceLabel(0.9)).toBe('string');
  });
});
```
> 注:实现移植后,如旧函数签名/行为与上面断言不符,以**旧实现为准**调整断言(目标是锁住旧行为),但保留这三类函数的覆盖。
- [ ] **Step 2:** 运行 → 失败(模块缺失)。
- [ ] **Step 3:** 移植 `constants.ts` 和 `pricingResearch.ts`:把旧 JS 逐函数搬过来,加 TS 类型(参数/返回)。保持函数名、签名、行为一致。无 React/antd 依赖。
- [ ] **Step 4:** `npx vitest run src/features/pricing/lib/__tests__/pricingResearch.test.ts` → 通过;`npx tsc --noEmit` exit 0。
- [ ] **Step 5:** Commit:`feat(web): port pricing pure logic (constants + pricingResearch) to TS`

---

### Task 3: 纯逻辑移植 — 报告/导出

**参考源:** `frontend/src/utils/pricingResearchReport.js`、`frontend/src/utils/export.js`。
**Files:** `web/src/features/pricing/lib/report.ts`、`web/src/lib/export.ts`、`web/src/features/pricing/lib/__tests__/report.test.ts`

- [ ] **Step 1:** 写测试(先失败):`buildPricingResearchAuditPayload` 给定一个最小 analysis 对象,返回含 symbol/period/timestamp 的结构;`buildPricingResearchReportHtml` 返回包含标的代码的 HTML 字符串。
```ts
import { describe, it, expect } from 'vitest';
import { buildPricingResearchAuditPayload, buildPricingResearchReportHtml } from '@/features/pricing/lib/report';

const sample = { symbol: 'AAPL', period: '1y', gap: { gap_pct: -0.12 }, valuation: {}, factor_model: {} };

describe('report', () => {
  it('audit payload carries symbol + period', () => {
    const p = buildPricingResearchAuditPayload(sample as any);
    expect(p.symbol).toBe('AAPL');
    expect(p.period).toBe('1y');
  });
  it('report html includes the symbol', () => {
    expect(buildPricingResearchReportHtml(sample as any)).toContain('AAPL');
  });
});
```
> 以旧实现为准调整字段路径(旧函数读取的数据形状即权威)。
- [ ] **Step 2:** 运行 → 失败。
- [ ] **Step 3:** 移植 `export.ts`(`exportToJSON` 浏览器下载)+ `report.ts`(HTML 模板 + audit payload + `openPricingResearchPrintWindow`),转 TS。`window.open`/`Blob`/`URL.createObjectURL` 等浏览器 API 保留。
- [ ] **Step 4:** vitest 通过 + tsc exit 0。
- [ ] **Step 5:** Commit:`feat(web): port pricing report/export helpers to TS`

---

### Task 4: API 层 — pricing.ts + quantLab.ts

**参考源:** `frontend/src/services/api/pricing.js`、`frontend/src/services/api/quantLab.js`(只取估值/因子子集)。
**Files:** `web/src/services/api/pricing.ts`、`web/src/services/api/quantLab.ts`、`web/src/services/api/__tests__/pricing.test.ts`

- [ ] **Step 1:** 写测试(先失败):用 `vi.mock('@/services/api/core')` mock `api`,断言 `getGapAnalysis('AAPL','1y')` 调 `api.post` 且 url 为 `/pricing/gap-analysis`、`getPricingPeerComparison('AAPL',5)` 调 `api.get` 且 url 含 `/pricing/peers`。
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: {} });
const get = vi.fn().mockResolvedValue({ data: {} });
vi.mock('@/services/api/core', () => ({
  default: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  api: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  withTimeoutProfile: (_p: string, c: object = {}) => c,
}));
import { getGapAnalysis, getPricingPeerComparison } from '@/services/api/pricing';

describe('pricing api', () => {
  beforeEach(() => { post.mockClear(); get.mockClear(); });
  it('gap-analysis POSTs the right path', async () => {
    await getGapAnalysis('AAPL', '1y');
    expect(post.mock.calls[0][0]).toBe('/pricing/gap-analysis');
  });
  it('peers GETs the right path', async () => {
    await getPricingPeerComparison('AAPL', 5);
    expect(get.mock.calls[0][0]).toContain('/pricing/peers');
  });
});
```
- [ ] **Step 2:** 运行 → 失败。
- [ ] **Step 3:** 写 `pricing.ts`(6 个方法:gap-analysis、screener、symbol-suggestions、gap-history、peers、valuation-sensitivity)与 `quantLab.ts`(valuation-lab + factor-expression 各 sync/async),都用 `api` + `withTimeoutProfile`(screener 用 `analysis`)。响应类型尽量引用 `@/generated/api-types` 的 `paths[...]`,拿不准就先 `unknown` + 在卡片处窄化(不要用 `any`)。
- [ ] **Step 4:** vitest 通过 + tsc + lint exit 0。
- [ ] **Step 5:** Commit:`feat(web): pricing + quant-lab API methods (typed)`

---

### Task 5: 图表主题 — chartTheme + ChartFrame

**Files:** `web/src/features/pricing/lib/chartTheme.ts`、`web/src/features/pricing/components/ChartFrame.tsx`、`web/src/features/pricing/components/__tests__/ChartFrame.test.tsx`
**依赖:** `npm i recharts`(若未装)。

- [ ] **Step 1:** 写测试(先失败):`ChartFrame` 渲染传入的标题与 children。
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartFrame } from '@/features/pricing/components/ChartFrame';

describe('ChartFrame', () => {
  it('renders title and children', () => {
    render(<ChartFrame title="Gap 历史"><div>child</div></ChartFrame>);
    expect(screen.getByText('Gap 历史')).toBeInTheDocument();
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
```
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** `chartTheme.ts` 导出暗色台用的 axis/grid/tooltip 颜色常量(读 CSS 变量值或硬常量:grid `#2A2A33`、tick `#8E8E98`、line/bar 用 `#E2B23C`、涨 `#5FBF7E`/跌 `#E5685A`)。`ChartFrame` 是个 `Card` 包裹(标题 + `ResponsiveContainer` 容器),给图表统一外框。
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): Recharts dark theme + ChartFrame`

---

### Task 6: Hooks 移植(5 个 usePricing*)

**参考源:** `frontend/src/components/pricing/usePricing*.js`(共 5 个)。
**Files:** `web/src/features/pricing/hooks/{usePricingResearchData,usePricingSearch,usePricingScreening,usePricingAnalysisDetails,usePricingSensitivity}.ts` + 一个 `__tests__/usePricingScreening.test.tsx`

- [ ] **Step 1:** 写一个有意义的 hook 测试(先失败):用 `@testing-library/react` 的 `renderHook` 测 `usePricingScreening` 的过滤/状态(mock `runPricingScreener`),断言设置 universe 后 filteredResults 行为。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** 移植 5 个 hook 转 TS。**精简 `usePricingResearchData`**:保留 symbol/period/data/loading/error + URL 同步;**删掉**工作台 context 自动触发、queueResumeHint、playbook、workbench-actions 的接线(本期不做)。其余 hook 按旧逻辑移植,API 改用新 `@/services/api/pricing`。用标准 React hooks,类型化 state。
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): port pricing data hooks to TS (trimmed of workbench coupling)`

---

### Task 7: 子页外壳 + 路由(PricingLayout + Tabs)

**Files:** `web/src/routes/pricing/PricingLayout.tsx`、占位 `PricingAnalysisPage.tsx`/`ValuationLabPage.tsx`/`FactorLabPage.tsx`、改 `web/src/routes/router.tsx`、测试 `__tests__/PricingLayout.test.tsx`

- [ ] **Step 1:** 写测试(先失败):`PricingLayout` 在 MemoryRouter 下渲染三个子导航链接(分析/估值历史/自定义因子)。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** `PricingLayout`:顶部 shadcn `Tabs` 风格子导航(用 `NavLink` 到 `/pricing`、`/pricing/valuation`、`/pricing/factors`)+ `<Outlet/>`。三个页先放占位标题。改 `router.tsx`:把 `pricing` 路由改成带 children 的嵌套(index=分析,`valuation`、`factors` 子路由),`element` 用 `PricingLayout`。保留 P0 的懒加载与 `RequireAuth`。
- [ ] **Step 4:** vitest + tsc + lint + build 绿;确认 `/pricing/valuation` 等深链可解析(测试里用 MemoryRouter initialEntries 验证)。
- [ ] **Step 5:** Commit:`feat(web): pricing sub-page layout + nested routes`

---

### Task 8: 搜索面板 + 筛选器

**参考源:** `PricingSearchPanel.js`(188)、`PricingScreenerCard.js`(164)。
**Files:** `web/src/features/pricing/components/PricingSearchPanel.tsx`、`PricingScreenerCard.tsx` + 测试

- [ ] **Step 1:** 写测试(先失败):`PricingSearchPanel` 渲染输入框 + "开始分析"按钮,点按钮用输入的 symbol 调 `onAnalyze`;`PricingScreenerCard` 渲染 textarea + "批量筛选"按钮,点击调 `onRun`。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** 用 shadcn `Input`/`Select`/`Button`/`Card` 重建搜索面板(标的输入 + 周期选择 + 分析/导出按钮 + 热门标的 chips);用 `Card`/`Textarea`/`Select`/`Slider` + `DataTable` 重建筛选器(universe 文本框 + 预设 chips + 过滤下拉 + 结果表 via DataTable)。数据/回调走 props(由分析页的 hook 注入)。暗金 token。
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): pricing search panel + screener card`

---

### Task 9: 核心结果卡

**参考源:** `PricingModelCards.js`(FactorModelCard/ValuationCard)、`PricingOverviewSections.js`(Gap/History/Peer/Sensitivity)。**只做核心卡,不做洞察卡。**
**Files:** `web/src/features/pricing/components/{FactorModelCard,ValuationCard,GapOverviewCard,GapHistoryCard,PeerComparisonCard,SensitivityCard}.tsx` + 至少 2 个渲染测试(FactorModelCard、GapHistoryCard)

- [ ] **Step 1:** 写测试(先失败):给 `FactorModelCard` 喂一个最小 factor_model 对象,断言渲染出 CAPM/FF3 关键数字;`GapHistoryCard` 喂一段 gapHistory 数组,断言渲染容器(图表)。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** 逐卡重建(shadcn `Card` + Recharts via `ChartFrame` + 等宽数字 + 涨跌色)。数据读取路径以旧组件为准;对关键响应字段加窄 TS 类型。**按卡片拆分,别堆进一个文件。**
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): pricing core result cards (factor model / valuation / gap / peers / sensitivity)`

---

### Task 10: 分析页装配

**参考源:** `PricingResearch.js`(329)、`PricingResultsSection.js`(178)。
**Files:** `web/src/routes/pricing/PricingAnalysisPage.tsx`、`web/src/features/pricing/components/PricingResults.tsx` + 测试

- [ ] **Step 1:** 写测试(先失败):mock 各 hook,渲染 `PricingAnalysisPage`,断言无数据时显示空状态、有 `data` 时渲染 `PricingResults`(出现结果卡标题)。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** `PricingAnalysisPage`:用 `usePricingResearchData` 组合 → hero 条 + `PricingSearchPanel` + `PricingScreenerCard` + 加载骨架(`Skeleton`)+ 错误 `Alert` + `PricingResults`(把核心卡按旧 Row/Col 布局用 Tailwind grid 排)。`PricingResults` 接 data + 子数据(gapHistory/peers/sensitivity)做布局编排。
- [ ] **Step 4:** vitest + tsc + lint + build 绿。手动逻辑自检:空/加载/错误/有数据四态。
- [ ] **Step 5:** Commit:`feat(web): pricing analysis page (search → analyze → results)`

---

### Task 11: 估值历史子页(QuantLab 估值面板)

**参考源:** `QuantLabValuationPanel.js`(171)+ `useQuantLabForms` 里估值相关部分。
**Files:** `web/src/routes/pricing/ValuationLabPage.tsx`(+ 必要的小 hook `useValuationLab.ts`)+ 测试

- [ ] **Step 1:** 写测试(先失败):渲染页面,填 symbol,点"运行估值"调 `runQuantValuationLab`(mock),结果区渲染公允价值/gap/现价三卡。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** 重建:表单(symbol/period/peer_limit/peer_symbols)+ 同步"运行估值"按钮(async 排队作为可选,若实现就加;否则标 TODO 不阻塞)+ 结果(3 统计卡 + 模型权重表 + 估值历史表 + 同行矩阵表,用 `DataTable`)。API 走 `@/services/api/quantLab`。
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): valuation history sub-page (quant-lab valuation)`

---

### Task 12: 自定义因子子页(QuantLab 因子面板)

**参考源:** `QuantLabFactorPanel.js`(113)。
**Files:** `web/src/routes/pricing/FactorLabPage.tsx`(+ `useFactorLab.ts`)+ 测试

- [ ] **Step 1:** 写测试(先失败):渲染页面,默认表达式在 textarea 里,点"运行"调 `runQuantFactorExpression`(mock),结果区渲染 latest_value 等统计 + 因子预览表。
- [ ] **Step 2:** 失败。
- [ ] **Step 3:** 重建:表单(symbol/period/preview_rows/expression textarea,默认表达式同旧)+ 安全提示 `Alert`(白名单函数 rank/zscore/sma/ema/...)+ 同步"运行"+ 结果(3 统计 + 因子预览表 via DataTable)。API 走 quantLab。
- [ ] **Step 4:** vitest + tsc + lint 绿。
- [ ] **Step 5:** Commit:`feat(web): custom factor sub-page (quant-lab factor expression)`

---

### Task 13: P1 收尾门禁

- [ ] 全量:`cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`(真退出码,逐条绿)。
- [ ] 逻辑自检:`/pricing` 三子页切换;分析页四态;筛选器;估值/因子提交。
- [ ] 旧 `frontend/` 未改:`git diff main --name-only -- frontend/ | head`(应为空)。
- [ ] Commit(若有收尾改动):`chore(web): P1 pricing workspace polish + green gate`

---

## 自检(对照 spec)
- spec §3.1 纯逻辑 → T2/T3;§3.2 API → T4;§3.3 hooks → T6;§3.4 UI → T7–T12;§4 shadcn → T1;§5 图表 → T5;§6 测试 → 各任务 RTL + T13。
- 推迟项(洞察卡/playbook/工作台保存/alt-data)**未**出现在任何任务 —— 有意,符合 spec §1。
- 类型/命名一致性:`getGapAnalysis`/`runPricingScreener`/`getPricingPeerComparison` 等 API 名跨 T4/T6/T10 一致;`ChartFrame`/`DataTable` 复用。
