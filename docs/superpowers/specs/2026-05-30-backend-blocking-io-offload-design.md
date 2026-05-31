# 后端 async 路由阻塞 IO 卸载 — 设计文档

- 日期: 2026-05-30
- 状态: 已确认设计,待实现
- 关联: 全项目评估报告 H1(高优先级)

## 1. 问题

部分 `async def` FastAPI 路由直接调用 `DataManager` 的同步数据方法(`get_historical_data` / `get_latest_price` / `get_market_indicators` 等)。这些方法在缓存未命中时会走真实网络 IO(`yf.Ticker()`、provider 抓取),**在 async 路由里同步执行会阻塞整个 worker 的事件循环**——缓存命中时无碍,但冷启动/缓存失效时单 worker 被卡住,所有并发请求排队。

项目里已存在两种正确范式:
- `backend/app/api/v1/endpoints/pricing.py:70` 用 `asyncio.to_thread`。
- `backend/app/api/v1/endpoints/analysis/routes.py:37,72,213` 已用 `run_in_threadpool`。

说明维护者已在做这件事,只是尚未覆盖全部路由。

## 2. 范围(亲自 grep + AST 核实)

**真正裸阻塞的数据调用:20 处,10 个文件**(已用双模式 `asyncio.to_thread|run_in_threadpool|run_in_executor` 排除已卸载的):

| 文件 | 裸调用行 | 备注 |
|---|---|---|
| analysis/routes.py | 112, 249, 276 | 另 37/72/213 已正确卸载,不动 |
| analysis/ml_prediction.py | 34, 66, 133, 154 | 另 98 已正确卸载,不动 |
| analysis/sentiment.py | 32, 62 | |
| analysis/risk_and_peers.py | 109, 141 | |
| analysis/correlation.py | 36 | |
| macro.py | 356, 438 | get_market_indicators + get_historical_data |
| optimization.py | 41+45 | for 循环逐 symbol 串行 |
| realtime.py | 142, 149 | if/else 两分支 |
| market_data.py | 36 | |
| trading.py | 44 | get_latest_price |

**不在范围**:`cross_market.py`、`system.py`(已全卸载或无裸数据调用);所有 `data_manager.get_xxx,`(逗号结尾、已作为参数传给卸载函数)的写法。

## 3. 标准(已确认)

- 卸载方式统一用 **`run_in_threadpool`**(`from starlette.concurrency import run_in_threadpool`),与 analysis 模块既有范式一致。
- optimization 的 for 循环:**整体抽成一个同步内部函数,一次性 `await run_in_threadpool(_fetch_all)`**,循环内串行逻辑不变(不并发化——并发是独立优化,且会放大对数据源的瞬时并发)。

## 4. 改法(机械、行为透明)

逐处把:
```python
data = data_manager.get_historical_data(symbol, ...)
```
改成:
```python
data = await run_in_threadpool(data_manager.get_historical_data, symbol, ...)
```
- 关键字参数照样透传(`run_in_threadpool` 支持 `*args, **kwargs`)。
- 每个被改文件顶部确保 import 存在(无则添加)。

**optimization.py 专项**:
```python
def _fetch_all():
    price_data = {}
    for symbol in symbols:
        df = data_manager.get_historical_data(symbol, start_date=start_date, end_date=end_date)
        if not df.empty:
            price_data[symbol] = df["close"]
        else:
            logger.warning(...)
    return price_data
price_data = await run_in_threadpool(_fetch_all)
```

## 5. 顺手清理(用户已确认,仅限本次会碰的文件)

- **optimization.py:32 死代码**:`start_date = end_date.replace(month=...)` 那行算出后立刻被下一行 `relativedelta` 覆盖,删除(连同误导性注释)。
- **异常 detail 脱敏**:把会碰到的端点里 `detail=str(e)` 改为脱敏常量/通用文案(参照 pricing.py 的 `PUBLIC_PRICING_ERROR_DETAIL`),原始异常仍 `logger.error(..., exc_info=True)`。范围仅限本次改动触及的文件(optimization.py、market_data.py 等),不扩大到全仓。

## 6. 关键约束

- **纯卸载,零业务逻辑改动**:返回结构、状态码、数据处理对客户端完全不变。
- 不改 `DataManager` 本身。
- 不改 `cross_market.py` / `system.py` 等已正确的文件。
- 不把模块级 `data_manager = DataManager()` 改成 DI 单例(那是评估里的 H6,独立的事,本次不碰)。

## 7. 测试策略(TDD)

并发行为难直接断言,采用三层:
1. **行为回归(主)**:对每个改过的端点用 `TestClient` 发请求,mock `data_manager` 的数据方法返回固定 DataFrame/dict,断言响应状态码与结构和改前一致——证明卸载没破坏契约。
2. **卸载断言(代表性)**:对至少 2 个端点(trend `/analyze`、`/optimize`),用记录调用线程的 mock(对比 `threading.get_ident()` 与主线程),断言数据方法在工作线程而非事件循环线程执行。
3. **真实冒烟**:起后端,实跑 1-2 个端点,确认 200 + 正常返回(A股 000001.SZ 走 tushare)。

## 8. 验收标准

- 新增卸载/回归测试全绿;现有 backend 测试套件无回归。
- 改过的 20 处全部经 `run_in_threadpool` 卸载(再次双模式扫描 = 0 裸调用)。
- 真实请求冒烟通过。
- `git diff` 确认无业务逻辑改动(除已确认的死代码删除 + detail 脱敏)。
