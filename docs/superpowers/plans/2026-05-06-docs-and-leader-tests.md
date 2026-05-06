# 文档真实性修正 + leader_stock_scorer 测试 backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正三处文档失真(mypy/ruff baseline + Playwright 措辞),并给 `leader_stock_scorer.py` 的两个零覆盖公开方法补 characterization tests。

**Architecture:** 两个完全独立的 commit:C1 纯文档(3 文件、~6 行编辑),C2 纯测试追加(1 文件、~7 个 test methods,在现有 `TestLeaderStockScorer` class 内)。零产物代码改动。

**Tech Stack:** pytest / pandas / numpy / unittest.mock。Python 3.13。

**Spec:** `docs/superpowers/specs/2026-05-06-docs-and-leader-tests-design.md`(commit `513bb6d`)

---

## File Structure

| 文件 | 类别 | 责任 |
|---|---|---|
| `docs/REFACTORING_PLAN.md` | 修改(C1) | 头部"质量门基线"句子的 mypy/ruff 数字对齐 CI 实测 |
| `docs/releases/v4.2.0.md` | 修改(C1) | "数字概览"段后追加发布后续 baseline 清理记录 |
| `CLAUDE.md` | 修改(C1) | 两处 "Playwright" 措辞改为 "custom verify_*.js" |
| `tests/unit/test_industry_analyzer.py` | 修改(C2) | 在 `TestLeaderStockScorer`(line 308)末尾追加 7 个 test methods,覆盖 `get_leader_detail` 4 个分支 + `optimize_weights` 3 个分支 |

`src/analytics/leader_stock_scorer.py` **不**改动。

---

## Task 1: C1 — Docs alignment commit

**Files:**
- Modify: `docs/REFACTORING_PLAN.md:9-10`
- Modify: `docs/releases/v4.2.0.md:89`(在该行之后插入)
- Modify: `CLAUDE.md:50`、`CLAUDE.md:115`

### Step 1.1: Edit REFACTORING_PLAN.md baseline numbers

- [ ] Run this exact `Edit` operation:

```
file_path: docs/REFACTORING_PLAN.md
old_string:
质量门基线已对齐 CI 实测值（commit 74b1272）：mypy 342（原 381）、ruff
pyflakes 181（原 194 + 13 个历史 resolved），未来 regressions 直接失败。
new_string:
质量门基线已对齐 CI 实测值：mypy 150（v4.2.0 起 342 → phase 1 后续清到 150）、
ruff pyflakes 177（原 181 → 177），未来 regressions 直接失败。
```

Why this exact text: the original "（commit 74b1272）" 失去意义,因为 baseline 自那以后被多次更新;新文本保留 "原 X → 现 Y" 的历史串。

### Step 1.2: Verify REFACTORING_PLAN.md change

- [ ] Run: `head -12 docs/REFACTORING_PLAN.md`
- [ ] Expected output line 9-10:
```
质量门基线已对齐 CI 实测值:mypy 150（v4.2.0 起 342 → phase 1 后续清到 150）、
ruff pyflakes 177（原 181 → 177），未来 regressions 直接失败。
```
- [ ] Run: `grep -E "mypy 342|ruff pyflakes 181|74b1272" docs/REFACTORING_PLAN.md`
- [ ] Expected: no matches (exit code 1)

### Step 1.3: Append post-release note to v4.2.0.md

- [ ] Run this `Edit`:

```
file_path: docs/releases/v4.2.0.md
old_string:
- 最大前端组件：1716 → 1331（`CrossMarketResultsSection.js`）

## 不在此次范围
new_string:
- 最大前端组件：1716 → 1331（`CrossMarketResultsSection.js`）

> **发布后续(v4.3.0 phase 1 期间)**:mypy 基线 342 → 150、ruff/pyflakes 181 →
> 177(commits `6045cc5..482b376`),CI gate 已对齐到新值。

## 不在此次范围
```

历史段落第 72 行不动 — 那记录的是 v4.2.0 发布时的实测,是历史事实。

### Step 1.4: Verify v4.2.0.md change

- [ ] Run: `grep -A 1 "发布后续" docs/releases/v4.2.0.md`
- [ ] Expected: 找到 "发布后续(v4.3.0 phase 1 期间)" 一行

### Step 1.5: Edit CLAUDE.md line 50 (Playwright wording in tests/ structure)

- [ ] Run this `Edit`:

```
file_path: CLAUDE.md
old_string: tests/          unit / integration / manual / e2e (Playwright in tests/e2e/)
new_string: tests/          unit / integration / manual / e2e (custom verify_*.js scripts in tests/e2e/)
```

