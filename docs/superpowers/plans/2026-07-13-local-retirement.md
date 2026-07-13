# Super Pricing Local Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discard the obsolete infrastructure-removal WIP, verify the current supported product, publish every approved retained commit to GitHub, and remove the local checkout and its data.

**Architecture:** Preserve a temporary verified Git bundle, keep the supported `origin/main` infrastructure lifecycle, and discard only obsolete local stash/tag state. Retain the review-discovered symmetric Celery shutdown fix and deterministic signal-panel test fix alongside the retirement documentation. Run the full backend and frontend gates before pushing; delete the checkout only after every retained commit is present on `origin/main`.

**Tech Stack:** Bash 3.2-compatible shell, Python 3, pytest, Ruff, React/TypeScript, Vitest/Vite, Git/GitHub, optional TimescaleDB/Redis runtime.

## Global Constraints

- Keep only code that is still valuable on current `origin/main` and passes its relevant tests.
- Do not upload or retain `.env`, `data/`, caches, databases, logs, build products, or run history.
- Use Chinese commit messages for retained changes.
- Discard the May 2 infrastructure-removal stash in full: current main intentionally supports `--with-infra`, TimescaleDB, Redis, Celery worker/beat, health checks, and matching deployment documentation.
- Discard the conflicting local `v4.1.0` tag and fetch the GitHub tag before final verification.
- Do not delete the checkout until all retained commits are present on `origin/main` and the safety bundle has been verified.

## File Map

- Preserve unchanged: `docker-compose.pricing-infra.yml`, `scripts/start_infra_stack.sh`, `scripts/stop_infra_stack.sh`, `scripts/start_system.sh`, `scripts/health_check.py` — supported local TimescaleDB, Redis, and runtime lifecycle.
- Retain reviewed fix: `scripts/stop_system.sh`, `tests/unit/test_stop_system_contract.py` — `--with-worker` stops beat before worker and is covered by isolated behavior tests.
- Retain reviewed test repair: `tests/unit/test_signal_panel.py` — the fixed historical fixture uses an explicit reference clock.
- Preserve: `docs/superpowers/specs/2026-07-13-local-retirement-design.md` — approved retirement design.
- Preserve: `docs/superpowers/plans/2026-07-13-local-retirement.md` — this execution plan.

---

## Post-review outcome and plan deviations

- Task 1 created a complete external Git bundle after a branch-only fetch confirmed that live `origin/main` had not advanced. Independent bare-repository recovery verified `main`, `refs/stash`, remote refs, and tags; the ordering deviation did not change any captured ref.
- Task 2 discarded the infrastructure-removal stash in full and replaced the conflicting local `v4.1.0` tag with the canonical GitHub tag. Review then found and fixed the beat/worker stop asymmetry described in the File Map.
- Task 3's complete gates found a time-dependent signal-panel test; its reference clock was fixed without production-code changes. The enforced Ruff/Pyflakes baseline, focused Ruff, backend tests, frontend lint/tests, and production build then passed; the repository-wide Ruff historical debt remains advisory under current CI policy.
- Consequently, the retained branch includes documentation plus the reviewed shell and test corrections. Later publication checks must account for this complete retained set rather than assume documentation-only commits.

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

Expected: fetch succeeds and every local-only commit is part of the explicitly reviewed retained set.

- [ ] **Step 3: Rebase the retained branch only if GitHub main advanced**

```bash
git rebase origin/main
git status --short --branch
```

Expected: worktree is clean and `main` is ahead only by explicitly reviewed retained commits.

### Task 2: Prove the infrastructure-removal stash is obsolete and discard it

**Files:**
- Preserve unchanged: `docker-compose.pricing-infra.yml`
- Preserve unchanged: `scripts/start_infra_stack.sh`
- Preserve unchanged: `scripts/stop_infra_stack.sh`
- Preserve unchanged: `scripts/start_system.sh`
- Preserve unchanged: `scripts/health_check.py`
- Preserve unchanged: `README.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/alt_data_audit.md`
- Modify and retain: `scripts/stop_system.sh`
- Create and retain: `tests/unit/test_stop_system_contract.py`

**Interfaces:**
- Consumes: current infrastructure code and the `infra-removal-wip-pre-l3` stash.
- Produces: no remaining stash, the canonical remote tag, and the tested beat-before-worker shutdown correction found during review.

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

Expected: `main` is the only local branch and every commit not yet remote-reachable belongs to the reviewed retained set.

### Task 3: Run the complete verification gates

**Files:**
- Verify the retained infrastructure lifecycle, including the reviewed `stop_system.sh` correction, and the full backend/frontend product.

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

- [ ] **Step 2: Run the enforced Ruff/Pyflakes baseline, then audit the full Python tree**

```bash
python3 scripts/check_ruff_pyflakes_baseline.py
python3 -m ruff check backend src scripts tests
```

Expected: the enforced Pyflakes baseline exits 0 with no new violations. The
full-tree Ruff run is advisory under the current CI policy: record its exit
status and complete finding statistics without treating the known historical
long tail as a Task 3 regression. Any Python file changed during Task 3 must
still pass a focused Ruff check.

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

Expected: no worktree changes; `main` is ahead of `origin/main` only by the
reviewed retained documentation, shell correction, and test corrections
summarized in the Post-review outcome above.

### Task 4: Publish, verify GitHub, and delete the local checkout

**Files:**
- Delete after remote verification: `/Users/leonardodon/super-pricing-system`
- Delete after remote verification: `/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle`
- Create before push and delete only after post-checkout remote verification: `/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/expected-main.sha`

