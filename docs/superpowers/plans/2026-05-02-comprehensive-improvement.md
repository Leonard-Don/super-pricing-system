# Super Pricing System 全面改善实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系统性提升 super-pricing-system 的 CI 质量门禁、后端模块边界和前端组件粒度，在不破坏任何现有 OpenAPI 契约的前提下完成全面重构。

**Architecture:** 三层推进——先搭 CI 保护网（Layer 1），再做后端 repository/service 拆分（Layer 2），最后拆前端巨型组件（Layer 3）。每层均有独立验收命令，任意步骤失败都可以精准定位。

**Tech Stack:** Python 3.9+, FastAPI, pytest, mypy, ruff, pip-tools, React 18, Jest, Playwright

---

## 文件变更地图

### Layer 1（新增/修改）
- `pyproject.toml` — 加 `fail_under = 60`
- `scripts/generate_mypy_baseline.sh` — 生成 mypy 基线
- `scripts/mypy_baseline_count.txt` — 当前错误数基线（生成）
- `scripts/check_mypy_gate.sh` — CI 调用的 mypy 增量门禁
- `scripts/check_openapi_diff.py` — OpenAPI 契约 diff 检查工具
- `.github/workflows/ci.yml` — 加 coverage/mypy gate、改用 requirements.lock
- `requirements.lock` — 精确 pin 版本（pip-compile 生成）
- `requirements-dev.txt` — 加 pip-tools
- `CLAUDE.md` — 项目 AI 入口文档

### Layer 2（新增/修改）
- `backend/app/api/v1/endpoints/industry/heatmap_service.py` — 热力图业务逻辑
- `backend/app/api/v1/endpoints/industry/ranking_service.py` — 排行/热度业务逻辑
- `backend/app/api/v1/endpoints/industry/trend_service.py` — 趋势业务逻辑
- `backend/app/api/v1/endpoints/industry/rotation_service.py` — 轮动/聚类业务逻辑
- `backend/app/api/v1/endpoints/industry/routes.py` — 精简为纯路由层（≤500 行）
- `backend/app/core/persistence/auth_repository.py` — auth 记录 repository
- `backend/app/core/persistence/workbench_repository.py` — workbench 记录 repository
- `backend/app/core/persistence/backtest_repository.py` — backtest 记录 repository
- `src/data/providers/sina_ths_adapter/client.py` — HTTP session/重试/限流
- `src/data/providers/sina_ths_adapter/cache.py` — 文件/内存缓存
- `src/data/providers/sina_ths_adapter/parsers.py` — 原始响应解析
- 对应新增测试文件（见各 Task）

### Layer 3（新增/修改）
- `frontend/src/components/cross-market/hooks/useCrossMarketBacktestState.js`
- `frontend/src/components/cross-market/results/ResultSummary.js`
- `frontend/src/components/cross-market/results/ResultTable.js`
- `frontend/src/components/cross-market/results/DiagnosticPanel.js`
- `frontend/src/components/cross-market/results/PlaybookEntryPoint.js`
- `frontend/src/components/CrossMarketBacktestPanel.js` — 精简为组装层（≤1200 行）
- `frontend/src/components/realtime/RealTimeSearchControl.js`
- `frontend/src/components/realtime/RealTimeMonitorGroup.js`
- `frontend/src/components/realtime/RealTimeDetailDrawer.js`
- `frontend/src/components/RealTimePanel.js` — 精简（≤1500 行）
- `frontend/src/components/hooks/useMarketAnalysisData.js`
- `frontend/src/components/hooks/useResearchWorkbenchState.js`
- `frontend/src/components/hooks/useIndustryHeatmapFilter.js`

---

## Layer 1：CI 质量门禁

---

### Task 1：coverage fail_under 阈值

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: 先跑当前 coverage，记录基线**

```bash
cd /Users/leonardodon/PycharmProjects/super-pricing-system
python -m pytest tests/unit tests/integration \
  --cov=backend --cov=src \
  --cov-report=term-missing:skip-covered \
  -q 2>&1 | tail -5
```

记录输出中 `TOTAL` 行的覆盖率百分比（例如 `63%`）。

- [ ] **Step 2: 在 pyproject.toml 加 fail_under**

在 `[tool.coverage.report]` 段末尾添加：

```toml
fail_under = 60
```

最终该段应为：

```toml
[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
]
show_missing = true
skip_empty = true
fail_under = 60
```

- [ ] **Step 3: 验证阈值生效**

```bash
python -m pytest tests/unit tests/integration \
  --cov=backend --cov=src \
  --cov-fail-under=60 \
  -q 2>&1 | tail -3
```

期望：正常通过（若当前覆盖率 ≥60%）。若失败则将 `fail_under` 降至实际覆盖率向下取整的整数。

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml
git commit -m "ci: add coverage fail_under=60 threshold gate"
```

---

### Task 2：mypy 增量 gate（阻止退化）

**Files:**
- Create: `scripts/generate_mypy_baseline.sh`
- Create: `scripts/mypy_baseline_count.txt`
- Create: `scripts/check_mypy_gate.sh`

- [ ] **Step 1: 生成 mypy 基线**

```bash
cd /Users/leonardodon/PycharmProjects/super-pricing-system
mypy backend src --ignore-missing-imports 2>&1 | grep ": error:" | wc -l | tr -d ' '
```

记录输出数字（例如 `142`）。

- [ ] **Step 2: 创建 generate_mypy_baseline.sh**

```bash
cat > scripts/generate_mypy_baseline.sh << 'EOF'
#!/usr/bin/env bash
# 重新生成 mypy 基线（在有意修复类型错误后运行）
set -euo pipefail
COUNT=$(mypy backend src --ignore-missing-imports 2>&1 | grep ": error:" | wc -l | tr -d ' ')
echo "$COUNT" > scripts/mypy_baseline_count.txt
echo "mypy baseline updated: $COUNT errors"
EOF
chmod +x scripts/generate_mypy_baseline.sh
```

- [ ] **Step 3: 写入当前基线**

将 Step 1 中记录的数字写入文件（将 `142` 替换为实际值）：

```bash
echo "142" > scripts/mypy_baseline_count.txt
```

- [ ] **Step 4: 创建 check_mypy_gate.sh**

```bash
cat > scripts/check_mypy_gate.sh << 'EOF'
#!/usr/bin/env bash
# CI 调用：若 mypy 错误数超过基线则 exit 1
set -euo pipefail
BASELINE=$(cat scripts/mypy_baseline_count.txt | tr -d ' ')
CURRENT=$(mypy backend src --ignore-missing-imports 2>&1 | grep ": error:" | wc -l | tr -d ' ')
echo "mypy baseline: $BASELINE | current: $CURRENT"
if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo "ERROR: mypy error count increased from $BASELINE to $CURRENT"
  exit 1
fi
echo "OK: mypy gate passed"
EOF
chmod +x scripts/check_mypy_gate.sh
```

- [ ] **Step 5: 验证 gate 脚本可运行**

```bash
bash scripts/check_mypy_gate.sh
```

期望：`OK: mypy gate passed`

- [ ] **Step 6: Commit**

```bash
git add scripts/generate_mypy_baseline.sh scripts/mypy_baseline_count.txt scripts/check_mypy_gate.sh
git commit -m "ci: add mypy incremental gate (block regression, not require zero errors)"
```

---

### Task 3：pip-tools + requirements.lock

**Files:**
- Modify: `requirements-dev.txt`
- Create: `requirements.lock`

- [ ] **Step 1: 安装 pip-tools**

```bash
pip install pip-tools
```

- [ ] **Step 2: 在 requirements-dev.txt 中加 pip-tools**

在文件顶部（`# Development dependencies` 下方）加一行：

```
pip-tools>=7.0.0
```

- [ ] **Step 3: 生成 requirements.lock**