### Step 1.6: Edit CLAUDE.md line 115 (CI table description)

- [ ] Run this `Edit`:

```
file_path: CLAUDE.md
old_string: | `research-e2e` | Playwright research suite (depends on backend+frontend passing) | `cd tests/e2e && npm run verify:research` |
new_string: | `research-e2e` | Custom Node verify_*.js research suite (depends on backend+frontend passing) | `cd tests/e2e && npm run verify:research` |
```

### Step 1.7: Verify no remaining "Playwright" in CLAUDE.md

- [ ] Run: `grep -in "playwright" CLAUDE.md`
- [ ] Expected: no matches (exit code 1)

### Step 1.8: Stage and commit C1

- [ ] Run:
```bash
git add docs/REFACTORING_PLAN.md docs/releases/v4.2.0.md CLAUDE.md
git status
```
- [ ] Expected: 3 modified files in green
- [ ] Run:
```bash
git commit -m "$(cat <<'EOF'
docs: align mypy/ruff baselines and fix e2e wording

Three doc-truth fixes after v4.3.0 phase 1:

- REFACTORING_PLAN.md header now reflects mypy 150 / ruff 177 (was
  showing the v4.2.0-era 342 / 181)
- v4.2.0.md gets a post-release footnote pointing at the phase-1
  baseline reductions (commits 6045cc5..482b376)
- CLAUDE.md no longer claims "Playwright in tests/e2e/" — the actual
  e2e suite is custom verify_*.js scripts run via npm

No behavior change; downstream tooling unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
- [ ] Expected: commit succeeds (no pre-commit hook on docs)
- [ ] Run: `git log -1 --stat` and verify 3 files changed, ~6 insertions/deletions

---

## Task 2: C2 — leader_stock_scorer test backfill

**Files:**
- Modify: `tests/unit/test_industry_analyzer.py` — append 7 test methods to `class TestLeaderStockScorer` ending around line 454
- (Read-only reference: `src/analytics/leader_stock_scorer.py:675-803` for behavior)

**Approach:** characterization tests — write a test asserting the CURRENT behavior, then run it; if it passes the behavior is locked. We are NOT doing red-green TDD here because the implementation already exists. If a test fails on first run, it means the test misunderstands the existing behavior (fix the test, not the source).

### Step 2.1: Read source to lock behavior expectations

- [ ] Read `src/analytics/leader_stock_scorer.py:675-751`(`get_leader_detail`)
- [ ] Read `src/analytics/leader_stock_scorer.py:753-803`(`optimize_weights`)
- [ ] Read `src/analytics/leader_stock_scorer.py:805-887`(`_evaluate_weights`,被 optimize_weights 调用,理解何时返回 -inf)

Key facts to internalize:
- `get_leader_detail(symbol, score_type="core")` returns `{"symbol": symbol, "error": "Data provider not set"}` when `provider is None`
- 用 ThreadPoolExecutor 并发跑 `score_stock`、`provider.get_historical_data`、`provider.get_latest_quote`(后者用 `hasattr` 守卫)
- 如果 score_result 里有 "error",直接返回 score_result(不算 technical_analysis)
- happy path 在 hist_data 非空时计算 `technical_analysis = {ma5, ma20, volatility_60d, latest_close, high_60d, low_60d}` 与 `price_data`(最后 30 行 dict 化)
- 任何异常 → `{"symbol": symbol, "error": str(e)}`
- `optimize_weights(historical_returns, target="total_return")` 用 5^4 = 625 网格搜索;`_evaluate_weights` 在 empty df / 缺 target 列 / 缺 factor 列 时返回 -inf,此时 `best_weights` 不会被替换,函数返回 `self.weights.copy()`(initial DEFAULT_WEIGHTS keys)
- happy path 时 `best_weights` 被替换为 grid search 的 `test_weights`(keys 为 `market_cap/roe/revenue_growth/profit_growth/volatility/liquidity`)

### Step 2.2: Add `test_get_leader_detail_returns_error_when_provider_missing`

**Important: imports** — `pytest`、`pandas as pd`、`numpy as np` 已在文件顶部 line 5-7 import。新增 test methods **不要**重复 import,直接用 `pd`/`np`/`pytest`(monkeypatch 是 pytest fixture 自动注入,不需要 import)。

**Important: blank lines** — 当前文件 `class TestLeaderStockScorer` 与 `class TestIndustryBacktester` 之间是 **2 个空行**(PEP 8)。后续每次 `Edit` 的 `old_string` 必须包含这 2 个空行;`new_string` 在新方法后保持同样的 2-空行分隔。

- [ ] 用 `Edit` tool,参数如下(注意 old_string 末尾两个空行):

```
file_path: tests/unit/test_industry_analyzer.py
old_string:
        # 测试超出范围的值
        assert scorer._normalize(-10, 0, 100) == 0.0
        assert scorer._normalize(150, 0, 100) == 1.0


