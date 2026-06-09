# 错价主动告警 · Proactive Mispricing Alerts Design Spec

> 日期: 2026-06-08 · 状态: 已评审 · 范围: Tier 3 工作流深化第一子项 —— 错价穿阈值主动告警(复用现有 watchlist/通知/调度/信号)

## 1. 背景与目标
系统能算错价,但用户得**主动来看**。本功能让用户对自选股设阈值,**错价穿阈值时主动通知**,把工具从"看一眼"变"持续盯"。核心是**集成**现有基建,不重复造。

**已存在可复用:**
- watchlist = `realtime_preferences.symbols`(每 profile,上限 `MAX_SUBSCRIBED_SYMBOLS`)。
- 投递 = `notification_service.send(channel, payload)`(webhook / 企业微信 / email)。
- 调度 = APScheduler `BackgroundScheduler`(见 `src/data/alternative/governance.py` 模式 + `runtime.py` 生命周期)。
- 信号 = `PricingGapAnalyzer.analyze(symbol).gap_pct` + 置信度(120s 缓存)。
- 去重模式 = `realtime_alerts.record_alert_hit`。

## 2. 核心原则
- **诚实** —— 只在**置信度 ≥ 阈值**时告警,不对低置信噪声开火(复用信号可信度)。错价符号沿用既有约定:`gap_pct>0 = 高估`。
- **安全** —— 告警**默认关闭 + dry-run 优先**(照搬每日简报的 dry-run);自动外发是用户显式配置+启用后才发。
- **纯函数评估** —— 触发判定是纯逻辑,独立单测。
- **不堵事件循环** —— 周期任务在后台线程(BackgroundScheduler),端点 sync def。

## 3. 范围(分两期)
**PR-1(本期,评估核心,无外发):**
1. `MispricingAlertStore` —— 每 profile 规则 + 触发历史(原子写 + 锁,复用 `atomic_json`)。规则:`{enabled, threshold_pct, direction: under|over|both, min_confidence, cooldown_hours, channels[]}`。
2. `mispricing_alert_evaluator`(纯函数)—— 输入 `(rule, readings: [{symbol, gap_pct, confidence}], last_fired: {symbol→iso}, now)` → `fires: [{symbol, gap_pct, confidence, direction}]`,遵守阈值/方向/最低置信/冷却。
3. 端点(sync def):`GET/PUT /alerts/mispricing/rule`(读/存规则)、`GET /alerts/mispricing/history`(近期触发)、`POST /alerts/mispricing/evaluate`(**dry-run:现在算一遍,返回 would-fire,不外发**)。

**PR-2(下期):** 周期调度任务(每 N 分钟评估自选股 → 命中 → 经 `notification_service` 外发 + 记录冷却)+ 前端面板(规则表单 + 近期触发,复用 command 原件)。

**非目标:** 不做可分享报告(Tier 3 另一子项,后续);不改信号/定价逻辑;只观测。

## 4. 触发逻辑(评估器,纯函数)
对每个 reading:
- `direction` 过滤:`under`→只看低估(gap_pct ≤ −threshold);`over`→只看高估(gap_pct ≥ +threshold);`both`→`|gap_pct| ≥ threshold`。
- `confidence` 门:`confidence ≥ min_confidence` 才算(None 视为不足 → 不触发,诚实)。
- `cooldown`:`now − last_fired[symbol] ≥ cooldown_hours` 才触发(否则抑制)。
- 输出命中列表 + 每个命中的方向标签(低估/高估)。

## 5. 组件 + 数据流
- 后端:`mispricing_alert_store.py`(store)+ `mispricing_alert_evaluator.py`(纯函数)+ `alerts.py` 端点(注册到 api router,sync def)。规则默认 `enabled=False`。
- `evaluate` 端点:读规则 → 读 watchlist(preferences symbols)→ 逐 symbol `analyzer.analyze(symbol)` 取 `gap_pct`+confidence → 评估器 → 返回 would-fire(**不发**)。
- PR-2:调度任务复用上面的 readings+评估器,命中走 `notification_service.send` + `store.record_fire`(写 last_fired)。

## 6. 错误处理
- 单 symbol analyze 失败 → 跳过该 symbol(不中断整批)。
- watchlist 空 / 规则 disabled → evaluate 返回空 + 状态说明。
- 端点异常 → 安全错误信封,不崩主流程。

## 7. 测试
- **评估器纯函数:** 阈值/方向(under/over/both)/最低置信(含 None)/冷却 逐项单测 + 边界。
- **store:** 读写规则 + record_fire + 并发(锁)+ 原子写。
- **端点:** TestClient 烟测 + dry-run 不外发断言 + sync-def 守卫(扩 threadpool guard)。

## 8. 验收
PR-1:规则可存取、dry-run 准确返回 would-fire(遵守阈值/方向/置信/冷却)、**零外发**、默认关闭、测试全绿、端点 sync def。

## 9. 自检
复用 watchlist/通知/调度/信号四大现成基建;评估纯函数可测;dry-run 优先 + 默认关闭(安全);诚实(置信门);分两期(评估核心先行,外发+前端后续)。
