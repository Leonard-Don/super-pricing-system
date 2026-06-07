# 前端高级化 · 「作战大屏」设计语言 Design Spec

> 日期: 2026-06-07 · 状态: 待评审 · 范围: 前端视觉工艺升级(设计系统 + 旗舰页先行)

## 1. 背景与目标

当前 v5 前端是「干净、连贯、信息密度高的暗色仪表盘」,功能扎实,但停在"称职的 dashboard",
没到"高级/精品"一档。具体短板:关键数字无主角感、间距偏功能性、图表是 Recharts 默认款、
几乎无动效、金色用得平均、"作战大屏/指挥台"的叙事没有被视觉兑现。

**目标:** 把视觉工艺提升到电影感「**作战大屏 / Command Center**」的高级档,
**先建一层设计系统,再落到旗舰页**,其余页面通过继承 token 自动获得新底子。

**已确认的方向决策(brainstorming):**
- **气质 = B「作战大屏」** + **A「精密终端」的等宽 tabular 数字精度**。
- **范围/节奏 = 设计系统优先 + 旗舰页先行**(GodEye + 定价分析)。
- **密度策略 = 原地精修 + 建立焦点层**(保留信息密度,关键数字 hero 化、次要降噪,**不改交互**)。

## 2. 范围 (Scope)

**本 spec 覆盖:**
1. 设计系统 / token 层(颜色、字体、玻璃与发光、动效、图表主题)。
2. 一组核心原件(primitives)。
3. 落地到 **GodEye** 与 **定价分析(PricingAnalysisPage)** 两个旗舰页。

**不在本 spec(后续各自一份 spec):** 估值实验室、因子实验室、研究工作台、登录页的 bespoke 精修。
它们会**自动继承新 token**(颜色/字体/数字/玻璃),但专门的焦点层重排留到后续。

**非目标 (YAGNI):**
- 不重构信息架构 / 交互(原地精修)。
- 不引入重型动画/3D 库。
- 不做后端改动。

## 3. 设计语言 (Design Language)

所有 token 以 **Tailwind v4 `@theme`(CSS-first)+ CSS 变量**落到 `frontend/src/index.css`,
**扩展**现有 dark+amber 主题,不破坏 shadcn 语义 token。

### 3.1 颜色 (Color)
- **底色与指挥渐变:** 近黑 `#070709`;hero/区域底用径向渐变(近黑 → 深蓝炭 `#14213a` 左上辉光 + 右上金色辉光 `rgba(243,184,90,.10)`)。
- **玻璃面板:** `bg rgba(255,255,255,.035)` + `border rgba(255,255,255,.07)` + `backdrop-blur`。
- **主强调金:** `--amber #f3b85a`;**次强调蓝(指挥中心):** `--blue #6ea8ff`(克制使用,仅图表/状态点缀)。
- **语义:** `--pos #46c890` / `--neg #ff6f6f`(带微光阴影)。
- **文本梯:** `--ink #eef0f4` / `--ink2 #9aa3b2` / `--ink3 #5f6776`(偏冷灰,指挥感)。
- **焦点态:** 金色 1px ring + 柔性外发光阴影 `0 14px 40px -16px rgba(243,184,90,.32)`。

### 3.2 字体 (Typography)
- **拉丁标题/UI:** `Space Grotesk`(几何感、科技感),**自托管**(`@fontsource/space-grotesk`,不依赖 CDN,可离线)。
- **中文:** 系统栈 `PingFang SC / Microsoft YaHei`(不引 CJK 网络字体,避免体积)。
- **数据数字:** `JetBrains Mono`(自托管 `@fontsource/jetbrains-mono`),**全站数字一律 `tabular-nums` + `font-feature-settings:"tnum"`**,如终端般对齐。
- **字阶:** hero 38–56px / 区标 12px 字距 .2em 大写 / 正文 13–14px / 微标 10–11px 大写字距。

### 3.3 玻璃与发光 (Elevation & Glow)
- 玻璃面板(blur + 发丝边)为默认卡;**焦点卡**叠加金色渐变底 + ring + 外发光。
- hero 数字用 `白→金` 渐变 `background-clip:text` + `text-shadow` 微光。
- 发光柱/序列:金/蓝渐变柱 + `box-shadow` 光晕。

### 3.4 动效 (Motion budget)
克制、有手感,**全部尊重 `prefers-reduced-motion`(reduce 时关闭)**:
- 关键指标 mount 时**数字 count-up**(`useCountUp` 小 hook,~600ms,ease-out)。
- 面板**错峰淡入+上移**(stagger,~240ms)。
- hover/状态切换过渡(~150ms)。
- 图表 draw-in(Recharts 内置 `isAnimationActive`)。
- 实现:CSS keyframes + 一个 `useCountUp` hook + 一个 `prefers-reduced-motion` 守卫;**不引动画库**。