class TestIndustryBacktester:
new_string:
        # 测试超出范围的值
        assert scorer._normalize(-10, 0, 100) == 0.0
        assert scorer._normalize(150, 0, 100) == 1.0

    def test_get_leader_detail_returns_error_when_provider_missing(self):
        """provider 为 None 时,get_leader_detail 应返回 error dict 而不是抛异常"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer

        scorer = LeaderStockScorer(provider=None)
        result = scorer.get_leader_detail("000001")

        assert result == {"symbol": "000001", "error": "Data provider not set"}


class TestIndustryBacktester:
```

(`old_string` 必须以 `1.0\n\n\nclass TestIndustryBacktester:` 结尾,即 `1.0` 之后两个空行;`new_string` 同样以 `}\n\n\nclass TestIndustryBacktester:` 结尾,保持 PEP 8 双空行。)

### Step 2.3: Run new test to lock behavior

- [ ] Run: `python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer::test_get_leader_detail_returns_error_when_provider_missing -v`
- [ ] Expected: 1 passed in <1s
- [ ] If FAIL: 阅读 `src/analytics/leader_stock_scorer.py:685-686` 确认实际返回值,调整 test 的 expected dict 而非动 source

### Step 2.4: Add `test_get_leader_detail_returns_score_with_technical_analysis`(happy path)

- [ ] 在刚加的 method 后追加(同样位于 `class TestIndustryBacktester:` 之前)。注意末尾保持 PEP 8 双空行,`pd`/`np` 不再 import:

```
file_path: tests/unit/test_industry_analyzer.py
old_string:
    def test_get_leader_detail_returns_error_when_provider_missing(self):
        """provider 为 None 时,get_leader_detail 应返回 error dict 而不是抛异常"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer

        scorer = LeaderStockScorer(provider=None)
        result = scorer.get_leader_detail("000001")

        assert result == {"symbol": "000001", "error": "Data provider not set"}


class TestIndustryBacktester:
new_string:
    def test_get_leader_detail_returns_error_when_provider_missing(self):
        """provider 为 None 时,get_leader_detail 应返回 error dict 而不是抛异常"""
        from src.analytics.leader_stock_scorer import LeaderStockScorer

        scorer = LeaderStockScorer(provider=None)
        result = scorer.get_leader_detail("000001")

        assert result == {"symbol": "000001", "error": "Data provider not set"}

    def test_get_leader_detail_returns_score_with_technical_analysis(self, scorer, mock_provider):
        """happy path:hist_data 充足时返回 score + technical_analysis + price_data 三段"""
        # 构造 30 日价格序列(线性上升便于断言)
        dates = pd.date_range(end="2026-05-06", periods=30, freq="D")
        closes = np.linspace(10.0, 12.0, 30)
        hist_df = pd.DataFrame({"date": dates, "close": closes})

        mock_provider.get_historical_data.return_value = hist_df
        mock_provider.get_latest_quote.return_value = {
            "current_price": 12.0,
            "previous_close": 11.5,
        }

        result = scorer.get_leader_detail("000001", score_type="core")

        assert "error" not in result
        assert "technical_analysis" in result
        tech = result["technical_analysis"]
        # 长度足够 → ma5、ma20、volatility_60d 都应该被填上
        assert "ma5" in tech
        assert "ma20" in tech
        assert "volatility_60d" in tech
        assert tech["latest_close"] == pytest.approx(12.0, abs=0.01)
        assert tech["high_60d"] == pytest.approx(12.0, abs=0.01)
        assert tech["low_60d"] == pytest.approx(10.0, abs=0.01)
        # price_data 是 records list,最多 30 条
        assert isinstance(result["price_data"], list)
        assert len(result["price_data"]) == 30


