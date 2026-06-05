# 前端 v5 · P4 切换 (cutover) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** 把旧 CRA 前端 `frontend/` 退役:删除它、把 CI/脚本/文档指向新的 `web/` 应用,清理对旧前端的引用。v5 前端(P0–P3+P2.5)正式成为唯一前端。

**关键决定:新前端保留在 `web/` 路径**(不重命名 `web/`→`frontend/`)——这样与并行的 P3.5 分支零冲突,且目录名是表面问题。未来若想改名可单独做。

**Architecture:** 这是仓库级配置/文档手术 + 删除 `frontend/`。基本不动 `web/src` 源码。

**通用约束:**
- **工作目录:worktree `/Users/leonardodon/.sps-wt/p4`**(分支 `frontend-v5-p4-cutover`)。**不碰别的 worktree;不动 `web/src/` 源码**(那是 P3.5 的地盘,且本期无需改源码)。
- **禁止 `npm run dev`。** 验证:`web/` 下 `npm run build` 成功;后端 `python3 -m pytest -q`(在仓库根,确认删 `frontend/` 不影响后端);CI yaml 语法。
- 每任务全绿后 commit。

---

### Task 1: CI 重接线 — ci.yml

**源/参考:** `.github/workflows/ci.yml`(现有,含依赖旧 `frontend/` 的 job)、`.github/workflows/web-ci.yml`(P0 建,已覆盖 `web/`)。
- [ ] 读 `.github/workflows/ci.yml`,找出依赖旧 `frontend/` 的 job(很可能是 "Frontend tests + build" 跑 `cd frontend && npm ...`,以及 "Research E2E (Playwright)" 针对旧前端)。
- [ ] **移除**这些依赖旧前端的 job(删除 frontend/ 后它们必失败)。保留后端相关 job(lint/type/security、backend tests)。`web/` 由现有 `web-ci.yml` 覆盖。Playwright E2E 针对旧前端的:移除,并在 plan/commit 注明"web/ 的 E2E 留作后续"。
- [ ] 确认 yaml 合法(`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` 或类似)。
- [ ] Commit:`ci: drop legacy frontend test/build + e2e jobs (web/ covered by web-ci)`

---

### Task 2: 删除旧前端 + 脚本/gitignore

**源:** `frontend/`(整目录)、`scripts/{stop_system.sh,cleanup.sh}`(引用 frontend)、根 `.gitignore`。
- [ ] `git rm -r frontend/`(删除整个旧 CRA 应用)。
- [ ] 改 `scripts/stop_system.sh`、`scripts/cleanup.sh`:把对 `frontend/` 的引用改为 `web/`(端口仍 3100;停的是 web 的 dev/进程、清的是 web 的产物/缓存)。读旧脚本理解它做什么,最小改动指向 web/。若有 start 脚本同理。
- [ ] 根 `.gitignore`:移除/调整仅针对旧 `frontend/`(如 `frontend/node_modules`、`frontend/build`)的条目(若有);`web/` 的忽略已在 `web/.gitignore`。
- [ ] 验证:`grep -rn "frontend/" scripts/ .github/` 应无活跃引用(docs 的历史引用 T3 处理)。
- [ ] Commit:`chore: remove legacy frontend/ app; repoint scripts to web/`

---

### Task 3: 文档更新

**源:** `README.md`、`docs/{ARCHITECTURE.md,PROJECT_STRUCTURE.md,DEPLOYMENT.md,CHANGELOG.md}`。
- [ ] **README.md**:技术栈表/本地体验/页面预览段——把"React 18 + CRA + AntD"等旧前端描述更新为"Vite + React 19 + TS + Tailwind v4 + shadcn(暗金),位于 `web/`";本地启动改 `cd web && npm install && npm run dev`(端口 3100,代理 :8100)。保留 4 大工作区叙述(定价/上帝视角/工作台 + 估值/因子/诊断子页),但注明已是 v5 重做。
- [ ] **ARCHITECTURE.md / PROJECT_STRUCTURE.md**:前端结构段更新为 `web/`(features/pricing|godeye|workbench、services/api、components/ui 等);移除/标注旧 `frontend/src` 结构。
- [ ] **DEPLOYMENT.md**:前端构建/部署步骤改 `web/`(`npm run build` → `web/dist`)。
- [ ] **CHANGELOG.md**:加一条 v5 条目——前端从 CRA/AntD 重做为 Vite/TS/shadcn 暗金,收窄到定价/上帝视角/工作台 + 诊断,旧 `frontend/` 退役。
- [ ] 不必逐字重写每篇;只更新前端相关、会误导新人的段落。历史性文档(REFACTORING_PLAN、alt_data_audit、ADR)里的旧引用可不动。
- [ ] Commit:`docs: update README/ARCHITECTURE/PROJECT_STRUCTURE/DEPLOYMENT for the v5 web/ frontend`

---

### Task 4: 收尾门禁

- [ ] `web/` 下 `npm run build` 成功(新前端仍可构建)。
- [ ] 仓库根 `python3 -m pytest -q`(确认删 `frontend/` 不破坏后端——后端不应 import 前端;若 pytest 太慢,至少跑 `tests/unit` 子集 + `python3 -c "import backend.app.main"` 冒烟)。
- [ ] `grep -rn "cd frontend\|frontend/build\|frontend/src" .github/ scripts/` 无活跃引用。
- [ ] `git status` 干净,`frontend/` 已不在工作树。
- [ ] Commit(若有收尾):`chore: P4 cutover finalization`

## 自检
- 旧前端删除;CI/脚本/文档指向 `web/`;后端不受影响;`web/` 仍可构建。新前端保留在 `web/`(未改名,保证与 P3.5 并行无冲突)。
