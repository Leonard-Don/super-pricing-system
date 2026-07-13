# Super Pricing Local Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discard the obsolete infrastructure-removal WIP, verify the current supported product, publish the approved retirement documentation to GitHub, and remove the local checkout and its data.

**Architecture:** Preserve a temporary verified Git bundle, keep current `origin/main` infrastructure behavior unchanged, and remove only local stash/tag state that conflicts with GitHub. Run the full backend and frontend gates before pushing; delete the checkout only after every retained documentation commit is present on `origin/main`.

**Tech Stack:** Bash 3.2-compatible shell, Python 3, pytest, Ruff, React/TypeScript, Vitest/Vite, Git/GitHub, optional TimescaleDB/Redis runtime.

## Global Constraints

- Keep only code that is still valuable on current `origin/main` and passes its relevant tests.
- Do not upload or retain `.env`, `data/`, caches, databases, logs, build products, or run history.
- Use Chinese commit messages for retained changes.
- Discard the May 2 infrastructure-removal stash in full: current main intentionally supports `--with-infra`, TimescaleDB, Redis, Celery worker/beat, health checks, and matching deployment documentation.
- Discard the conflicting local `v4.1.0` tag and fetch the GitHub tag before final verification.
- Do not delete the checkout until all retained commits are present on `origin/main` and the safety bundle has been verified.

## File Map

- Preserve unchanged: `docker-compose.pricing-infra.yml` — supported local TimescaleDB and Redis stack.
- Preserve unchanged: `scripts/start_infra_stack.sh`, `scripts/stop_infra_stack.sh`, `scripts/start_system.sh`, `scripts/stop_system.sh`, `scripts/health_check.py` — supported infrastructure and runtime lifecycle.
- Preserve: `docs/superpowers/specs/2026-07-13-local-retirement-design.md` — approved retirement design.
- Preserve: `docs/superpowers/plans/2026-07-13-local-retirement.md` — this execution plan.

---

### Task 1: Create a recoverable snapshot and synchronize the retained branch base

**Files:**
- Create temporarily: `/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle`
- Preserve: approved design and implementation-plan documents.

**Interfaces:**
- Consumes: current `main`, `origin/main`, the infrastructure-removal stash, and the conflicting local tag.
- Produces: a verified Git bundle and a clean `main` rebased onto current `origin/main` if the remote advanced.

- [ ] **Step 1: Create and verify a bundle containing all refs and the stash**

```bash
mkdir -p /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety
git bundle create /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle --all
git bundle verify /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle
```

Expected: the bundle verifies successfully and lists `refs/stash`, `refs/heads/main`, and local tags.

- [ ] **Step 2: Fetch current branches without forcing the conflicting tag**

```bash
git fetch --prune origin
git rev-list --left-right --count HEAD...origin/main
```

Expected: fetch succeeds and the left count consists only of the approved design and plan commits.

- [ ] **Step 3: Rebase retained documentation only if GitHub main advanced**

```bash
git rebase origin/main
git status --short --branch
```

Expected: worktree is clean and `main` is ahead only by the approved documentation commits.

### Task 2: Prove the infrastructure-removal stash is obsolete and discard it

**Files:**
- Preserve unchanged: `docker-compose.pricing-infra.yml`
- Preserve unchanged: `scripts/start_infra_stack.sh`
- Preserve unchanged: `scripts/stop_infra_stack.sh`
- Preserve unchanged: `scripts/start_system.sh`
- Preserve unchanged: `scripts/stop_system.sh`
- Preserve unchanged: `scripts/health_check.py`
- Preserve unchanged: `README.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/alt_data_audit.md`

**Interfaces:**
- Consumes: current infrastructure code and the `infra-removal-wip-pre-l3` stash.
- Produces: no code changes and no remaining stash.

- [ ] **Step 1: Confirm current main intentionally exposes the infrastructure lifecycle**

```bash
rg -n 'with-infra|start_infra_stack|stop_infra_stack|TimescaleDB|Redis|with-worker|with-beat' \
  README.md docs/DEPLOYMENT.md docs/ARCHITECTURE.md docs/alt_data_audit.md \
  scripts/start_system.sh scripts/stop_system.sh scripts/health_check.py
```

Expected: references cover startup flags, shutdown, health checks, persistence bootstrap, worker, and beat behavior.

- [ ] **Step 2: Confirm the stash would delete that supported lifecycle**