class TestIndustryBacktester:
```

### Step 2.5: Run happy path test

- [ ] Run: `python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer::test_get_leader_detail_returns_score_with_technical_analysis -v`
- [ ] Expected: 1 passed
- [ ] 如果失败:可能是 mock_provider 的 `get_stock_valuation`/`get_stock_financial_data` 在 score_stock 内部触发了某个不期望的路径。打印 `result` 检查是哪一步出错,然后**调整测试断言或添加更多 mock return_values,绝对不动 source**

### Step 2.6: Add `test_get_leader_detail_propagates_score_error`

**Insertion pattern**(后续 step 2.7、2.9、2.10、2.11 都遵循同样的 pattern):
- `Edit` 的 `old_string` = 上一个新增 method 的最后一行 `<assertion>` + 双空行 + `class TestIndustryBacktester:`
- `new_string` = 同样的尾部内容,但在前一个 method 与 `class TestIndustryBacktester:` 之间(即第二个空行之前)插入新 method
- 保持每对 method 之间 1 空行,与 `class TestIndustryBacktester:` 保持 2 空行

- [ ] 用 `Edit` 在 happy path test 之后、`class TestIndustryBacktester:` 之前插入:

```python
    def test_get_leader_detail_propagates_score_error(self, scorer, mock_provider, monkeypatch):
        """score_stock 返回 error dict 时,get_leader_detail 直接透传不再算 technical_analysis"""
        monkeypatch.setattr(
            scorer,
            "score_stock",
            lambda *args, **kwargs: {"symbol": "BADSYM", "error": "scoring failed"},
        )
        mock_provider.get_historical_data.return_value = pd.DataFrame()
        mock_provider.get_latest_quote.return_value = {}

        result = scorer.get_leader_detail("BADSYM")

        assert result == {"symbol": "BADSYM", "error": "scoring failed"}
        assert "technical_analysis" not in result
        assert "price_data" not in result
```

### Step 2.7: Add `test_get_leader_detail_returns_error_on_exception`

- [ ] 用 step 2.6 的 insertion pattern 追加:

```python
    def test_get_leader_detail_returns_error_on_exception(self, scorer, mock_provider):
        """provider 抛异常时,get_leader_detail 捕获并 stringify 到 error 字段"""
        mock_provider.get_historical_data.side_effect = RuntimeError("network down")

        result = scorer.get_leader_detail("000001")

        assert result["symbol"] == "000001"
        assert "error" in result
        assert "network down" in result["error"]
```

### Step 2.8: Run all 4 get_leader_detail tests + existing tests for regression

- [ ] Run: `python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer -v`
- [ ] Expected: 13 passed (9 existing + 4 new); 0 failures

### Step 2.9: Add `test_optimize_weights_returns_default_on_empty_dataframe`

- [ ] 用 step 2.6 的 insertion pattern 追加:

```python
    def test_optimize_weights_returns_default_on_empty_dataframe(self, scorer):
        """空 df 时所有候选都得 -inf,返回值应等于 self.weights.copy()(原始 DEFAULT_WEIGHTS)"""
        original_weights = scorer.weights.copy()
        result = scorer.optimize_weights(pd.DataFrame(), target="total_return")

        assert result == original_weights
```

### Step 2.10: Add `test_optimize_weights_returns_default_when_target_column_missing`

- [ ] 用 step 2.6 的 insertion pattern 追加:

```python
    def test_optimize_weights_returns_default_when_target_column_missing(self, scorer):
        """df 没有任何 target/return 列时,_evaluate_weights 早返回 -inf,best_weights 保持初值"""
        df = pd.DataFrame({
            "market_cap": [1.0, 2.0, 3.0],
            "roe": [0.5, 0.6, 0.7],
        })
        original_weights = scorer.weights.copy()

        result = scorer.optimize_weights(df, target="total_return")

        assert result == original_weights
```

### Step 2.11: Add `test_optimize_weights_happy_path_returns_factor_weight_dict`

- [ ] 用 step 2.6 的 insertion pattern 追加:

```python
    def test_optimize_weights_happy_path_returns_factor_weight_dict(self, scorer):
        """有完整因子 + forward_return 列时,grid search 找到优胜组合,返回的 dict keys 是 6 个 factor 名"""
        rng = np.random.default_rng(seed=42)
        n = 50
        df = pd.DataFrame({
            "market_cap": rng.uniform(0, 1, n),
            "roe": rng.uniform(0, 1, n),
            "revenue_growth": rng.uniform(0, 1, n),
            "profit_growth": rng.uniform(0, 1, n),
            "volatility": rng.uniform(0, 1, n),
            "liquidity": rng.uniform(0, 1, n),
            "forward_return": rng.uniform(-0.1, 0.2, n),
        })

        result = scorer.optimize_weights(df, target="total_return")

        assert isinstance(result, dict)
        # grid search 替换后的 keys
        assert set(result.keys()) == {
            "market_cap", "roe", "revenue_growth",
            "profit_growth", "volatility", "liquidity",
        }
        # weights 都是 float
        assert all(isinstance(v, float) for v in result.values())
        # mc + roe + rg + pg 应该都来自 weight_options
        assert result["market_cap"] in [0.1, 0.15, 0.2, 0.25, 0.3]
        assert result["roe"] in [0.1, 0.15, 0.2, 0.25, 0.3]
