# 后端阻塞 IO 卸载 — 实现计划

> 配合设计文档 `2026-05-30-backend-blocking-io-offload-design.md`。TDD,机械卸载,行为透明。

**Goal:** 把 20 处裸同步 DataManager 调用(10 文件)卸载到 `run_in_threadpool`,不阻塞事件循环。

**Architecture:** 逐 call-site 包 `await run_in_threadpool(fn, *args, **kwargs)`;optimization 循环整体抽函数卸载;2 处确认清理。

**Tech Stack:** FastAPI / Starlette `run_in_threadpool` / pytest + TestClient。

---

## 关键 TDD 杠杆:卸载断言测试

核心可测点:**裸同步调用在事件循环线程执行;卸载后在工作线程执行**。用记录 `threading.get_ident()` 的 mock 即可区分。

### Task 1: 写卸载断言测试(代表性端点 trend `/analyze`)

**Files:**
- Test: `tests/unit/test_endpoint_offload.py`(新建)

- [ ] **Step 1: 写失败测试**

```python
import threading
import pandas as pd
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app

def _loop_thread_id_capture():
    """返回 (mock_fn, captured) — mock 记录被调用时所在线程 id。"""
    captured = {}
    def fake_get_historical_data(*args, **kwargs):
        captured["thread_id"] = threading.get_ident()
        return pd.DataFrame({
            "open":[1.0],"high":[1.0],"low":[1.0],"close":[1.0],"volume":[1],
        }, index=pd.to_datetime(["2026-05-28"]))
    return fake_get_historical_data, captured

def test_trend_analyze_offloads_data_fetch_to_worker_thread():
    client = TestClient(app)
    main_loop_id = {}
    # 捕获事件循环所在线程:在一个无卸载的轻量路由里记录,或用 /health 钩子
    fake, captured = _loop_thread_id_capture()
    with patch("backend.app.api.v1.endpoints.analysis._helpers.data_manager.get_historical_data", fake):
        # 先拿到事件循环线程 id:patch 一个同步执行的点
        import asyncio
        resp = client.post("/analysis/analyze", json={"symbol":"AAPL","interval":"1d"})
    assert resp.status_code == 200
    # 事件循环线程 id:TestClient 在独立线程跑 loop;断言数据调用不在该 loop 线程
    # 用对照:另起一个已知在 loop 线程执行的探针
    assert "thread_id" in captured
    # 卸载后 worker 线程 != TestClient 的 loop 线程(下方 Task 验证转换)
```

> 注:精确"loop 线程 id"对照较繁琐。改用更稳的判定见 Step 2。

- [ ] **Step 2: 改用稳健判定 — 主线程对照**

TestClient 默认在**调用方线程**用 portal 跑 loop,故事件循环跑在主线程(pytest 主线程)。`run_in_threadpool` 必把调用派发到 anyio 工作线程(线程名 `AnyIO worker` 或 id != 主线程)。判定:

```python
def test_trend_analyze_offloads_data_fetch_to_worker_thread():
    main_id = threading.get_ident()  # pytest 主线程
    client = TestClient(app)
    fake, captured = _loop_thread_id_capture()
    with patch("backend.app.api.v1.endpoints.analysis._helpers.data_manager.get_historical_data", fake):
        resp = client.post("/analysis/analyze", json={"symbol":"AAPL","interval":"1d"})
    assert resp.status_code == 200
    assert captured["thread_id"] != main_id, "数据调用应在工作线程,而非事件循环主线程"
```

- [ ] **Step 3: 跑测试确认当前状态**

Run: `python3 -m pytest tests/unit/test_endpoint_offload.py -x -p no:cacheprovider`
Expected: 注意 — analysis/routes.py:37 的 `/analyze` **已经**用 run_in_threadpool,故此测试应 **PASS**。这是"已有正确范式"的基线锚点。
若 PASS → 证明判定方法正确;接着对一个**未卸载**端点(如 `/analysis/sentiment` 或 `/optimize`)写同样测试,它应 **FAIL**(红)。

- [ ] **Step 4: 对未卸载端点写红测试**