### 3.5 图表主题 (Recharts command theme)
统一深色指挥主题:发丝级网格、等宽 mono 坐标轴、金/蓝发光序列、去默认 chrome。
新增**共享图表主题模块** `frontend/src/components/command/chartTheme.ts`(网格/轴/序列/工具提示常量),
供现有 `frontend/src/features/pricing/components/ChartFrame.tsx` 与 GodEye 图表共用,避免主题重复。

## 4. 核心原件 (Primitives)

新建于 `frontend/src/components/command/`,每个**单一职责 + 明确 props + 配单测**:

| 原件 | 作用 | 关键 props |
|---|---|---|
| `StatPanel` | 玻璃指标卡,`focus` 变体为 hero 焦点卡 | `label, value, meta, focus?, tone?` |
| `DataNumber` | 等宽 tabular 数字,自动 pos/neg 着色 + 可选微光 | `value, sign?, glow?, format?` |
| `GlassPanel` | 通用玻璃容器(blur + 发丝边) | `children, className` |
| `SectionFrame` | `◢ 区标 + 渐隐分隔线`的指挥式区块头 | `title, latin?` |
| `GlowBars` | 发光柱序列(因子暴露/雷达替代展示) | `bars[], accent?` |
| `AlertBanner` | 警报条(语义色 + 微光 + 评分) | `title, text, score, tone` |
| `LiveStatus` | `● LIVE · 时间 · 8/8 ONLINE` 状态点 | `online, total, ts` |

(`useCountUp` hook 与上述并列,放 `frontend/src/components/command/useCountUp.ts`。)

## 5. 落地 (Application)

### 5.1 GodEye(旗舰)
- **Hero 区:** 指挥式 kick(`◢ 宏观错价指挥台 · GODEYE V2`)+ `作战大屏` 标题 + `LiveStatus`。
- **指标条:** 4 卡;**错价分数 `0.1686` 用 `StatPanel focus` hero 化**(金渐变发光),其余降噪为次级。
- **警报条:** `AlertBanner`(结构衰败 61%)。
- **战场扫描:** `SectionFrame` 区块头 + `GlowBars`(8 因子风险溢价)+ 精修瓦片 + 机会分小表(`DataNumber` tabular,pos/neg 语义色)。
- 既有的 7 区块结构保留,逐区套用 token/原件;**不改数据流与交互**。

### 5.2 定价分析(PricingAnalysisPage)
- **焦点层:** 把 `公允价值 / 偏差幅度 / 估值状态` 用 `StatPanel focus` + `DataNumber` hero 化置顶;
  长滚动里的次要卡降噪(弱化边框/字重)。
- 因子模型、同行对比表的所有数字走 `DataNumber` 等宽 tabular;图表套指挥主题。
- `SectionFrame` 统一区块头;**保留全部现有信息与交互**(原地精修)。

## 6. 技术方案 (Technical)

- **token:** `frontend/src/index.css` 的 `@theme` 扩展 + CSS 变量;不破坏 shadcn 语义 token,旧组件零改动即继承底色。
- **字体:** `@fontsource/space-grotesk` + `@fontsource/jetbrains-mono` 自托管;在入口 import;CJK 走系统栈。
- **原件:** `frontend/src/components/command/*`;Tailwind 工具类 + 少量 component CSS。
- **图表:** 新增 `command/chartTheme.ts` 共享主题常量,接入现有 `features/pricing/components/ChartFrame.tsx` 与 GodEye 图表。
- **动效:** CSS keyframes + `useCountUp` + reduced-motion 守卫。
- **TS strict / 无 `any` / shadcn 语义 token / text-pos·neg**,沿用现有工程约束。

## 7. 测试 (Testing)

- **每个原件:** RTL 单测(渲染值、`focus`/`pos`/`neg` 变体生效、tabular class 存在)。
- **`useCountUp`:** hook 单测(到达终值;reduced-motion 直接给终值)。
- **页面:** GodEye / 定价分析现有测试保持绿;对新增结构补关键断言。
- **可视化验证:** preview @1440 截图核对 hero/玻璃/发光/对齐;**零 console 报错**;`prefers-reduced-motion` 生效。
- **门禁:** `tsc --noEmit` / `vitest run` / `eslint .`(真退出码)/ `npm run build` 全绿。

## 8. 验收标准 (Success Criteria)

- GodEye 与定价分析肉眼"高级":hero 数字、玻璃/发光、等宽数字、焦点层、精修图表、克制动效。
- **零功能回归**;现有测试 + 新原件测试全绿;lint/build 绿。
- token 可复用 → 其余页面继承新底子(为后续 spec 铺路)。

## 9. 自检 (Self-check)

方向(B + A 数字)、范围(系统 + 旗舰)、密度(原地精修 + 焦点层)三项决策已编码进设计;
原件单一职责可独立测试;不改交互/数据流/后端;其余页面通过 token 继承,bespoke 留后续。