```

### Step 2.12: Run all 7 new tests + existing 9 tests

- [ ] Run: `python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer -v`
- [ ] Expected: 16 passed (9 existing + 7 new); 0 failures
- [ ] 如果 happy path 测试 timeout(grid search 是 5^4=625 个 combo):本机应在 1-2s 完成;若超 10s,降低 `n` 到 20 或简化 dataframe

### Step 2.13: Verify coverage hardline: get_leader_detail + optimize_weights happy paths covered

- [ ] Run:
```bash
python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer \
  --cov=src.analytics.leader_stock_scorer \
  --cov-report=term-missing -q --no-cov-on-fail 2>&1 | tail -20
```
- [ ] Expected output snippet 类似(数字可能在 70-80% 之间,因为 `optimize_weights` happy-path 会同时跑 `_evaluate_weights` 的 812-887):
  ```
  src/analytics/leader_stock_scorer.py     382    ~85    148     XX  ~78%   <missing lines>
  ```
- [ ] 硬性检查(spec 验收):missing 行号区间里**不应**完整出现 685-751、771-803、812-887 这三段连续区间(允许零散几行 edge case 仍 missing,如 `hasattr(self.provider, "get_latest_quote")` 假分支)
- [ ] 记录实际 line coverage 数字 — 写入 commit message。预期 ≥ 65%,如未达,确认上面硬性条件达成即可通过

### Step 2.14: Full unit suite regression

- [ ] Run: `python3 -m pytest tests/unit -q 2>&1 | tail -5`
- [ ] Expected: 全部 PASS(或仅有先前已 skip 的 network-only test 仍 skip)

### Step 2.15: mypy gate sanity check

- [ ] Run: `bash scripts/check_mypy_gate.sh`
- [ ] Expected: `OK: mypy gate passed`(产物代码没改,基线不变)

### Step 2.16: Stage and commit C2

- [ ] Run:
```bash
git add tests/unit/test_industry_analyzer.py
git status
```
- [ ] Expected: 仅一个 modified 文件
- [ ] Run(替换 `<COVERAGE>` 为 step 2.13 实测值):
```bash
git commit -m "$(cat <<'EOF'
test(leader_stock_scorer): characterize get_leader_detail + optimize_weights

Backfill seven characterization tests covering the two zero-coverage
public methods of LeaderStockScorer:

- get_leader_detail: provider-missing, happy path with technical_analysis,
  score-error propagation, exception path
- optimize_weights: empty df, missing target column, happy-path 6-factor
  weight dict

Source code unchanged. Coverage of leader_stock_scorer.py: 45% → <COVERAGE>%.

Pre-condition for the upcoming leader_stock_scorer split (separate spec).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
- [ ] Expected: commit succeeds
- [ ] Run: `git log -2 --oneline` to verify both C1 and C2 commits present

---

## End-of-plan verification checklist

After both tasks done, run these in order:

- [ ] `git log -3 --oneline` — should show C2, C1, spec commit `513bb6d`
- [ ] `git diff main..HEAD --stat` — should show 4 files changed (3 docs + 1 test)
- [ ] `python3 -m pytest tests/unit tests/integration -q 2>&1 | tail -3` — full suite green
- [ ] `bash scripts/check_mypy_gate.sh` — passes
- [ ] `python3 scripts/check_ruff_pyflakes_baseline.py` — passes (no new violations)
- [ ] `grep -rn "Playwright\|mypy 342\|ruff pyflakes 181" docs/REFACTORING_PLAN.md CLAUDE.md` — no matches in CURRENT-state descriptions(`v4.2.0.md` 历史段保留 342/181,这是预期)

If any checklist item fails, the implementer should pause and report rather than push through.

---

## Out-of-scope findings (for future spec)

While reading CLAUDE.md I noticed `CLAUDE.md:113` shows `fail_under=55` but actual CI is 59:
```
| `backend` | unit + integration + coverage `fail_under=55` | `pytest ... --cov-fail-under=55 -q` |
```
This is **out of P1 scope** per spec(spec only listed mypy + Playwright)。Recommend a follow-up tiny commit("docs(claude): align coverage gate to actual 59")在本 PR 之后。
