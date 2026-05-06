# 设计 · 文档真实性修正 + leader_stock_scorer 测试 backfill

**日期**：2026-05-06
**作者**：leo（与 Claude 协作)
**状态**：design (pending implementation)
**关联**：`docs/REFACTORING_PLAN.md`、`docs/superpowers/plans/2026-05-05-v4.3.0-direction.md`(Phase 2 起手切片)

---

## 1. 背景与目标

v4.3.0 Phase 1 已收尾(commit `7ff8309`)。本次切片是 Phase 2 的"低风险高 leverage"起手两件事:

1. **P1 — 文档真实性修正**:`REFACTORING_PLAN.md` 与 `v4.2.0.md` 里的 mypy/ruff
   基线数字已经被后续 commit(`d655ea1`、`4732fe7..482b376` 等)清理到更低的水位
   但文档没跟新;`CLAUDE.md` 仍然说 e2e 用 Playwright 但实际 `tests/e2e/` 全是
   custom Node `verify_*.js` 脚本(无 `@playwright/test` 依赖)。这些失真让任何
   将来的项目评估或新人 onboarding 起点就不可信。
2. **P2 — `src/analytics/leader_stock_scorer.py` 测试 backfill**:该文件
   887 行,line coverage 仅 45%。其中两个公开方法 `get_leader_detail`
   (line 685-751)与 `optimize_weights`(line 771-803)是完全零覆盖的"测试空白
   区"。这是后续做拆分(下个 spec)的前置 — 锁住行为再做位移。

**目标**:两件事各自独立成 commit,可分别 PR-able、可分别 bisect。无新功能、
零产物代码改动(P2 只新增测试)。

## 2. 范围

### 2.1 P1 In-Scope(3 个文件,~6 行编辑)

| 文件 | 改动 |
|---|---|
| `docs/REFACTORING_PLAN.md` | 第 9 行的"质量门基线"句子里 `mypy 342` → `mypy 150`、`ruff pyflakes 181` → `ruff pyflakes 177`(均与 CI 实测对齐;括号里历史串可保留为 `342 → 150`、`181 → 177`) |
| `docs/releases/v4.2.0.md` | 不修改第 72 行的历史数字(那是 v4.2.0 发布时的实测值)。在文末"数字概览"段后追加一行 `> 发布后续:phase 1 进一步把 mypy 降至 150、ruff/pyflakes 降至 177(commits 6045cc5..482b376)` |
| `CLAUDE.md` | 第 50 行 `Playwright in tests/e2e/` → `custom Node verify_*.js scripts in tests/e2e/`;第 115 行表格里 `Playwright research suite` → `custom verify_*.js research suite` |

### 2.2 P2 In-Scope(1 个文件,纯追加)

| 文件 | 改动 |
|---|---|
| `tests/unit/test_industry_analyzer.py` | 在 `class TestLeaderStockScorer`(line 308 起)内追加 5-7 个 test methods:覆盖 `get_leader_detail`(正常/未知 score_type/未知 symbol/core 与 hot 两种路径)+ `optimize_weights`(正常路径/约束边界/空输入早返回)。需要小型 mock provider fixture(可复用现有 `mock_provider` fixture) |

### 2.3 显式 Out-of-Scope

- **不**修改 `src/analytics/leader_stock_scorer.py` 任何一行(包括类型注解 — 那是
  另一种 commit 类别,本切片只补行为锁定测试)
- **不**碰 `industry_analyzer.py`(下一个 session 的目标)
- **不**碰 `pricing_gap_analyzer.py`(已 80% cov,不需要)
- **不**抬 CI `--cov-fail-under=59` 门槛(等多个文件补完一起抬)
- **不**拆分 `leader_stock_scorer.py`(留给独立 spec)
- **不**改任何 OpenAPI / API 契约
- **不**新建 test 文件 — 在现有 `test_industry_analyzer.py::TestLeaderStockScorer`
  内追加,保持组织一致性

## 3. 验收标准

### 3.1 P1 验收

- `git diff` 显示三个文档文件改动,行数总计 ≤ 10 行
- 文档中再无 "342" / "181" 作为"当前基线"的描述(v4.2.0.md 历史段落保留)
- 文档中再无 "Playwright" 作为 `tests/e2e/` 描述
- `cat scripts/mypy_baseline_count.txt` 实际值与 `REFACTORING_PLAN.md` 匹配

### 3.2 P2 验收

- `python3 -m pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer -q` 全过
- **硬性**:`get_leader_detail`(line 685-751)与 `optimize_weights`(line 771-803)
  各有 happy-path 测试 + 至少一条 edge-case 测试;两段在 `--cov-report=term-missing`
  里 happy-path 行不再 missing
- **目标**:`pytest tests/unit/test_industry_analyzer.py::TestLeaderStockScorer --cov=src.analytics.leader_stock_scorer` line coverage ≥ 65%(基线 45%);如未达 65% 但硬性达成,记录实际数值到 commit message,允许通过
- `python3 -m pytest tests/unit tests/integration -q` 全 suite 0 regression
- `bash scripts/check_mypy_gate.sh` 仍然 OK(应该不会变,因为没改产物代码)

## 4. 实施顺序与 commit 切片

| Commit | 内容 | 验证 |
|---|---|---|
| **C1** `docs: align mypy/ruff baselines and fix Playwright wording` | P1 三处文档修正 | 视觉 + grep |
| **C2** `test(leader_stock_scorer): backfill get_leader_detail + optimize_weights` | P2 测试追加 | pytest + coverage |

C1 与 C2 完全独立,可任意顺序。建议 C1 先做(更小、风险更低、立即让文档可信)。

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `optimize_weights` 内部依赖 numpy/scipy,mock 难写 | 优先测可控参数路径(空输入早返回、显式 weights),复杂数值优化可先用 smoke test 锁定"返回值是 dict 且 sum(weights)≈1" 等不变量 |
| `get_leader_detail` 的实际签名/返回结构在源码里需要再读一遍 | 实施时先 read [src/analytics/leader_stock_scorer.py:675-751](src/analytics/leader_stock_scorer.py:675),再下笔 |
| 现有 `mock_provider` fixture 可能不够 | 必要时局部 monkeypatch 而非新建 global fixture(避免影响其他测试) |
| coverage 跑出来 < 65% | 硬性要求是 `get_leader_detail` 与 `optimize_weights` 各有 happy-path + 至少一条 edge-case 测试;`≥65%` 是基于"两个 0% 方法补满"的估算,如果估算错(比如这两个方法只占 8% 而不是 15%),验收以"两个方法不再出现在 missing 区域"为准,绝对覆盖率门以实际为准记录在 commit message 里 |
| 文档措辞改动触发 markdownlint / pre-commit hook | 仅修措辞不改结构,风险极低;有问题就按 hook 提示调 |

## 6. 不做的事(延续 v4.2.0 纪律)

- 不在测试 backfill commit 里顺手"修个 bug"或加类型注解
- 不引入新的 fixture 抽象层
- 不为消除小重复而抽 helper(第三处出现再说)
- 单 commit pure 文档/测试 diff 控制在 ~200 行内

## 7. 后续(不在本 spec)

完成本切片后,自然过渡到:

1. **下一切片**:`leader_stock_scorer.py` 拆分(以本次 backfill 的测试为锚)
2. **再下一切片**:`industry_analyzer.py` 测试 + 拆分,同模式
3. **CI 门收紧**:多个文件补完后,把 `--cov-fail-under` 从 59 抬到 62 或 65