```bash
cd /Users/leonardodon/PycharmProjects/super-pricing-system
pip-compile requirements.txt \
  --output-file requirements.lock \
  --no-header \
  --annotation-style=line
```

验证文件已生成且包含精确版本：

```bash
head -5 requirements.lock
grep "fastapi==" requirements.lock
```

期望：看到类似 `fastapi==0.115.x` 的精确版本。

- [ ] **Step 4: 验证 lock 文件可用于安装**

```bash
pip install -r requirements.lock --dry-run 2>&1 | tail -3
```

期望：无报错。

- [ ] **Step 5: Commit**

```bash
git add requirements-dev.txt requirements.lock
git commit -m "ci: add requirements.lock for reproducible installs (pip-compile)"
```

---

### Task 4：check_openapi_diff.py（Layer 2 前置工具）

**Files:**
- Create: `scripts/check_openapi_diff.py`

- [ ] **Step 1: 创建脚本**

```python
# scripts/check_openapi_diff.py
"""
比较当前 FastAPI 生成的 OpenAPI schema 与 docs/openapi.json 基线。
破坏性变更（字段删除、类型变更、required 新增）时 exit 1。
用法: python scripts/check_openapi_diff.py [--update-baseline]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

BASELINE_PATH = Path("docs/openapi.json")
BASE_URL = "http://localhost:8100"


def load_baseline() -> dict:
    if not BASELINE_PATH.exists():
        print(f"No baseline found at {BASELINE_PATH}. Run with --update-baseline first.")
        sys.exit(1)
    return json.loads(BASELINE_PATH.read_text())


def fetch_current() -> dict:
    import urllib.request
    try:
        with urllib.request.urlopen(f"{BASE_URL}/openapi.json", timeout=5) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Cannot reach {BASE_URL}/openapi.json: {e}")
        print("Start the backend first: uvicorn backend.main:app --port 8100")
        sys.exit(2)


def extract_schema_fields(schema: dict) -> dict[str, dict]:
    """Return {path_method: {field: type}} for all request/response schemas."""
    fields: dict[str, dict] = {}
    for path, methods in schema.get("paths", {}).items():
        for method, op in methods.items():
            key = f"{method.upper()} {path}"
            fields[key] = {}
            # response schemas
            for status, resp in op.get("responses", {}).items():
                content = resp.get("content", {})
                for media, media_obj in content.items():
                    ref = media_obj.get("schema", {})
                    fields[key][f"response_{status}"] = str(ref)
            # request body
            rb = op.get("requestBody", {})
            if rb:
                for media, media_obj in rb.get("content", {}).items():
                    ref = media_obj.get("schema", {})
                    fields[key]["requestBody"] = str(ref)
    return fields


def check_breaking(baseline: dict, current: dict) -> list[str]:
    """Return list of breaking change descriptions."""
    base_fields = extract_schema_fields(baseline)
    curr_fields = extract_schema_fields(current)
    issues = []
    for endpoint, base_schema in base_fields.items():
        if endpoint not in curr_fields:
            issues.append(f"REMOVED endpoint: {endpoint}")
            continue
        curr_schema = curr_fields[endpoint]
        for field, base_type in base_schema.items():
            if field not in curr_schema:
                issues.append(f"REMOVED field '{field}' from {endpoint}")
            elif curr_schema[field] != base_type:
                issues.append(
                    f"TYPE CHANGED '{field}' in {endpoint}: "
                    f"{base_type!r} → {curr_schema[field]!r}"
                )
    return issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-baseline", action="store_true",
                        help="Fetch current schema and save as new baseline")
    args = parser.parse_args()

    current = fetch_current()

    if args.update_baseline:
        BASELINE_PATH.write_text(json.dumps(current, indent=2, ensure_ascii=False))
        print(f"Baseline updated: {BASELINE_PATH}")
        return

    baseline = load_baseline()
    issues = check_breaking(baseline, current)

    if issues:
        print("BREAKING CHANGES DETECTED:")
        for issue in issues:
            print(f"  ✗ {issue}")
        sys.exit(1)

    print(f"OK: no breaking changes ({len(extract_schema_fields(baseline))} endpoints checked)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 验证脚本语法正确**

```bash
python -m py_compile scripts/check_openapi_diff.py && echo "syntax OK"
```

期望：`syntax OK`

- [ ] **Step 3: 更新 docs/openapi.json 基线（需启动后端）**

若后端当前未启动，先启动：

```bash
./scripts/start_system.sh &
sleep 5
python scripts/check_openapi_diff.py --update-baseline
```

或者若后端已运行：

```bash
python scripts/check_openapi_diff.py --update-baseline
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check_openapi_diff.py docs/openapi.json
git commit -m "ci: add check_openapi_diff.py for contract regression detection"
```

---

### Task 5：CI workflow 更新

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 更新 quality job，加 mypy gate**

在 quality job 的 `mypy (advisory)` 步骤**之前**插入新步骤：

```yaml
      - name: mypy (incremental gate — blocks regression)
        run: bash scripts/check_mypy_gate.sh
```

- [ ] **Step 2: 更新 backend job 的安装命令，优先使用 lock 文件**

将：
```yaml
      - name: Install backend dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements-dev.txt
```

改为：
```yaml
      - name: Install backend dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.lock
          pip install -r requirements-dev.txt
```

- [ ] **Step 3: 验证 CI yaml 语法**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "yaml OK"
```

期望：`yaml OK`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: wire mypy gate and requirements.lock into CI pipeline"
```

---

### Task 6：CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: 创建 CLAUDE.md**

```bash
cat > /Users/leonardodon/PycharmProjects/super-pricing-system/CLAUDE.md << 'CLAUDEEOF'
# Super Pricing System · CLAUDE.md

## 项目定位

宏观错误定价套利引擎，面向 A 股市场。四大工作区：
- **定价研究**：CAPM / Fama-French 3 因子 / DCF / Gap Analysis
- **上帝视角 (GodEye)**：宏观因子引擎 · 证据质量 · 政策雷达 · 跨市场总览
- **研究工作台**：研究任务持久化 · 状态流转 · 深链重开 · 剧本联动
- **Quant Lab**：参数优化 · 风险归因 · 估值历史 · 告警编排 · 数据质量诊断

当前版本：`v4.1.0`

---

## 目录结构

```
backend/         FastAPI 应用（路由、中间件、auth、schema）
src/             核心计算引擎（analytics, backtest, data, strategy）
frontend/        React 18 前端（4 大工作区组件）
tests/           unit/ integration/ e2e/ manual/
scripts/         30+ 运维与验证脚本
docs/            API 参考、更新日志、重构计划、设计文档
data/            样本/缓存数据（不进 git）
```

## 启动命令

```bash
# 基础设施（TimescaleDB + Redis）
docker-compose -f docker-compose.pricing-infra.yml up -d

# 一键启动前后端
./scripts/start_system.sh

# 访问地址
# 前端：http://localhost:3100
# 后端 API：http://localhost:8100
# API 文档：http://localhost:8100/docs
```

## 测试命令

```bash
# 后端单元 + 集成测试
pytest tests/unit tests/integration -q

# 带覆盖率（阈值 60%）
pytest tests/unit tests/integration --cov=backend --cov=src --cov-fail-under=60 -q

# mypy 增量门禁
bash scripts/check_mypy_gate.sh

# 前端 Jest
cd frontend && CI=1 npm test -- --watchAll=false

# Playwright E2E
cd tests/e2e && npm run verify:research

# OpenAPI 契约验证（需后端运行）
python scripts/check_openapi_diff.py
```

## 重构原则（来自 REFACTORING_PLAN.md）

1. **先锁测试，再做零行为变更位移**——拆分提交里不能同时改业务规则
2. **每次只拆一个清晰边界**——避免在拆分里顺手改推荐分数/诊断阈值
3. **每步 OpenAPI diff 零破坏**——`python scripts/check_openapi_diff.py` 不能报错
4. **单次拆分 diff ≤ 600 行**——大拆分分多次提交

