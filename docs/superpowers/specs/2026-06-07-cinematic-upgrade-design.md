# 作战大屏 II · 电影感升级 Design Spec

> 日期: 2026-06-07 · 状态: 已评审 · 范围: 前端视觉精修第二波(动效 + 数据微可视化 + 图表精修 + 战术纹理)

## 1. 背景与目标

第一波(`#103`/`#104`)建立了「作战大屏」设计系统并落到全部 6 个界面 —— 玻璃面板、金色焦点卡、发丝网格图表、等宽 tabular 数字、◢ 区标。结果是**"截图里很高级,但用起来偏静止、偏平"**:动效几乎只有 GodEye 分数的 count-up,密集表格仍是纯数字墙,图表是换了色的 Recharts 默认款,"作战大屏"的叙事没有被纹理/生命感兑现。

**目标:** 把视觉工艺从"premium static"推到"premium alive + textured" —— 让界面**点亮有节奏、数据一眼读得出强弱、图表有质感、hero 有指挥台底纹**,同时**零功能回归、尊重 reduced-motion、纯外观**。

**已确认的方向决策(brainstorming + 可视化校准):**
- **浓度 = B 电影感指挥台**(纹理 + 纵深 + 脉冲 + 错峰入场 + 发光)。
- **密集数据 = B 内嵌量条**(数字 + 量条;带符号列用中线发散红绿条;时序列加迷你 sparkline)。
- **纹理 = A 战术网格 + C 角落雷达**(hero 蓝图细网格底 + 角落旋转雷达扫掠,均很淡、强度可调)。
- **范围/节奏 = 能力层优先 + 全量应用(旗舰先行)**。
- **强度基调 = 克制偏电影**(有手感,不眩晕、不掉帧、不伤可读性)。

## 2. 范围 (Scope)

**本 spec 覆盖:**
1. 动效编排能力层(错峰升入 + count-up 推广 + 图表 draw-in + LIVE 脉冲 + hover + shimmer),全程 reduced-motion 守卫。
2. 数据微可视化原件(内嵌量条 / 中线发散条 / sparkline)。
3. 图表精修(渐变填充、发光序列、玻璃化 tooltip、参考带),走共享 `chartTheme`。
4. 战术纹理原件(网格 + 角落雷达)。
5. **全量应用到 6 个界面**:GodEye、定价分析、估值实验室、因子实验室、研究工作台、登录页 —— **旗舰先行**(GodEye + 定价分析)验证,再推其余四页。

**非目标 (YAGNI):**
- 不改信息架构 / 交互 / 数据流 / 路由。
- 不引重型动画/3D 库(仅 CSS keyframes + 现有 `useCountUp` + 轻量 hooks)。
- 不做后端改动。
- 不重做第一波已建的 token/原件,只**扩展**。

## 3. 设计语言增量 (Design Language Delta)

在第一波 token 基础上**扩展**(`frontend/src/index.css`),不破坏 shadcn 语义 token:
- **纵深:** 焦点卡/hero 增加分层阴影(`0 14px 44px -18px var(--cmd-glow-amber)`),玻璃叠加更明确的层级。
- **指挥蓝 `--cmd-blue #6ea8ff`:** 用于纹理网格线、雷达环、图表次序列、状态点缀(克制)。
- **动效变量:** `--cmd-ease`(`cubic-bezier(.22,.61,.36,1)`)、`--cmd-rise`(进场位移量)、stagger 步长常量。
- **纹理变量:** 网格线色/间距、雷达环色 —— 便于统一调强度。

## 4. 动效编排 (Motion Choreography)

"指挥台点亮"序列,**全部用 transform/opacity(不触发 layout),并由 `prefers-reduced-motion` 守卫(reduce → 直接终值/静止)**:

| 动效 | 实现 | 说明 |
|---|---|---|
| 面板错峰升入 | `Reveal` 包裹器 + CSS keyframes | `opacity 0→1 + translateY(10px→0)`,~60ms 阶梯;reduce 时直接显示 |
| 焦点数字 count-up | 推广现有 `useCountUp` / `StatPanel animate` | 公允价值/偏差/分数/因子值等所有 hero 数;测试用全局 reduced-motion mock(已存在)给终值 |
| 图表 draw-in | Recharts `isAnimationActive` + 量条/sparkline 宽度过渡 | |
| LIVE 呼吸脉冲 | CSS keyframes(box-shadow 脉冲) | reduce 时静止亮点 |
| hover 抬升+辉光 | CSS transition(~150ms) | 卡片 `translateY(-2px)` + 辉光增强 |
| 加载 shimmer | `Skeleton` 原件 | 骨架屏替代空白/突现 |

**性能护栏:** 只动 transform/opacity;入场动画用 `animation-fill-mode:forwards` 一次性;雷达/脉冲为低频持续动画,reduce 时停。

## 5. 数据微可视化 (Data Micro-viz)

