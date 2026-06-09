# 自选股错价报告导出 · Watchlist Mispricing Report Spec

> 日期: 2026-06-09 · 状态: 已评审通过 · 范围: Tier 3 工作流深化第二子项 —— 自选股错价报告**文件导出**(Scope A,用户已选)

## 1. 背景与目标
系统能算/能盯错价,但用户想把自选股的错价状态**带走/转发**(给同事、存档)。本功能在工作台一键生成一份**多标的「自选股错价报告」文件**(可打印转 PDF + CSV),把 Tier 3 串成 **自选股 → 错价告警 → 错价报告**。

## 2. 范围决策(已与用户对齐)
用户在 A/B/C/A+B 中选 **A:报告导出(文件)**。
- **做:** 客户端生成报告文件(打印转 PDF + CSV),可下载/转发。
- **不做(明确非目标):** 公开免登录链接、后端报告持久化、token 方案(安全面);引入 jsPDF(打印窗口已够,YAGNI);改信号/定价逻辑。

## 3. 内容
单页多标的报告:
- **页眉:** 标题「自选股错价报告」+ 生成时间 + 标的数 + 超阈值错价数(沿用当前告警规则的 threshold/direction 口径,若有规则)。
- **主表:** 代码 · 现价 · 公允价值 · 偏差%(gap_pct)· 方向(高估/低估)· 置信度 · 机会分。按 |gap%| 或机会分排序。
- **页脚诚实声明:** 方法论一句话 + 置信度/样本量口径(延续可信度工作)+ 「研究用途、非投资建议、无前视保证」。

## 4. 数据流(纯前端)
1. 取自选股 = 现成 preferences api(`realtime_preferences.symbols`)。
2. 跑 `POST /pricing/screener`(symbols=自选股),返回每标的 gap/公允价/置信/分(与告警同源 `analyze`,口径一致)。
3. 整形为报告行(复用 screener 行整形,见 `usePricingScreening.ts:215` 的 CSV 行逻辑)。
4. `buildWatchlistReportHtml(rows, meta)` 生成自包含 HTML 文档(复用 `report.ts` 的 `renderTable` + A4 `@page` 外壳 + 自动 `window.print()`)。
5. 导出:打印窗口(转 PDF)+ CSV 下载(复用 `lib/export.ts` 的 `exportToCSV`/Blob)。

## 5. 组件(隔离、可测)
- `frontend/src/features/reports/lib/watchlistReport.ts` —— `buildWatchlistReportHtml(rows, meta): string`(纯函数,返回 HTML)+ `buildWatchlistReportRows(screenerResults)`(整形)+ `buildWatchlistReportCsv(rows)`。无副作用,单测友好。
- `frontend/src/features/reports/hooks/useWatchlistReport.ts` —— 编排:取自选股 → 跑 screener → 整形 → 暴露 `generateAndPrint()` / `downloadCsv()` + loading/error/empty 态。
- 工作台落点:在告警面板旁加「导出自选股错价报告」区(按钮 + loading + 空自选股友好态)。复用 command 原件 + `report.ts` 的打印窗口。

## 6. 复用清单(几乎全现成)
`features/pricing/lib/report.ts`(renderTable + HTML 外壳 + 打印窗口)· `lib/export.ts`(CSV/Blob)· preferences api(自选股)· screener api(`POST /pricing/screener`)· command 原件。

## 7. 错误处理
- 空自选股 → 友好态(提示先加自选股),不跑 screener。
- screener 失败 → 错误态,不崩工作台。
- 弹窗被拦 → 回退导出 CSV(照搬 pricing 页 popup-block 回退)。
- screener 冷启动几十秒 → 明确 loading 态。

## 8. 测试
- `watchlistReport.ts` 纯函数:行整形(gap/方向/置信映射正确)、HTML 含页眉+每行+诚实声明、CSV 头与行正确、空行态。
- `useWatchlistReport`:取自选股→screener→整形 编排(mock api);空自选股态;screener 失败态。
- 保持现有工作台测试绿。

## 9. 验收
工作台一键生成多标的报告:打印窗口出 PDF + CSV 可下载;内容含页眉/主表/诚实声明;空自选股有友好态;**零后端、零公开面**;tsc/vitest/eslint/build 全绿。

## 10. 自检
范围严格 Scope A(用户已选,安全);纯前端、重复用现成机器;报告与告警同源信号(口径一致);诚实声明延续可信度工作;组件隔离纯函数可测;非目标明确(无公开链接/后端/jsPDF)。