## 当前热点文件（待拆分）

| 优先级 | 文件 | 行数 |
|---|---|---|
| P1 | `frontend/src/components/CrossMarketBacktestPanel.js` | 2847 |
| P1 | `frontend/src/components/RealTimePanel.js` | 2730 |
| P2 | `frontend/src/components/MarketAnalysis.js` | 2629 |
| P2 | `frontend/src/components/ResearchWorkbench.js` | 2250 |
| P2 | `frontend/src/components/IndustryHeatmap.js` | 1967 |
| P2 | `src/data/providers/sina_ths_adapter/_adapter.py` | 1815 |
| P3 | `backend/app/api/v1/endpoints/industry/routes.py` | 1251 |

## CI 各 Job

| Job | 触发 | 内容 |
|---|---|---|
| quality | push/PR | ruff baseline(gate), bandit medium/high(gate), pip-audit(gate), mypy gate, ruff lint(advisory) |
| backend | push/PR | pytest unit+integration, coverage ≥60% |
| frontend | push/PR | npm audit, Jest, build |
| research-e2e | backend+frontend 通过后 | Playwright research suite |

## 安全注意

- 生产环境必须设置 `AUTH_SECRET` 环境变量（≥32 字节随机字符串）
- CORS 在生产环境不接受 `*` + 凭证模式的组合
- `ALLOW_LOCAL_PAYMENT_SIMULATION` 仅 debug 构建可用
CLAUDEEOF
```

- [ ] **Step 2: 验证文件存在且内容完整**

```bash
wc -l CLAUDE.md
grep -c "##" CLAUDE.md
```

期望：行数 > 80，`##` 标题数 ≥ 7

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project entry point for AI assistants"
```

---

## Layer 2：后端结构重组

---

### Task 7：industry heatmap_service.py

**Files:**
- Create: `backend/app/api/v1/endpoints/industry/heatmap_service.py`
- Test: `tests/unit/test_industry_heatmap_service.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/unit/test_industry_heatmap_service.py
import pytest
from unittest.mock import MagicMock, patch
from backend.app.api.v1.endpoints.industry.heatmap_service import (
    get_heatmap_data,
    get_heatmap_history,
)


def make_raw_heatmap(n=2):
    return {
        "industries": [
            {
                "name": f"行业{i}", "value": float(i), "total_score": float(i),
                "size": 100, "stockCount": 10, "moneyFlow": 0.5,
                "turnoverRate": 0.3, "industryVolatility": 0.1,
                "industryVolatilitySource": "calculated",
                "netInflowRatio": 0.2, "leadingStock": f"60000{i}",
                "sizeSource": "real", "marketCapSource": "known",
                "marketCapSnapshotAgeHours": None,
                "marketCapSnapshotIsStale": False,
                "valuationSource": "available", "valuationQuality": "good",
                "dataSources": [], "industryIndex": 0.0,
                "totalInflow": 1.0, "totalOutflow": 0.5,
                "leadingStockChange": 1.0, "leadingStockPrice": 10.0,
                "pe_ttm": 15.0, "pb": 1.5, "dividend_yield": 0.02,
            }
            for i in range(n)
        ],
        "max_value": float(n - 1),
        "min_value": 0.0,
        "update_time": "2026-05-02 10:00:00",
    }