**Interfaces:**
- Consumes: clean tested `main` and verified safety bundle.
- Produces: GitHub `origin/main` containing every retained commit at the exact expected SHA and no remaining local Super Pricing checkout, data, cache, bundle, or SHA marker.

- [ ] **Step 1: Persist the expected SHA outside the checkout, then push retained commits**

```bash
set -eu
EXPECTED_MAIN_MARKER=/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/expected-main.sha
mkdir -p "$(dirname "$EXPECTED_MAIN_MARKER")"
test ! -e "$EXPECTED_MAIN_MARKER"
test ! -e "${EXPECTED_MAIN_MARKER}.tmp"
umask 077
git rev-parse --verify main > "${EXPECTED_MAIN_MARKER}.tmp"
mv "${EXPECTED_MAIN_MARKER}.tmp" "$EXPECTED_MAIN_MARKER"
test "$(cat "$EXPECTED_MAIN_MARKER")" = "$(git rev-parse --verify main)"
git push origin main
```

Expected: the external marker contains the exact retained `main` SHA and push succeeds. If marker creation or push fails, stop before deletion; if branch protection rejects the push, use the repository's required PR path.

- [ ] **Step 2: Fetch and prove exact local/remote agreement**

```bash
set -eu
EXPECTED_MAIN_MARKER=/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/expected-main.sha
expected_main_sha="$(cat "$EXPECTED_MAIN_MARKER")"
git fetch --prune --tags origin
divergence="$(git rev-list --left-right --count main...origin/main)"
set -- $divergence
test "$#" -eq 2
test "$1" -eq 0
test "$2" -eq 0
test "$(git rev-parse --verify main)" = "$expected_main_sha"
remote_main_line="$(git ls-remote origin refs/heads/main)"
set -- $remote_main_line
test "$#" -eq 2
test "$1" = "$expected_main_sha"
test "$2" = refs/heads/main
test -z "$(git status --porcelain=v1)"
test -z "$(git stash list)"
```

Expected: divergence is `0 0`, local and remote `main` both exactly match the external expected-SHA marker, status is empty, and there are no stashes.

- [ ] **Step 3: Confirm no process or launch item references the checkout**

```bash
set -u
checkout_pattern='/Users/leonardodon/super-pricing-syste[m]'

if process_snapshot="$(ps axww -o command=)"; then
    ps_status=0
else
    ps_status=$?
fi
if [ "$ps_status" -ne 0 ]; then
    printf 'process enumeration failed (status %s); refusing deletion\n' "$ps_status" >&2
    exit 1
fi

if process_matches="$(printf '%s\n' "$process_snapshot" | rg "$checkout_pattern")"; then
    process_rg_status=0
else
    process_rg_status=$?
fi
case "$process_rg_status" in
    0)
        printf 'checkout process references found; refusing deletion:\n%s\n' "$process_matches" >&2
        exit 1
        ;;
    1) ;;
    *)
        printf 'process reference scan failed (rg status %s); refusing deletion\n' "$process_rg_status" >&2
        exit 1
        ;;
esac

if launch_matches="$(rg -l --hidden --no-ignore "$checkout_pattern" /Users/leonardodon/Library/LaunchAgents /Library/LaunchAgents)"; then
    launch_rg_status=0
else
    launch_rg_status=$?
fi
case "$launch_rg_status" in
    0)
        printf 'checkout LaunchAgent references found; refusing deletion:\n%s\n' "$launch_matches" >&2
        exit 1
        ;;
    1) ;;
    *)
        printf 'LaunchAgent reference scan failed (rg status %s); refusing deletion\n' "$launch_rg_status" >&2
        exit 1
        ;;
esac
```

Expected: the bracketed process regex does not match its own `rg` command. For each `rg` scan, status 1 means no reference; status 0 prints the real matches and exits 1, while status greater than 1 exits 1 as a fail-closed scan error. A `ps` error also exits 1.

- [ ] **Step 4: Remove the temporary bundle and local checkout**

```bash
set -eu
rm -f /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle
rm -rf /Users/leonardodon/super-pricing-system
```

Expected: deletion succeeds only after Steps 1-3 pass. The expected-SHA marker remains outside the checkout for Step 5.

- [ ] **Step 5: Verify local deletion and remote persistence from outside the checkout**

```bash
set -eu
EXPECTED_MAIN_MARKER=/Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/expected-main.sha
test ! -e /Users/leonardodon/super-pricing-system
test ! -e /Users/leonardodon/Documents/Codex/2026-07-13/qu-a/work/retirement-safety/super-pricing-before-cleanup.bundle
expected_main_sha="$(cat "$EXPECTED_MAIN_MARKER")"
if ! remote_main_line="$(git ls-remote https://github.com/Leonard-Don/super-pricing-system.git refs/heads/main)"; then
    printf 'remote main lookup failed after local deletion; preserving SHA marker\n' >&2
    exit 1
fi
set -- $remote_main_line
if [ "$#" -ne 2 ] || [ "$1" != "$expected_main_sha" ] || [ "$2" != refs/heads/main ]; then
    printf 'remote main does not exactly match expected SHA; preserving SHA marker\n' >&2
    exit 1
fi
rm -f "$EXPECTED_MAIN_MARKER"
test ! -e "$EXPECTED_MAIN_MARKER"
```

Expected: both local paths are absent, GitHub returns exactly the SHA persisted before push, and only then is the external marker removed.