`MicroBar` / `DataCell` 原件族,推广到同行矩阵、筛选结果、因子预览、估值历史、DCF 情景、机会分小表等所有数据墙:
- **内嵌量条:** 等宽数字 + 其下/侧迷你比例条(金→绿渐变)。
- **中线发散条:** 带符号列(溢折价、Alpha 等)从中线向左(红/neg)/右(绿/pos)发散。
- **迷你 sparkline:** 有时间序列的列(估值历史)显示趋势走势。
- 数值文本**始终保留**(读数不丢),量条是叠加的视觉增强。

## 6. 图表精修 (Chart Refinement)

统一经共享 `frontend/src/features/pricing/lib/chartTheme.ts`(已是 `commandChartTheme` 单一来源)增强:
- 面积图**渐变填充**(序列色 → 透明)。
- 活跃序列**发光描边**(`drop-shadow`)。
- **玻璃化自定义 tooltip**(替代默认 chrome,与玻璃面板一致)。
- **参考带/区间着色**(公允价值区间、情景区间)。
- 受益最大:DCF 面积图、Monte Carlo 分布、因子暴露柱、风险溢价雷达。

## 7. 战术纹理 (Tactical Texture)

`TacticalBackdrop` 原件(绝对定位、`pointer-events:none`、顶部 mask 渐隐):
- **网格层:** 极淡蓝图细网格(`--cmd-blue` 低透明)。
- **角落雷达层:** 角落同心环 + 旋转扫掠(conic-gradient + spin,reduce 时停转)。
- props 控制强度/开关;仅用于 hero 与区块顶部,**不进数据密集区**(保可读性)。

## 8. 新增/增强原件 (Primitives)

新建于 `frontend/src/components/command/`,每个单一职责 + 明确 props + 单测:

| 原件 | 作用 | 关键 props |
|---|---|---|
| `Reveal` | 错峰升入包裹器(CSS,reduced-motion 直接显示) | `delay?, as?, children` |
| `MicroBar` | 内嵌量条单元格(+ 中线发散变体) | `value, max?, diverging?, tone?` |
| `Sparkline` | 迷你趋势线 | `points[], tone?` |
| `TacticalBackdrop` | 网格 + 角落雷达底纹 | `grid?, radar?, intensity?` |
| `Skeleton` | shimmer 骨架屏 | `w?, h?, rounded?` |
| (增强) `ChartFrame`/图表 | 渐变/发光/玻璃 tooltip/参考带 | — |
| (推广) `useCountUp`/`StatPanel animate` | 所有 hero 数字 | — |

## 9. 应用 (Application) —— 旗舰先行

1. **GodEye(旗舰):** hero 套 `TacticalBackdrop`(网格+雷达),分数/各 stat `count-up`,区块 `Reveal` 错峰,机会分小表 `MicroBar`,雷达/图表精修,加载 `Skeleton`。
2. **定价分析(旗舰):** 焦点卡 count-up,同行/因子表 `MicroBar`+sparkline,DCF/Monte Carlo/因子图精修,`Reveal` 错峰。
3. **其余四页(估值/因子/工作台/登录):** 表格 `MicroBar`、焦点数 count-up、区块 `Reveal`、登录 hero `TacticalBackdrop`、加载 `Skeleton`。

**全程纯外观:不改 hooks/数据流/props 契约/交互/后端。**

## 10. 技术 + 约束 (Technical & Constraints)

- token/动效/纹理变量落 `index.css` `@theme` 扩展;不破坏 shadcn 语义 token。
- 仅 CSS keyframes + 现有 `useCountUp` + 轻量包裹 hooks;不引动画库。
- **`prefers-reduced-motion` 守卫无处不在**(已有全局测试 mock 给终值);只动 transform/opacity。
- TS strict / 无 `any` / shadcn 语义 token / `text-pos·neg` / 无重复 React key。

## 11. 测试 (Testing)

- **每个新原件:** RTL 单测(渲染、变体生效、tabular/比例 class 存在)。
- **reduced-motion:** 原件在 reduce 下直接显示/静止/给终值的测试。
- **页面:** 6 页现有测试保持绿(~820);对新结构补关键断言;数值文本断言不被微可视化破坏。
- **可视化验证:** preview @1440 截图核对点亮序列/纹理/微可视化/图表;**零 console**;reduced-motion 生效。
- **门禁:** `tsc --noEmit` / `vitest run` / `eslint .`(真退出码)/ `npm run build` 全绿。

## 12. 验收标准 (Success Criteria)

- 进任一页是**有节奏的"指挥台点亮"**(reduce 下瞬时静态);hero 有战术底纹 + 角落雷达。
- 密集表格**一眼读出强弱**(内嵌量条/发散条/sparkline),且精确数值仍在。
- 图表有渐变/发光/玻璃 tooltip 质感。
- **零功能回归**;现有 + 新原件测试全绿;lint/build 绿;零 console 报错。

## 13. 自检 (Self-check)

四项可视化决策(浓度 B / 微可视化 B / 纹理 A+C / 全量旗舰先行)已编码进设计;原件单一职责可独立测试;reduced-motion 守卫贯穿;不改交互/数据流/后端;扩展而非重做第一波。
