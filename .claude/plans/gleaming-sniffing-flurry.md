# Plan: Docs Update + D1 Isolation Deepening + Hook Review

## Context

After expanding L3 from 9→36 tests and adding D1 check to pre-push, several smaller items need fixing:
1. `docs/07-testing.md` has stale info (L3 "Not implemented", `pnpm-lock.yaml` reference)
2. D1 isolation is shallow (1 layer) vs zhe's 4-layer chain
3. Hooks need review for correctness and consistency

## Changes

### 1. Update `docs/07-testing.md`

| Line | Issue | Fix |
|------|-------|-----|
| 11 | `06-ui.md — UI SPA (build only, no tests)` | → `06-ui.md — UI SPA (L3 Playwright E2E)` |
| 93-99 | L3 section says "Not implemented" | Rewrite with actual status: 36 tests, 7 spec files, 7 pages, port 27787, Chromium |
| 108-109 | `pnpm-lock.yaml` | → `bun.lock` |
| 159-166 | pre-push section missing D1 check | Add D1 isolation check step |
| Post-line 184 | CI section missing L3 job | Add `l3-e2e` job description |
| 19-26 | Dimension table L3 trigger "manual/CI" | Keep as-is (correct — not in hooks) |

### 2. Deepen D1 Isolation (2 new layers)

Current: 1 layer (binding name `-test` suffix check via `verify-test-bindings.ts`)

Add:
- **Layer 2**: L2 E2E `beforeAll` — query `_test_marker` table to confirm test DB identity. Migration `0018_test_marker.sql` already exists and is applied. Add a check at L2 test startup.
- **Layer 3**: L3 Playwright `globalSetup` — hit `/api/live` or a test endpoint to verify the Wrangler instance is using test DB (check _test_marker via a fetch).

Actually, L2 already applies migrations including `0018_test_marker.sql` to its local D1 — the marker is there. But there's no runtime assertion. Add a test case in L2 that queries `_test_marker` to verify isolation.

For L3: the Playwright tests run against a local Wrangler that uses `--persist-to .wrangler/e2e-pw` — this is inherently isolated (local miniflare D1, not remote). Adding a `_test_marker` check would require an API endpoint to query it, which doesn't exist. Skip this — local Wrangler is already fully isolated by design.

**Revised plan**: Add one L2 test case that queries `_test_marker` to verify the test DB is correctly identified. Update `verify-test-bindings.ts` to also check `worker_name` if present in `[env.test]`.

### 3. Review & Fix Hooks

**pre-commit** — looks correct:
- 5 parallel stages: unit_cov, typecheck, lint, gitleaks, rust_lint (conditional)
- gitleaks in pre-commit ✅ (matches zhe)
- Comment says "L1 + G1" but gitleaks is G2 → fix comment to "L1 + G1 + G2-secrets"

**pre-push** — looks correct:
- D1 check (synchronous) → l2_e2e + osv_js + osv_rust (parallel)
- Comment already updated to "L2 + G2 + D1" ✅

Only fix: pre-commit header comment should mention G2 (gitleaks).

## Files to Modify

| File | Change |
|------|--------|
| `docs/07-testing.md` | Update L3 section, fix pnpm ref, add D1 to pre-push, add L3 CI job |
| `packages/worker/test/e2e/wrangler.test.ts` | Add `_test_marker` isolation verification test |
| `.husky/pre-commit` | Fix comment: "L1 + G1 + G2-secrets" |

## Verification

1. `bun turbo test:e2e --filter=@bat/worker` — new _test_marker test passes
2. Review docs accuracy by reading final file
3. Commit and push — pre-commit + pre-push hooks pass