```bash
git stash show --stat 'stash@{0}'
git stash show --name-status 'stash@{0}'
```

Expected: the stash deletes the Compose and infra start/stop files and removes the corresponding health/start/stop integration.

- [ ] **Step 3: Remove the obsolete stash**

```bash
git stash clear
test -z "$(git stash list)"
```

Expected: no stash remains and the worktree stays clean.

- [ ] **Step 4: Replace the conflicting local tag with the GitHub tag**

```bash
git tag -d v4.1.0
git fetch --prune --tags origin
```

Expected: fetch succeeds without `would clobber existing tag`; local `v4.1.0` now matches GitHub.

- [ ] **Step 5: Verify there are no local-only branches or commits outside main**

```bash
git branch -vv
git log --oneline --branches --not --remotes
```

Expected: `main` is the only local branch and only approved documentation commits are not yet remote-reachable.

### Task 3: Run the complete verification gates

**Files:**
- Verify unchanged infrastructure lifecycle and the full backend/frontend product.

**Interfaces:**
- Consumes: final local `main` before push.
- Produces: fresh shell, backend, lint, frontend test, and build evidence.

- [ ] **Step 1: Parse every retained lifecycle shell script and exercise help paths**

```bash
bash -n scripts/start_system.sh scripts/stop_system.sh scripts/start_infra_stack.sh scripts/stop_infra_stack.sh
./scripts/start_system.sh --help >/dev/null
./scripts/stop_system.sh --help >/dev/null
./scripts/start_infra_stack.sh --help >/dev/null
./scripts/stop_infra_stack.sh --help >/dev/null
```

Expected: all commands exit 0 without starting or stopping services.

- [ ] **Step 2: Run Ruff across the Python tree**

```bash
python3 -m ruff check backend src scripts tests
```

Expected: Ruff exits 0 with no findings.

- [ ] **Step 3: Run the prescribed backend test suite**

```bash
python3 -m pytest -q tests/unit tests/integration
```

Expected: all selected tests pass.

- [ ] **Step 4: Run frontend lint, tests, and production build**

```bash
cd frontend
npm run lint
CI=true npm test -- --watch=false
npm run build
```

Expected: ESLint exits 0, Vitest reports no failures, TypeScript compiles, and Vite completes the production build.

- [ ] **Step 5: Verify repository cleanliness before publication**

```bash
git diff --check
git status --short --branch
```

Expected: no worktree changes; `main` is ahead of `origin/main` only by approved documentation commits.

### Task 4: Publish, verify GitHub, and delete the local checkout

**Files:**
- Delete after remote verification: `/Users/leonardodon/super-pricing-system`
- Delete after remote verification: `/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle`

**Interfaces:**
- Consumes: clean tested `main` and verified safety bundle.
- Produces: GitHub `origin/main` containing every retained commit and no remaining local Super Pricing checkout, data, cache, or temporary bundle.

- [ ] **Step 1: Push retained commits directly to GitHub main**

```bash
git push origin main
```

Expected: push succeeds. If branch protection rejects the push, stop before deletion and use the repository's required PR path.

- [ ] **Step 2: Fetch and prove exact local/remote agreement**

```bash
git fetch --prune --tags origin
git rev-list --left-right --count main...origin/main
test "$(git rev-parse main)" = "$(git ls-remote origin refs/heads/main | awk '{print $1}')"
git status --porcelain=v1
test -z "$(git stash list)"
```

Expected: divergence is `0 0`, commit hashes match, status is empty, and there are no stashes.

- [ ] **Step 3: Confirm no process or launch item references the checkout**

```bash
ps axww -o command= | rg '/Users/leonardodon/super-pricing-system' || true
rg -l '/Users/leonardodon/super-pricing-system' /Users/leonardodon/Library/LaunchAgents /Library/LaunchAgents 2>/dev/null || true
```

Expected: both commands return no matching runtime reference.

- [ ] **Step 4: Remove the temporary bundle and local checkout**

```bash
rm -f /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle
rm -rf /Users/leonardodon/super-pricing-system
```

Expected: deletion succeeds only after Steps 1-3 pass.

- [ ] **Step 5: Verify local deletion and remote persistence from outside the checkout**

```bash
test ! -e /Users/leonardodon/super-pricing-system
test ! -e /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle
git ls-remote https://github.com/Leonard-Don/super-pricing-system.git refs/heads/main
```

Expected: both local paths are absent and GitHub still returns the verified `main` commit.
