# 信号可信度层 · Signal Credibility Layer Design Spec

> 日期: 2026-06-08 · 状态: 已评审 · 范围: 错价信号的前瞻验证 + 可信度呈现(后端验证服务 + 排名记录 + 前端可信度面板)

## 1. 背景与目标

系统的核心输出是「错价分数 / 公允价值 / 偏差」,但**个股层面的信号从未被验证**:没有任何"模型说低估的票后续是否跑赢"的证据。宏观信号已有前瞻验证(`macro/factor-backtest`:hit-rate/IC vs SPY),但被埋在 API 里、未显性化。

**目标:** 建一层**诚实的可信度证据** —— 用 point-in-time 持久化信号 → 已实现远期收益,产出命中率/IC/校准等指标,显性呈现在 UI;让用户能判断"这个数字能不能信",而不是盲信。

**北极星:** 可信度来自**严谨**(零未来函数 + 样本量披露 + 校准),不是来自更多图表。宁可显示"样本不足、暂不可结论",绝不给虚假精度。

## 2. 核心原则(不可妥协)

- **只做 point-in-time 前瞻验证:** 信号在时刻 T 的值 → T→T+h 已实现收益。**绝不**用今天的基本面/公允价值回填历史日期(那是 look-ahead bias = 假回测)。
- **现有 `gap-history`(今日 FV vs 历史价)含未来函数 → 不作为验证依据**,仅作展示。
- **样本量与起始日期始终披露:** 每个指标随附 `sample_size` + `since_date`;低于阈值(默认 n<20)显式返回 `insufficient_data`,前端标"累积中 / 暂不可结论"。
- **数据随时间累积:** `valuation_history` 与 macro snapshots 是 point-in-time 记录,验证质量随使用增长。横截面排名从本功能起开始记录。

## 3. 范围 (Scope)

1. **个股错价信号前瞻验证(核心)** —— 复用 `valuation_history/{symbol}.json`(`quant_lab_valuation.py` 每次估值 append 的 point-in-time 记录:综合公允价值 + 现价 + 偏离 + 时间戳)+ 价格历史,算单标的信号→远期收益指标。
2. **宏观验证显性化** —— 复用既有 `macro/factor-backtest` 逻辑,接入统一可信度层 + GodEye 面板呈现(不重写验证逻辑)。
3. **横截面排名记录埋点** —— 从本功能起,筛选器每次运行持久化排名快照(point-in-time);累积够样本后算分位价差/截面 IC。现在样本不足时面板标"累积中"。

**非目标 (YAGNI / 诚实边界):**
- 不做基于历史基本面重算的"历史回测"(无 point-in-time 基本面 → 必然 look-ahead)。
- 不引交易成本/滑点建模(这是策略回测引擎的事,已存在)。
- 不改既有定价/估值/打分逻辑;只**观测**其输出。
- 不动既有 `backtest/` 策略引擎。

## 4. 指标 (Metrics) —— 均按 horizon {5, 20, 60} 交易日分组

定义于纯函数,逐个单测(已知输入 → 已知输出):

| 指标 | 定义 | 含义 |
|---|---|---|
| `hit_rate` | `mean( sign(signal) · sign(fwd_return) > 0 )` | 方向命中率 |
| `ic` | 信号值与远期收益的 **Spearman 秩相关** | 信号强弱的单调预测力 |
| `avg_fwd_return_long` / `_short` | 看多/看空分组的平均远期收益 | 方向化收益 |
| `calibration` | 把置信度分桶,每桶 `预测置信度` vs `实际命中率` | 置信度是否可信 |
| `quantile_spread`(横截面,样本够才出) | 顶十分位 − 底十分位 远期收益 | 选股排序有效性 |

每个指标结果对象统一含:`{ value, sample_size, since_date, status: "ok"|"insufficient_data" }`。

## 5. 组件 (Components)