```python
def test_sentiment_history_offloads_data_fetch_to_worker_thread():
    main_id = threading.get_ident()
    client = TestClient(app)
    fake, captured = _loop_thread_id_capture()
    with patch("backend.app.api.v1.endpoints.analysis._helpers.data_manager.get_historical_data", fake):
        resp = client.post("/analysis/sentiment", json={"symbol":"AAPL","interval":"1d"})
    assert resp.status_code == 200
    assert captured["thread_id"] != main_id, "sentiment 数据调用应在工作线程"
```
Run 上面命令。Expected: **FAIL**(sentiment.py:32 当前是裸同步调用,在主线程执行 → thread_id == main_id)。

---

## Task 2: 逐文件卸载(绿)

对每个文件每处裸调用应用变换。每文件改完跑一次相关测试。

**变换规则:**
```python
# before
data = data_manager.get_historical_data(symbol, start, end, interval)
# after
from starlette.concurrency import run_in_threadpool  # 文件顶部
data = await run_in_threadpool(data_manager.get_historical_data, symbol, start, end, interval)
```

按文件清单(设计 §2):
- [ ] **2a** analysis/sentiment.py:32,62 → 改完跑 Task1 Step4 测试,应转 **PASS**
- [ ] **2b** analysis/correlation.py:36
- [ ] **2c** analysis/risk_and_peers.py:109,141
- [ ] **2d** analysis/ml_prediction.py:34,66,133,154
- [ ] **2e** analysis/routes.py:112,249,276
- [ ] **2f** macro.py:356(get_market_indicators),438(get_historical_data)
- [ ] **2g** realtime.py:142,149(if/else 两分支)
- [ ] **2h** market_data.py:36
- [ ] **2i** trading.py:44(get_latest_price)
- [ ] **2j** optimization.py:41+45 → 抽 `_fetch_all()` 同步函数,一次 `await run_in_threadpool(_fetch_all)`

每改一处确保该文件已 import `run_in_threadpool`。

- [ ] **Step 末: 双模式重扫验证 0 裸调用**

Run:
```bash
python3 - <<'PY'
import re, pathlib
base = pathlib.Path("backend/app/api/v1/endpoints")
files = ["analysis/correlation","analysis/ml_prediction","analysis/risk_and_peers",
         "analysis/routes","analysis/sentiment","macro","market_data",
         "optimization","realtime","trading"]
DATA = re.compile(r"\.(get_historical_data|get_latest_quote|get_latest_price|get_realtime_quote|get_multiple_quotes|get_market_indicators)\b")
OFF = re.compile(r"asyncio\.to_thread|run_in_threadpool|run_in_executor")
bad=0
for f in files:
    lines=(base/f"{f}.py").read_text().splitlines()
    for i,l in enumerate(lines):
        if DATA.search(l) and not OFF.search("".join(lines[max(0,i-3):i+1])):
            print(f"BARE {f}:{i+1}: {l.strip()}"); bad+=1
print("REMAINING_BARE", bad)
PY
```
Expected: `REMAINING_BARE 0`

---

## Task 3: 确认的清理

- [ ] **3a** optimization.py:32 删死代码(被下一行 relativedelta 覆盖的 start_date 行 + 误导注释)
- [ ] **3b** detail 脱敏:本次改动触及的文件里 `detail=str(e)` → 通用文案(如 `"内部错误,请稍后重试"`),保留 `logger.error(..., exc_info=True)`。范围仅 optimization.py:73、market_data.py:63 等本次会碰到的。

---

## Task 4: 验证

- [ ] **4a** 新测试全绿:`python3 -m pytest tests/unit/test_endpoint_offload.py -p no:cacheprovider`
- [ ] **4b** 回归:`python3 -m pytest tests/unit/ -p no:cacheprovider -q`(无新失败)
- [ ] **4c** 语法/import 健全:`python3 -c "import backend.main"`(PYTHONPATH=根)
- [ ] **4d** 真实冒烟:起后端,POST /analysis/analyze {symbol:000001.SZ} → 200
- [ ] **4e** `git diff` 复核:无业务逻辑改动(只有 await/run_in_threadpool 包裹 + 确认的清理)

## 验收
- 20 处全卸载(重扫 = 0)、新测试 + 全量回归绿、冒烟 200、diff 干净。