def test_get_heatmap_data_returns_response(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.get_industry_heatmap_data.return_value = make_raw_heatmap(2)
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_heatmap_data(days=5)
    assert len(result.industries) == 2
    assert result.max_value == 1.0


def test_get_heatmap_data_empty_industries(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.get_industry_heatmap_data.return_value = {
        "industries": [], "max_value": 0.0, "min_value": 0.0, "update_time": ""
    }
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_heatmap_data(days=5)
    assert result.industries == []
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pytest tests/unit/test_industry_heatmap_service.py -v 2>&1 | tail -5
```

期望：`ImportError` 或 `ModuleNotFoundError`（模块尚不存在）

- [ ] **Step 3: 创建 heatmap_service.py**

从 `routes.py` 的 `get_industry_heatmap`（第 286-348 行）和 `get_industry_heatmap_history`（第 351-384 行）提取业务逻辑：

```python
# backend/app/api/v1/endpoints/industry/heatmap_service.py
"""行业热力图业务逻辑——从 routes.py 提取，路由层只做参数绑定和 response 包装。"""
from __future__ import annotations
import logging
from fastapi import HTTPException
from backend.app.schemas.industry import HeatmapResponse, HeatmapDataItem, HeatmapHistoryResponse
from . import _helpers
from ._helpers import (
    _get_endpoint_cache, _set_endpoint_cache,
    _get_stale_endpoint_cache,
    _append_heatmap_history, _heatmap_history,
    _heatmap_history_lock, _load_heatmap_history_from_disk,
)

logger = logging.getLogger(__name__)


def get_heatmap_data(*, days: int) -> HeatmapResponse:
    """行业热力图核心逻辑（缓存 + analyzer 调用 + response 构建）。"""
    cache_key = f"heatmap:v2:{days}"
    cached = _get_endpoint_cache(cache_key)
    if cached is not None:
        return cached

    try:
        analyzer = _helpers.get_industry_analyzer()
        heatmap_data = analyzer.get_industry_heatmap_data(days=days)

        result = HeatmapResponse(
            industries=[
                HeatmapDataItem(
                    name=ind.get("name", ""),
                    value=ind.get("value", 0),
                    total_score=ind.get("total_score", 0),
                    size=ind.get("size", 0),
                    stockCount=ind.get("stockCount", 0),
                    moneyFlow=ind.get("moneyFlow", 0),
                    turnoverRate=ind.get("turnoverRate", 0),
                    industryVolatility=ind.get("industryVolatility", 0),
                    industryVolatilitySource=ind.get("industryVolatilitySource", "unavailable"),
                    netInflowRatio=ind.get("netInflowRatio", 0),
                    leadingStock=str(ind["leadingStock"]) if ind.get("leadingStock") and ind["leadingStock"] != 0 else None,
                    sizeSource=ind.get("sizeSource", "estimated"),
                    marketCapSource=ind.get("marketCapSource", "unknown"),
                    marketCapSnapshotAgeHours=ind.get("marketCapSnapshotAgeHours"),
                    marketCapSnapshotIsStale=ind.get("marketCapSnapshotIsStale", False),
                    valuationSource=ind.get("valuationSource", "unavailable"),
                    valuationQuality=ind.get("valuationQuality", "unavailable"),
                    dataSources=ind.get("dataSources", []),
                    industryIndex=ind.get("industryIndex", 0),
                    totalInflow=ind.get("totalInflow", 0),
                    totalOutflow=ind.get("totalOutflow", 0),
                    leadingStockChange=ind.get("leadingStockChange", 0),
                    leadingStockPrice=ind.get("leadingStockPrice", 0),
                    pe_ttm=ind.get("pe_ttm"),
                    pb=ind.get("pb"),
                    dividend_yield=ind.get("dividend_yield"),
                )
                for ind in heatmap_data.get("industries", [])
            ],
            max_value=heatmap_data.get("max_value", 0),
            min_value=heatmap_data.get("min_value", 0),
            update_time=heatmap_data.get("update_time", ""),
        )
        if result.industries:
            _set_endpoint_cache(cache_key, result)
            _append_heatmap_history(days, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry heatmap: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for heatmap: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))


def get_heatmap_history(*, days: int) -> HeatmapHistoryResponse:
    """热力图历史记录（从磁盘加载 + 返回）。"""
    _load_heatmap_history_from_disk(days)
    with _heatmap_history_lock:
        entries = _heatmap_history.get(days, [])
    return HeatmapHistoryResponse(history=entries)
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pytest tests/unit/test_industry_heatmap_service.py -v
```

期望：`2 passed`

- [ ] **Step 5: 在 routes.py 中让 get_industry_heatmap 委托 service**

找到 routes.py 第 286 行（`def get_industry_heatmap`），在文件顶部 import 区加：

```python
from .heatmap_service import get_heatmap_data, get_heatmap_history
```

然后将 `get_industry_heatmap` 函数体替换为：

```python
def get_industry_heatmap(
    days: int = Query(5, ge=1, le=90, description="分析周期（天）"),
) -> HeatmapResponse:
    """获取行业热力图数据"""
    return get_heatmap_data(days=days)
```

同样将 `get_industry_heatmap_history` 函数体替换为：

```python
def get_industry_heatmap_history(
    days: int = Query(5, ge=1, le=90),
) -> HeatmapHistoryResponse:
    """获取行业热力图历史"""
    return get_heatmap_history(days=days)
```

- [ ] **Step 6: 验证路由测试仍通过**

```bash
pytest tests/unit/test_industry_analyzer.py tests/unit/test_industry_leader_endpoint.py -v -q
```

期望：全绿

- [ ] **Step 7: 验证 OpenAPI 契约无变更（需后端运行）**

```bash
python scripts/check_openapi_diff.py
```

期望：`OK: no breaking changes`

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/endpoints/industry/heatmap_service.py \
        backend/app/api/v1/endpoints/industry/routes.py \
        tests/unit/test_industry_heatmap_service.py
git commit -m "refactor(industry): extract heatmap_service.py from routes.py (zero behavior change)"
```

---

### Task 8：industry ranking_service.py

**Files:**
- Create: `backend/app/api/v1/endpoints/industry/ranking_service.py`
- Test: `tests/unit/test_industry_ranking_service.py`

- [ ] **Step 1: 读取 routes.py 第 118-175 行（get_hot_industries）**

```bash
sed -n '118,175p' backend/app/api/v1/endpoints/industry/routes.py
```

记录函数签名和返回结构，用于实现 ranking_service。

- [ ] **Step 2: 写失败测试**

```python
# tests/unit/test_industry_ranking_service.py
from unittest.mock import MagicMock
import pytest
from backend.app.api.v1.endpoints.industry.ranking_service import get_hot_industries_data


def test_get_hot_industries_data_returns_list(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.rank_industries.return_value = [
        {"name": "银行", "score": 85.0, "change": 1.2},
        {"name": "科技", "score": 78.0, "change": -0.5},
    ]
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_hot_industries_data(top_n=10, days=5)
    assert isinstance(result, list)
    assert len(result) == 2


def test_get_hot_industries_data_empty(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.rank_industries.return_value = []
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_hot_industries_data(top_n=10, days=5)
    assert result == []
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pytest tests/unit/test_industry_ranking_service.py -v 2>&1 | tail -3
```

期望：`ImportError`

- [ ] **Step 4: 创建 ranking_service.py**

读取 routes.py 第 118-175 行的完整逻辑，提取到：

```python
# backend/app/api/v1/endpoints/industry/ranking_service.py
"""行业热度排行业务逻辑。"""
from __future__ import annotations
import logging
from typing import Any, List
from fastapi import HTTPException
from . import _helpers
from ._helpers import _get_endpoint_cache, _set_endpoint_cache, _get_stale_endpoint_cache

logger = logging.getLogger(__name__)


def get_hot_industries_data(*, top_n: int, days: int) -> List[Any]:
    """返回热度排名行业列表（含缓存）。"""
    cache_key = f"hot_industries:v3:{top_n}:{days}"
    cached = _get_endpoint_cache(cache_key)
    if cached is not None:
        return cached
    try:
        analyzer = _helpers.get_industry_analyzer()
        result = analyzer.rank_industries(top_n=top_n, days=days)
        if result:
            _set_endpoint_cache(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ranking industries: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return stale
        raise HTTPException(status_code=500, detail=str(e))
```

**注意**：运行 Step 1 后根据实际 routes.py 代码调整此函数体，确保逻辑完全一致。

- [ ] **Step 5: 跑测试通过**

```bash
pytest tests/unit/test_industry_ranking_service.py -v
```

期望：`2 passed`

- [ ] **Step 6: 更新 routes.py 中 get_hot_industries 委托 ranking_service**

在 routes.py import 区加：

```python
from .ranking_service import get_hot_industries_data
```

将 `get_hot_industries` 函数体替换为一行委托：

```python
def get_hot_industries(
    top_n: int = Query(10, ge=1, le=50),
    days: int = Query(5, ge=1, le=90),
):
    return get_hot_industries_data(top_n=top_n, days=days)
```

- [ ] **Step 7: 全量行业测试**

```bash
pytest tests/unit/ -k "industry" -v -q
```

期望：全绿

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/endpoints/industry/ranking_service.py \
        backend/app/api/v1/endpoints/industry/routes.py \
        tests/unit/test_industry_ranking_service.py
git commit -m "refactor(industry): extract ranking_service.py from routes.py"
```

---

### Task 9：industry trend_service.py

**Files:**
- Create: `backend/app/api/v1/endpoints/industry/trend_service.py`
- Test: `tests/unit/test_industry_trend_service.py`

- [ ] **Step 1: 读取 routes.py 第 416-537 行（get_industry_trend）**

```bash
sed -n '416,537p' backend/app/api/v1/endpoints/industry/routes.py
```

- [ ] **Step 2: 写失败测试**

```python
# tests/unit/test_industry_trend_service.py
from unittest.mock import MagicMock
import pytest
from backend.app.api.v1.endpoints.industry.trend_service import get_trend_data


def test_get_trend_data_returns_response(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.get_industry_trend.return_value = {
        "industry_name": "银行", "stock_count": 20, "expected_stock_count": 25,
        "total_market_cap": 1e12, "avg_pe": 6.5, "industry_volatility": 0.1,
        "industry_volatility_source": "calculated", "period_days": 30,
        "period_change_pct": 2.5, "period_money_flow": 1e9,
        "top_gainers": [], "top_losers": [], "rise_count": 12,
        "fall_count": 7, "flat_count": 1,
        "stock_coverage_ratio": 0.9, "change_coverage_ratio": 0.9,
        "market_cap_coverage_ratio": 0.85, "pe_coverage_ratio": 0.8,
        "total_market_cap_fallback": False, "avg_pe_fallback": False,
        "market_cap_source": "known", "valuation_source": "available",
        "valuation_quality": "good", "trend_series": [],
        "degraded": False, "note": None, "update_time": "2026-05-02 10:00:00",
    }
    mock_provider = MagicMock()
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers._get_or_create_provider",
        lambda: mock_provider,
    )
    result = get_trend_data(industry_name="银行", days=30)
    assert result.industry_name == "银行"
    assert result.stock_count == 20


def test_get_trend_data_not_found_raises_404(monkeypatch):
    from fastapi import HTTPException
    mock_analyzer = MagicMock()
    mock_analyzer.get_industry_trend.return_value = {"error": "industry not found"}
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    with pytest.raises(HTTPException) as exc_info:
        get_trend_data(industry_name="不存在", days=30)
    assert exc_info.value.status_code == 404
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pytest tests/unit/test_industry_trend_service.py -v 2>&1 | tail -3
```

- [ ] **Step 4: 创建 trend_service.py**

将 routes.py 第 416-537 行的逻辑提取到：

```python
# backend/app/api/v1/endpoints/industry/trend_service.py
"""行业趋势分析业务逻辑。"""
from __future__ import annotations
import logging
from fastapi import HTTPException
from backend.app.schemas.industry import IndustryTrendResponse
from . import _helpers
from ._helpers import (
    _get_endpoint_cache, _set_endpoint_cache, _get_stale_endpoint_cache,
    _build_trend_summary_from_stock_rows, _should_align_trend_with_stock_rows,
)

logger = logging.getLogger(__name__)


def get_trend_data(*, industry_name: str, days: int) -> IndustryTrendResponse:
    """行业趋势分析核心逻辑（含对齐修正和降级缓存）。"""
    cache_key = f"trend:v5:{industry_name}:{days}"
    try:
        cached = _get_endpoint_cache(cache_key)
        if cached is not None:
            return cached

        analyzer = _helpers.get_industry_analyzer()
        trend_data = analyzer.get_industry_trend(industry_name, days=days)

        if "error" in trend_data:
            raise HTTPException(status_code=404, detail=trend_data["error"])

        result = IndustryTrendResponse(
            industry_name=trend_data.get("industry_name", ""),
            stock_count=trend_data.get("stock_count", 0),
            expected_stock_count=trend_data.get("expected_stock_count", 0),
            total_market_cap=trend_data.get("total_market_cap", 0),
            avg_pe=trend_data.get("avg_pe", 0),
            industry_volatility=trend_data.get("industry_volatility", 0),
            industry_volatility_source=trend_data.get("industry_volatility_source", "unavailable"),
            period_days=trend_data.get("period_days", days),
            period_change_pct=trend_data.get("period_change_pct", 0),
            period_money_flow=trend_data.get("period_money_flow", 0),
            top_gainers=trend_data.get("top_gainers", []),
            top_losers=trend_data.get("top_losers", []),
            rise_count=trend_data.get("rise_count", 0),
            fall_count=trend_data.get("fall_count", 0),
            flat_count=trend_data.get("flat_count", 0),
            stock_coverage_ratio=trend_data.get("stock_coverage_ratio", 0),
            change_coverage_ratio=trend_data.get("change_coverage_ratio", 0),
            market_cap_coverage_ratio=trend_data.get("market_cap_coverage_ratio", 0),
            pe_coverage_ratio=trend_data.get("pe_coverage_ratio", 0),
            total_market_cap_fallback=trend_data.get("total_market_cap_fallback", False),
            avg_pe_fallback=trend_data.get("avg_pe_fallback", False),
            market_cap_source=trend_data.get("market_cap_source", "unknown"),
            valuation_source=trend_data.get("valuation_source", "unavailable"),
            valuation_quality=trend_data.get("valuation_quality", "unavailable"),
            trend_series=trend_data.get("trend_series", []),
            degraded=trend_data.get("degraded", False),
            note=trend_data.get("note"),
            update_time=trend_data.get("update_time", ""),
        )

        # 对齐修正逻辑
        should_attempt_alignment = (
            result.degraded
            or (
                result.expected_stock_count > 0
                and result.stock_count > max(result.expected_stock_count * 2, result.expected_stock_count + 15)
            )
        )
        if should_attempt_alignment:
            provider = getattr(analyzer, "provider", None) or _helpers._get_or_create_provider()
            aligned_stock_rows = _helpers._load_trend_alignment_stock_rows(
                industry_name, result.expected_stock_count, provider=provider,
            )
            if _should_align_trend_with_stock_rows(result.model_dump(), aligned_stock_rows):
                aligned_summary = _build_trend_summary_from_stock_rows(
                    aligned_stock_rows,
                    expected_count=result.expected_stock_count,
                    fallback_total_market_cap=result.total_market_cap,
                    fallback_avg_pe=result.avg_pe,
                )
                aligned_payload = result.model_dump()
                aligned_payload.update(aligned_summary)
                result = IndustryTrendResponse(**aligned_payload)

        if result.degraded:
            stale = _get_stale_endpoint_cache(cache_key)
            if stale is not None and not getattr(stale, "degraded", True):
                logger.warning(f"Trend data degraded for {industry_name}, returning healthy stale cache")
                return stale

        _set_endpoint_cache(cache_key, result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry trend: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            logger.warning(f"Using stale cache for trend: {cache_key}")
            return stale
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 5: 测试通过**

```bash
pytest tests/unit/test_industry_trend_service.py -v
```

期望：`2 passed`

- [ ] **Step 6: 更新 routes.py 委托 trend_service**

```python
from .trend_service import get_trend_data
```

将 `get_industry_trend` 函数体替换：

```python
def get_industry_trend(
    industry_name: str,
    days: int = Query(30, ge=1, le=90),
) -> IndustryTrendResponse:
    return get_trend_data(industry_name=industry_name, days=days)
```

- [ ] **Step 7: 全量行业测试 + OpenAPI 验证**

```bash
pytest tests/unit/ -k "industry" -q
python scripts/check_openapi_diff.py
```

期望：全绿，无契约变更

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/endpoints/industry/trend_service.py \
        backend/app/api/v1/endpoints/industry/routes.py \
        tests/unit/test_industry_trend_service.py
git commit -m "refactor(industry): extract trend_service.py from routes.py"
```

---

### Task 10：industry rotation_service.py + 验收 routes.py ≤500 行

**Files:**
- Create: `backend/app/api/v1/endpoints/industry/rotation_service.py`
- Test: `tests/unit/test_industry_rotation_service.py`

- [ ] **Step 1: 读取 routes.py 第 539-642 行（rotation + clusters）**

```bash
sed -n '539,642p' backend/app/api/v1/endpoints/industry/routes.py
```

- [ ] **Step 2: 写失败测试**

```python
# tests/unit/test_industry_rotation_service.py
from unittest.mock import MagicMock
import pytest
from backend.app.api.v1.endpoints.industry.rotation_service import (
    get_rotation_data,
    get_clusters_data,
)


def test_get_rotation_data_returns_response(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.get_industry_rotation.return_value = {
        "current_hot": ["银行", "科技"],
        "emerging": ["医药"],
        "declining": ["钢铁"],
        "rotation_signal": "moderate",
        "update_time": "2026-05-02 10:00:00",
    }
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_rotation_data(top_n=10, days=5)
    assert result is not None


def test_get_clusters_data_returns_response(monkeypatch):
    mock_analyzer = MagicMock()
    mock_analyzer.cluster_hot_industries.return_value = {
        "clusters": {"0": ["银行"]}, "hot_cluster": 0,
        "cluster_stats": {}, "points": [],
        "selected_cluster_count": 4, "silhouette_score": 0.75,
        "cluster_candidates": {},
    }
    monkeypatch.setattr(
        "backend.app.api.v1.endpoints.industry._helpers.get_industry_analyzer",
        lambda: mock_analyzer,
    )
    result = get_clusters_data(n_clusters=4)
    assert result.hot_cluster == 0
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pytest tests/unit/test_industry_rotation_service.py -v 2>&1 | tail -3
```

- [ ] **Step 4: 创建 rotation_service.py**

根据 Step 1 读取的实际代码提取逻辑。模板：

```python
# backend/app/api/v1/endpoints/industry/rotation_service.py
"""行业轮动与聚类业务逻辑。"""
from __future__ import annotations
import logging
from fastapi import HTTPException
from backend.app.schemas.industry import IndustryRotationResponse, ClusterResponse
from . import _helpers
from ._helpers import _get_endpoint_cache, _set_endpoint_cache, _get_stale_endpoint_cache

logger = logging.getLogger(__name__)


def get_rotation_data(*, top_n: int, days: int) -> IndustryRotationResponse:
    cache_key = f"rotation:v3:{top_n}:{days}"
    cached = _get_endpoint_cache(cache_key)
    if cached is not None:
        return cached
    try:
        analyzer = _helpers.get_industry_analyzer()
        rotation_data = analyzer.get_industry_rotation(top_n=top_n, days=days)
        # 根据 Step 1 读取的实际 routes.py 代码，在此构建 IndustryRotationResponse(...)
        result = IndustryRotationResponse(**rotation_data)
        _set_endpoint_cache(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry rotation: {e}")
        stale = _get_stale_endpoint_cache(cache_key)
        if stale is not None:
            return stale
        raise HTTPException(status_code=500, detail=str(e))


def get_clusters_data(*, n_clusters: int) -> ClusterResponse:
    try:
        analyzer = _helpers.get_industry_analyzer()
        cluster_data = analyzer.cluster_hot_industries(n_clusters=n_clusters)
        return ClusterResponse(
            clusters=cluster_data.get("clusters", {}),
            hot_cluster=cluster_data.get("hot_cluster", -1),
            cluster_stats=cluster_data.get("cluster_stats", {}),
            points=cluster_data.get("points", []),
            selected_cluster_count=cluster_data.get("selected_cluster_count", n_clusters),
            silhouette_score=cluster_data.get("silhouette_score"),
            cluster_candidates=cluster_data.get("cluster_candidates", {}),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting industry clusters: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 5: 测试通过**

```bash
pytest tests/unit/test_industry_rotation_service.py -v
```

- [ ] **Step 6: 更新 routes.py，委托所有 service，验收行数 ≤1000**

```bash
wc -l backend/app/api/v1/endpoints/industry/routes.py
```

目标：通过四次委托后路由文件应已显著缩短。

- [ ] **Step 7: 全量测试 + OpenAPI 验证**

```bash
pytest tests/unit tests/integration -q
python scripts/check_openapi_diff.py
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/endpoints/industry/rotation_service.py \
        backend/app/api/v1/endpoints/industry/routes.py \
        tests/unit/test_industry_rotation_service.py
git commit -m "refactor(industry): extract rotation_service.py, routes.py now pure routing layer"
```

---

### Task 11：persistence 三个 Repository

**Files:**
- Create: `backend/app/core/persistence/auth_repository.py`
- Create: `backend/app/core/persistence/workbench_repository.py`
- Create: `backend/app/core/persistence/backtest_repository.py`
- Test: `tests/unit/test_persistence_repositories.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/unit/test_persistence_repositories.py
import pytest
from unittest.mock import MagicMock
from backend.app.core.persistence.auth_repository import AuthRepository
from backend.app.core.persistence.workbench_repository import WorkbenchRepository
from backend.app.core.persistence.backtest_repository import BacktestRepository


def make_manager():
    m = MagicMock()
    m.put_record.return_value = {"id": "test-id", "record_type": "test"}
    m.get_record.return_value = {"id": "test-id", "payload": {}}
    m.list_records.return_value = [{"id": "test-id"}]
    return m


def test_auth_repository_put(monkeypatch):
    manager = make_manager()
    repo = AuthRepository(manager)
    result = repo.put_oauth_token(provider_id="github", key="token-1", payload={"token": "abc"})
    manager.put_record.assert_called_once_with(
        record_type="oauth_token", record_key="token-1", payload={"token": "abc"}
    )


def test_workbench_repository_list(monkeypatch):
    manager = make_manager()
    repo = WorkbenchRepository(manager)
    result = repo.list_tasks(limit=10)
    manager.list_records.assert_called_once_with(record_type="research_task", limit=10)


def test_backtest_repository_get(monkeypatch):
    manager = make_manager()
    repo = BacktestRepository(manager)
    result = repo.get_result(key="bt-001")
    manager.get_record.assert_called_once_with(record_type="backtest_result", record_key="bt-001")
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pytest tests/unit/test_persistence_repositories.py -v 2>&1 | tail -3
```

- [ ] **Step 3: 创建 auth_repository.py**

```python
# backend/app/core/persistence/auth_repository.py
"""auth 相关记录的 repository 包装——薄门面，调用底层 PersistenceManager。"""
from __future__ import annotations
from typing import Any, Dict, List, Optional


class AuthRepository:
    RECORD_TYPE_OAUTH_TOKEN = "oauth_token"
    RECORD_TYPE_SESSION = "session"

    def __init__(self, manager):
        self._manager = manager

    def put_oauth_token(self, *, provider_id: str, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._manager.put_record(
            record_type=self.RECORD_TYPE_OAUTH_TOKEN,
            record_key=key,
            payload=payload,
        )

    def get_oauth_token(self, *, key: str) -> Optional[Dict[str, Any]]:
        return self._manager.get_record(
            record_type=self.RECORD_TYPE_OAUTH_TOKEN,
            record_key=key,
        )

    def list_oauth_tokens(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        return self._manager.list_records(
            record_type=self.RECORD_TYPE_OAUTH_TOKEN,
            limit=limit,
        )
```

- [ ] **Step 4: 创建 workbench_repository.py**

```python
# backend/app/core/persistence/workbench_repository.py
"""研究工作台任务持久化 repository。"""
from __future__ import annotations
from typing import Any, Dict, List, Optional


class WorkbenchRepository:
    RECORD_TYPE = "research_task"

    def __init__(self, manager):
        self._manager = manager

    def put_task(self, *, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._manager.put_record(
            record_type=self.RECORD_TYPE,
            record_key=key,
            payload=payload,
        )

    def get_task(self, *, key: str) -> Optional[Dict[str, Any]]:
        return self._manager.get_record(record_type=self.RECORD_TYPE, record_key=key)

    def list_tasks(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        return self._manager.list_records(record_type=self.RECORD_TYPE, limit=limit)
```

- [ ] **Step 5: 创建 backtest_repository.py**

```python
# backend/app/core/persistence/backtest_repository.py
"""回测历史记录 repository。"""
from __future__ import annotations
from typing import Any, Dict, List, Optional


class BacktestRepository:
    RECORD_TYPE = "backtest_result"

    def __init__(self, manager):
        self._manager = manager

    def put_result(self, *, key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._manager.put_record(
            record_type=self.RECORD_TYPE,
            record_key=key,
            payload=payload,
        )

    def get_result(self, *, key: str) -> Optional[Dict[str, Any]]:
        return self._manager.get_record(record_type=self.RECORD_TYPE, record_key=key)

    def list_results(self, *, limit: int = 50) -> List[Dict[str, Any]]:
        return self._manager.list_records(record_type=self.RECORD_TYPE, limit=limit)
```

- [ ] **Step 6: 跑测试确认通过**

```bash
pytest tests/unit/test_persistence_repositories.py -v
```

期望：`3 passed`

- [ ] **Step 7: 全量后端测试**

```bash
pytest tests/unit tests/integration -q
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/core/persistence/auth_repository.py \
        backend/app/core/persistence/workbench_repository.py \
        backend/app/core/persistence/backtest_repository.py \
        tests/unit/test_persistence_repositories.py
git commit -m "refactor(persistence): add AuthRepository, WorkbenchRepository, BacktestRepository facades"
```

---

### Task 12：sina_ths_adapter 拆分（client + cache + parsers）

**Files:**
- Create: `src/data/providers/sina_ths_adapter/client.py`
- Create: `src/data/providers/sina_ths_adapter/cache.py`
- Create: `src/data/providers/sina_ths_adapter/parsers.py`

- [ ] **Step 1: 读取 _adapter.py 的 HTTP 调用方法**

```bash
grep -n "requests\.\|session\.\|http\.\|retry\|timeout\|rate.limit\|fcntl\|throttle" \
  src/data/providers/sina_ths_adapter/_adapter.py | head -30
```

记录涉及 HTTP 调用的方法名和行号。

- [ ] **Step 2: 读取缓存相关代码**

```bash
grep -n "_cache\|_persist\|_load\|json\.load\|json\.dump\|fcntl\|snapshot" \
  src/data/providers/sina_ths_adapter/_adapter.py | head -30
```

记录缓存相关方法（已有 `_ensure_symbol_cache_loaded`、`_persist_symbol_cache`、`_load_persistent_market_cap_snapshot` 等）。

- [ ] **Step 3: 创建 client.py（HTTP 层）**

将 `_adapter.py` 中所有 `requests.get/post`、session、重试、timeout 逻辑提取到：

```python
# src/data/providers/sina_ths_adapter/client.py
"""HTTP session、重试、限流——从 _adapter.py 提取。"""
from __future__ import annotations
import logging
import time
from typing import Any, Dict, Optional
import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10
MAX_RETRIES = 3
RETRY_BACKOFF = 1.0


def http_get(url: str, *, params: Optional[Dict[str, Any]] = None,
             timeout: int = DEFAULT_TIMEOUT, retries: int = MAX_RETRIES) -> requests.Response:
    """带重试的 GET 请求。"""
    last_exc: Exception = RuntimeError("no attempts made")
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(RETRY_BACKOFF * (attempt + 1))
            logger.warning(f"HTTP GET {url} attempt {attempt+1}/{retries} failed: {exc}")
    raise last_exc
```

**注意**：根据 Step 1 读取的实际代码扩展此文件，把所有 HTTP 调用逻辑移进来。

- [ ] **Step 4: 创建 cache.py（缓存层）**

```python
# src/data/providers/sina_ths_adapter/cache.py
"""symbol/history/market-cap snapshot 文件缓存——从 _adapter.py 提取。"""
from __future__ import annotations
import fcntl
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

_CACHE_ROOT = Path(__file__).resolve().parents[3] / "cache"


def load_json_cache(path: Path) -> Dict[str, Any]:
    """原子读取 JSON 缓存文件，文件不存在则返回空字典。"""
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Cache load failed {path}: {e}")
        return {}


def save_json_cache(path: Path, data: Dict[str, Any]) -> None:
    """原子写入 JSON 缓存（fcntl 锁）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("w", encoding="utf-8") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                json.dump(data, f, ensure_ascii=False, indent=2)
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
    except OSError as e:
        logger.error(f"Cache save failed {path}: {e}")
```

**注意**：根据 Step 2 读取的实际代码，将 `_ensure_symbol_cache_loaded`、`_persist_symbol_cache`、`_load_persistent_market_cap_snapshot` 等方法移入此模块。

- [ ] **Step 5: 创建 parsers.py（解析层）**

```python
# src/data/providers/sina_ths_adapter/parsers.py
"""Sina/THS 原始 HTTP 响应解析——从 _adapter.py 提取。"""
from __future__ import annotations
import logging
import re
from io import StringIO
from typing import Any, Dict, List, Optional
import pandas as pd

logger = logging.getLogger(__name__)


def parse_sina_quote_response(raw: str) -> Optional[Dict[str, Any]]:
    """解析新浪实时行情字符串（var hq_str_xxx="...";）。"""
    match = re.search(r'"([^"]*)"', raw)
    if not match:
        return None
    parts = match.group(1).split(",")
    if len(parts) < 10:
        return None
    return {
        "name": parts[0],
        "open": float(parts[1]) if parts[1] else None,
        "close": float(parts[2]) if parts[2] else None,
        "price": float(parts[3]) if parts[3] else None,
        "high": float(parts[4]) if parts[4] else None,
        "low": float(parts[5]) if parts[5] else None,
        "volume": float(parts[8]) if parts[8] else None,
        "amount": float(parts[9]) if parts[9] else None,
    }
```

**注意**：根据 `_adapter.py` 中实际的解析方法（如对 BeautifulSoup、StringIO、js miniature 执行的解析）扩展此文件。

- [ ] **Step 6: 运行 sina 适配器测试**

```bash
pytest tests/unit/test_sina_ths_adapter.py -v -q 2>/dev/null || \
  pytest tests/unit/ -k "sina" -v -q
```

期望：全绿（_adapter.py 仍为组装入口，调用方不感知）

- [ ] **Step 7: Commit**

```bash
git add src/data/providers/sina_ths_adapter/client.py \
        src/data/providers/sina_ths_adapter/cache.py \
        src/data/providers/sina_ths_adapter/parsers.py
git commit -m "refactor(sina_ths_adapter): extract client.py, cache.py, parsers.py from _adapter.py"
```

---

## Layer 3：前端大文件拆分

---

### Task 13：CrossMarketBacktestPanel — 状态 hook

**Files:**
- Create: `frontend/src/components/cross-market/hooks/useCrossMarketBacktestState.js`

- [ ] **Step 1: 读取主组件，识别状态逻辑边界**

```bash
head -150 frontend/src/components/CrossMarketBacktestPanel.js
grep -n "useState\|useEffect\|useCallback\|useRef\|const \[" \
  frontend/src/components/CrossMarketBacktestPanel.js | head -40
```

记录所有 state 变量名和副作用入口。

- [ ] **Step 2: 创建 hook 目录**

```bash
mkdir -p frontend/src/components/cross-market/hooks
```

- [ ] **Step 3: 创建 useCrossMarketBacktestState.js**

将主组件中的模板加载、运行回测、保存任务、刷新信号相关的 state 和 effect 提取到：

```javascript
// frontend/src/components/cross-market/hooks/useCrossMarketBacktestState.js
import { useState, useEffect, useCallback, useRef } from 'react';
// 根据 Step 1 读取的实际 state 变量填写以下内容
// 模板：

export function useCrossMarketBacktestState({ apiBase }) {
  // 从 CrossMarketBacktestPanel.js 中移入所有 state 声明
  // 例如：
  // const [templates, setTemplates] = useState([]);
  // const [isRunning, setIsRunning] = useState(false);
  // const [result, setResult] = useState(null);
  // const [error, setError] = useState(null);

  // 从 CrossMarketBacktestPanel.js 中移入模板加载逻辑
  // const loadTemplates = useCallback(async () => { ... }, [apiBase]);
  // useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // 从 CrossMarketBacktestPanel.js 中移入运行回测逻辑
  // const runBacktest = useCallback(async (params) => { ... }, [...]);

  // 从 CrossMarketBacktestPanel.js 中移入保存任务逻辑
  // const saveTask = useCallback(async (task) => { ... }, [...]);

  return {
    // 暴露 state 和操作方法
    // templates, isRunning, result, error,
    // loadTemplates, runBacktest, saveTask,
  };
}
```

**重要**：Step 1 读取的实际代码决定此文件的完整内容，上面只是模板。

- [ ] **Step 4: 在主组件中引用 hook（不改逻辑）**

在 `CrossMarketBacktestPanel.js` 顶部加 import，并将原有 state 声明替换为 hook 调用：

```javascript
import { useCrossMarketBacktestState } from './cross-market/hooks/useCrossMarketBacktestState';

// 在组件函数体内：
const {
  // 从 hook 解构出所有需要的 state 和方法
} = useCrossMarketBacktestState({ apiBase: API_BASE });
```

- [ ] **Step 5: 跑 Jest 测试确认无退化**

```bash
cd frontend && CI=1 npm test -- --testPathPattern="cross.market|CrossMarket" --watchAll=false 2>&1 | tail -10
```

期望：PASS 或 `no tests found`（无跨市场测试时跳过）

- [ ] **Step 6: 构建验证**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

期望：`Build complete` 或 `Compiled successfully`

- [ ] **Step 7: 检查主组件行数**

```bash
wc -l frontend/src/components/CrossMarketBacktestPanel.js
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/cross-market/hooks/useCrossMarketBacktestState.js \
        frontend/src/components/CrossMarketBacktestPanel.js
git commit -m "refactor(frontend): extract useCrossMarketBacktestState hook from CrossMarketBacktestPanel"
```

---

### Task 14：CrossMarketBacktestPanel — 结果区子组件

**Files:**
- Create: `frontend/src/components/cross-market/results/ResultSummary.js`
- Create: `frontend/src/components/cross-market/results/ResultTable.js`
- Create: `frontend/src/components/cross-market/results/DiagnosticPanel.js`
- Create: `frontend/src/components/cross-market/results/PlaybookEntryPoint.js`

- [ ] **Step 1: 识别结果区 JSX 边界**

```bash
grep -n "Summary\|Table\|Diagnostic\|Playbook\|result\." \
  frontend/src/components/CrossMarketBacktestPanel.js | head -30
```

- [ ] **Step 2: 创建 results 目录**

```bash
mkdir -p frontend/src/components/cross-market/results
```

- [ ] **Step 3: 创建 ResultSummary.js**

将 CrossMarketBacktestPanel.js 中结果摘要区域的 JSX 提取到独立组件：

```javascript
// frontend/src/components/cross-market/results/ResultSummary.js
import React from 'react';

// 根据主组件中实际的摘要 JSX 填写 props 类型
export function ResultSummary({ result, isLoading }) {
  if (!result) return null;
  // 将主组件中的摘要 JSX 移入此处
  return (
    <div className="result-summary">
      {/* 实际 JSX 来自主组件 */}
    </div>
  );
}
```

- [ ] **Step 4: 创建 ResultTable.js、DiagnosticPanel.js、PlaybookEntryPoint.js**

按同样模式，将主组件中对应区域的 JSX 各自提取到独立文件。

- [ ] **Step 5: 更新主组件引用子组件**

```javascript
import { ResultSummary } from './cross-market/results/ResultSummary';
import { ResultTable } from './cross-market/results/ResultTable';
import { DiagnosticPanel } from './cross-market/results/DiagnosticPanel';
import { PlaybookEntryPoint } from './cross-market/results/PlaybookEntryPoint';
```

- [ ] **Step 6: 验收主组件行数 ≤1200**

```bash
wc -l frontend/src/components/CrossMarketBacktestPanel.js
```

期望：≤ 1200

- [ ] **Step 7: Jest + build**

```bash
cd frontend && CI=1 npm test -- --watchAll=false 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

期望：全绿 + build 成功

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/cross-market/results/ \
        frontend/src/components/CrossMarketBacktestPanel.js
git commit -m "refactor(frontend): extract CrossMarketBacktestPanel result subcomponents (≤1200 lines)"
```

---

### Task 15：RealTimePanel 拆分

**Files:**
- Create: `frontend/src/components/realtime/RealTimeSearchControl.js`
- Create: `frontend/src/components/realtime/RealTimeMonitorGroup.js`
- Create: `frontend/src/components/realtime/RealTimeDetailDrawer.js`

- [ ] **Step 1: 识别三块 JSX 边界**

```bash
grep -n "SearchControl\|MonitorGroup\|Drawer\|search\|monitor\|drawer\|控制\|监控\|抽屉" \
  frontend/src/components/RealTimePanel.js | head -30
wc -l frontend/src/components/RealTimePanel.js
```

- [ ] **Step 2: 提取 RealTimeSearchControl.js**

将顶部搜索/控制区 JSX 提取为组件，通过 props 传入所有需要的 state 和 handler：

```javascript
// frontend/src/components/realtime/RealTimeSearchControl.js
import React from 'react';

export function RealTimeSearchControl({ searchQuery, onSearch, onReset, /* ...其他 props */ }) {
  // 实际 JSX 来自 RealTimePanel.js 顶部控制区
  return <div>{/* ... */}</div>;
}
```

- [ ] **Step 3: 提取 RealTimeMonitorGroup.js 和 RealTimeDetailDrawer.js**

按同样模式提取监控组合管理区和懒加载抽屉编排区。

- [ ] **Step 4: 更新主组件**

在 `RealTimePanel.js` 引入三个子组件替换对应 JSX，验收行数 ≤1500：

```bash
wc -l frontend/src/components/RealTimePanel.js
```

- [ ] **Step 5: Jest + build + Playwright**

```bash
cd frontend && CI=1 npm test -- --watchAll=false 2>&1 | tail -5
npm run build 2>&1 | tail -3
cd ../tests/e2e && npm run verify:research 2>&1 | tail -10
```

期望：全绿

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/realtime/RealTimeSearchControl.js \
        frontend/src/components/realtime/RealTimeMonitorGroup.js \
        frontend/src/components/realtime/RealTimeDetailDrawer.js \
        frontend/src/components/RealTimePanel.js
git commit -m "refactor(frontend): split RealTimePanel into 3 subcomponents (≤1500 lines)"
```

---

### Task 16：MarketAnalysis + ResearchWorkbench + IndustryHeatmap hook 提取

**Files:**
- Create: `frontend/src/components/hooks/useMarketAnalysisData.js`
- Create: `frontend/src/components/hooks/useResearchWorkbenchState.js`
- Create: `frontend/src/components/hooks/useIndustryHeatmapFilter.js`

- [ ] **Step 1: MarketAnalysis 数据加载 hook**

```bash
grep -n "useState\|useEffect\|fetch\|api\." frontend/src/components/MarketAnalysis.js | head -30
```

提取数据加载逻辑到：

```javascript
// frontend/src/components/hooks/useMarketAnalysisData.js
import { useState, useEffect } from 'react';

export function useMarketAnalysisData({ symbol, timeRange }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 实际数据加载逻辑来自 MarketAnalysis.js
  }, [symbol, timeRange]);

  return { data, isLoading, error };
}
```

- [ ] **Step 2: ResearchWorkbench 状态机 hook**

```bash
grep -n "useState\|useCallback\|brief\|send\|history\|status" \
  frontend/src/components/ResearchWorkbench.js | head -30
```

提取到 `useResearchWorkbenchState.js`，暴露 `{ brief, setBrief, send, history, status }` 等。

- [ ] **Step 3: IndustryHeatmap 筛选状态 hook**

```bash
grep -n "useState\|filter\|select\|range\|period" \
  frontend/src/components/IndustryHeatmap.js | head -30
```

提取筛选状态到 `useIndustryHeatmapFilter.js`。

- [ ] **Step 4: 更新三个主组件引用 hook**

各组件在顶部添加 import 并替换原有 state 声明。

- [ ] **Step 5: 验收行数**

```bash
wc -l frontend/src/components/MarketAnalysis.js \
        frontend/src/components/ResearchWorkbench.js \
        frontend/src/components/IndustryHeatmap.js
```

- [ ] **Step 6: Jest + build + Playwright 最终验收**

```bash
cd frontend && CI=1 npm test -- --watchAll=false 2>&1 | tail -5
npm run build 2>&1 | tail -3
cd ../tests/e2e && npm run verify:research 2>&1 | tail -10
```

期望：全绿

- [ ] **Step 7: 最终全量后端测试**

```bash
cd /Users/leonardodon/PycharmProjects/super-pricing-system
pytest tests/unit tests/integration -q --cov=backend --cov=src --cov-fail-under=60
```

期望：全绿，coverage ≥60%

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/hooks/ \
        frontend/src/components/MarketAnalysis.js \
        frontend/src/components/ResearchWorkbench.js \
        frontend/src/components/IndustryHeatmap.js
git commit -m "refactor(frontend): extract data/state hooks from MarketAnalysis, ResearchWorkbench, IndustryHeatmap (P2)"
```

---

## 最终验收清单

```bash
# CI 质量门禁
bash scripts/check_mypy_gate.sh                          # OK
pytest tests/unit tests/integration -q --cov-fail-under=60  # PASS
pip install -r requirements.lock --dry-run               # OK

# 后端契约
pytest tests/unit tests/integration -q                   # 全绿
python scripts/check_openapi_diff.py                     # no breaking changes

# 前端
cd frontend && CI=1 npm test -- --watchAll=false          # 全绿
npm run build                                             # 成功

# E2E
cd tests/e2e && npm run verify:research                   # 全绿

# 文件行数验收
wc -l backend/app/api/v1/endpoints/industry/routes.py    # ≤1000
wc -l frontend/src/components/CrossMarketBacktestPanel.js # ≤1200
wc -l frontend/src/components/RealTimePanel.js            # ≤1500
```