### 5.1 后端
- **`backend/app/services/signal_validation.py`(新)** —— **纯函数模块**:输入 `(signal_points: list[{ts, signal, confidence?}], close_points, horizons)` → 指标对象。无 I/O、无全局状态 → 易测。包含:`compute_hit_rate`、`compute_ic`、`compute_directional_returns`、`compute_calibration`、`compute_quantile_spread`,以及编排函数 `validate_signal_series(...)`。复用/抽取 `macro.py:_find_forward_return` 到此模块共享。
- **`backend/app/services/screener_ranking_store.py`(新)** —— point-in-time 排名快照 store(JSON,文件锁,沿用 `MacroHistoryStore` 的 RLock 模式):`append_ranking(snapshot)` / `list_rankings(limit)`。
- **Endpoints(新,均同步 `def` → 线程池,守住 #105/#107 教训):**
  - `GET /pricing/signal-credibility?symbol=...&horizons=5,20,60` → 个股信号验证(读 `valuation_history/{symbol}.json` + 价格)。
  - `GET /macro/signal-credibility` → 复用宏观 factor-backtest,统一返回结构。
  - `GET /pricing/screener-credibility` → 横截面(读 ranking store;不足返回 `accumulating`)。
  - 筛选器运行处**附带**写 ranking 快照(在既有筛选 endpoint 内加一行持久化,不改其响应)。

### 5.2 前端
- **`frontend/src/features/credibility/`(新)** —— `CredibilityPanel`(命中率/IC/方向收益 + 样本量披露)、`CalibrationChart`(校准曲线,Recharts + GlassTooltip)、`CredibilityBadge`(一句话结论 + 样本量)。复用电影感原件(`MicroBar`/`Sparkline`/`Reveal`/`GlassPanel`/`SectionFrame`)。
- **挂载:** GodEye 挂宏观可信度;定价分析 + 估值实验室挂个股信号可信度;筛选器结果区挂横截面(累积中态)。
- **诚实呈现:** 样本不足时面板显示"📊 累积中 · 样本 N · 自 DATE",不显示误导性精确指标。

## 6. 数据流 (Data Flow)

1. 用户运行估值 → `quant_lab_valuation` append 一条 point-in-time 记录(已有行为)。
2. 用户运行筛选 → 既有 endpoint 额外写一条 ranking 快照(新)。
3. 可信度 endpoint(sync def → 线程池):读 point-in-time 信号序列 + 拉价格历史 → `signal_validation` 纯函数算指标 → 返回带样本量/状态的结果。
4. 前端 `CredibilityPanel` 渲染;样本不足走"累积中"态。

## 7. 错误处理 (Error Handling)

- 样本 < 阈值 → `status: insufficient_data`,前端"累积中"。
- 价格序列缺失 → `status: insufficient_market_data`(沿用宏观 backtest 既有态)。
- 信号时间戳与价格无法对齐(远期窗口越界)→ 该点跳过,计入有效样本统计。
- 验证 endpoint 异常 → 不影响主页面(面板独立降级,渲染空态)。

## 8. 测试 (Testing)

- **指标纯函数:** 逐个单测,已知输入 → 已知 hit_rate/IC/校准/分位;含边界(全同号、样本=阈值、空)。
- **Look-ahead 防护测试:** 构造"信号晚于价格窗口"场景,断言不泄露未来。
- **样本量门控测试:** n<阈值 → `insufficient_data`。
- **store:** ranking store append/list + 并发(RLock)测试。
- **endpoints:** TestClient 烟测 + 断言 sync `def`(扩 #105/#107 的 threadpool guard)。
- **前端:** CredibilityPanel/CalibrationChart 渲染 + 累积中态测试;现有 ~835 前端 + 后端全绿。
- **门禁:** `tsc/vitest/eslint/build` + `pytest` 全绿。

## 9. 验收标准 (Success Criteria)

- 个股 / 宏观 / 横截面三处可信度都有面板,**带样本量 + 起始日期披露**。
- 指标计算零未来函数(有防护测试佐证);样本不足诚实标"累积中"。
- 复用既有 point-in-time 数据 + `_find_forward_return` + 电影感原件,不重写定价/打分。
- 零功能回归;新老测试全绿;endpoints 同步 `def`(并发安全)。

## 10. 实现并行切分

- **轨道 A(后端验证核心):** `signal_validation.py` 纯函数 + 指标 TDD + 抽取 `_find_forward_return`。
- **轨道 B(后端记录 + 端点):** ranking store + 4 个 endpoints(sync def)+ 筛选器埋点 + threadpool guard。
- **轨道 C(前端可信度面板):** `features/credibility/*` + 三处挂载。**依赖 A/B 的响应 schema**(先定 schema 契约,再并行)。

## 11. 自检 (Self-check)

point-in-time 原则贯穿(防 look-ahead 有测试);样本量披露内建;复用既有数据/helper/原件而非重写;纯函数指标可独立测试;endpoints 同步 def 守并发教训;诚实边界(不做假历史回测)写进非目标。
