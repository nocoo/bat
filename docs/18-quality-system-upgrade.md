# Quality System Upgrade — Tier C → S

> Upgrade bat from the legacy four-layer testing architecture to the six-dimension quality system:
> **three test layers (L1/L2/L3) + two gates (G1/G2) + one isolation (D1)**.

## Current Assessment (2026-03-23)

| Dimension | Status | Detail |
|-----------|:------:|--------|
| L1 Unit | ⚠️ | 1,183t — shared 100%, worker 93.8%, **dashboard 39.8%** ❌, probe 99.1% ✅ |
| G1 Static | ⚠️ | Biome `recommended` (not strict), 2 warn rules not blocking, no lint-staged, no `--error-on-warnings` |
| L2 Integration | ✅ | `wrangler.test.ts` real HTTP on :18787, 29/37 endpoints covered (78%) |
| L3 System/E2E | ✅ | Playwright 10 tests (dashboard) + Wrangler real HTTP E2E (worker) |
| G2 Security | ❌ | Zero osv-scanner, zero gitleaks — no security scanning at all |
| D1 Isolation | ⚠️ | Worker E2E uses local SQLite (`.wrangler/e2e/`), but dev/prod share same D1 ID; `bat-db-test` created but not wired |
| Hooks | ✅ | pre-commit (L1+G1), pre-push (L2) — missing G2 |
| **Tier** | **C** | L1 dashboard + G1 not strict → basic items not met |

### Target: Tier S (six dimensions all green)

---

## Step 1: G1 — Biome strict + lint-staged

**Goal**: 0 error + 0 warning, strict rules, incremental lint on staged files only.

### Current state

- `biome.json`: `recommended: true`, but `noDangerouslySetInnerHtml: warn` and `noNonNullAssertion: warn` do not block commits
- No `lint-staged` — pre-commit runs `biome check .` (full scan)
- No `--error-on-warnings` flag

### Changes

| File | Change |
|------|--------|
| `biome.json` | `warn` → `error` for both rules; add `all: true` under `linter.rules` for maximum strictness |
| `package.json` (root) | Add `lint-staged` to devDependencies; add `lint-staged` config |
| `.husky/pre-commit` | Replace `pnpm biome check .` with `pnpm lint-staged` |

### biome.json diff

```jsonc
// Before
"security": { "noDangerouslySetInnerHtml": "warn" },
"style": { "noNonNullAssertion": "warn", "useConst": "error" }

// After
"all": true,    // ← top-level in linter.rules — enable ALL rules
"recommended": true,
"security": { "noDangerouslySetInnerHtml": "error" },
"style": { "noNonNullAssertion": "error", "useConst": "error" }
```

> **Note**: `all: true` enables every Biome rule as error. Some may produce
> new violations. After enabling, run `pnpm biome check .` and triage:
> either fix violations or explicitly set specific rules to `off` with a
> comment explaining why. The goal is zero unknown suppressions.

### lint-staged config (root package.json)

```jsonc
"lint-staged": {
  "*.{ts,tsx,js,jsx,json,css}": ["biome check --error-on-warnings --no-errors-on-unmatched"]
}
```

### pre-commit hook update

```bash
# Before
echo "→ lint"
pnpm biome check .

# After
echo "→ lint (staged files)"
pnpm lint-staged
```

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 1 | `refactor: upgrade biome rules to strict with all errors` | `biome.json` + fix existing violations |
| 2 | `chore: add lint-staged for incremental lint` | `package.json` (root) — add dep + config |
| 3 | `chore: pre-commit use lint-staged instead of full biome check` | `.husky/pre-commit` |

### Verification

```bash
# After commit 1: all Biome rules pass
pnpm biome check .   # expect exit 0, 0 errors, 0 warnings

# After commit 2+3: staged lint works
echo "// test" >> packages/shared/src/version.ts
git add packages/shared/src/version.ts
pnpm lint-staged     # expect Biome runs only on version.ts
git checkout -- packages/shared/src/version.ts
```

---

## Step 2: L1 — Fix dashboard coverage gate

**Goal**: `check-coverage.sh` must **fail** (not skip) when dashboard coverage is below 90%.

### Current state

`scripts/check-coverage.sh:18-21`:
```bash
if [ -z "$coverage" ]; then
    echo "⚠ ${pkg}: no coverage data found (skipping)"
    return 0    # ← silently passes!
fi
```

Dashboard coverage is **39.8%** but the gate passes because bun test output may not
contain the `"All files"` line when the Playwright spec file errors under bun.

### Changes

| File | Change |
|------|--------|
| `scripts/check-coverage.sh` | `return 0` → `return 1` when no coverage data found |
| `packages/dashboard/package.json` | `test` script: ensure only `src/` tests run (exclude `e2e/`) — already correct: `"test": "bun test src/"` |

```bash
# After — scripts/check-coverage.sh:18-21
if [ -z "$coverage" ]; then
    echo "✘ ${pkg}: no coverage data found (FAIL — cannot verify threshold)"
    return 1    # ← now fails the gate
fi
```

### Dashboard coverage roadmap (separate effort)

Dashboard at 39.8% needs significant test work to reach 90%. Key areas to cover:

| Priority | Component | Current coverage | Files |
|----------|-----------|:----------------:|-------|
| P0 | `src/lib/` (transforms, proxy-logic, api) | ~85% | Already tested, minor gaps |
| P1 | `src/components/` (host-card, sidebar, status-badge, alert-table) | ~40% | Need render tests |
| P2 | `src/app/` pages (hosts, alerts, setup) | ~10% | Page-level logic extraction needed |

> **Strategy**: Extract logic from page components into testable ViewModel
> functions under `src/lib/`, then test those. UI thin shells (`page.tsx`,
> `layout.tsx`) are exempt from coverage per quality system rules.
>
> This is a **separate multi-day effort** — not part of this upgrade.
> The gate fix ensures visibility into the problem; fixing coverage is tracked
> independently.

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 4 | `fix: check-coverage.sh fail on missing coverage data` | `scripts/check-coverage.sh` |
| 5 | `test: dashboard coverage improvements` | `packages/dashboard/src/**/*.test.ts` (future, iterative) |

### Verification

```bash
# Simulate missing coverage
bash -c 'source scripts/check-coverage.sh; check_ts_coverage "test" ""'
# expect: exit code 1, message "no coverage data found (FAIL)"
```

---

## Step 3: G2 — Security gate (osv-scanner + gitleaks)

**Goal**: Pre-push runs dependency vulnerability scan + secrets leak detection.

### Current state

- Zero security tooling. No osv-scanner, no gitleaks, no audit of any kind.
- pre-push only runs Worker E2E.

### Changes

| File | Change |
|------|--------|
| `scripts/run-security.ts` | Create — single entry point for both tools |
| `package.json` (root) | Add `security` script |
| `.husky/pre-push` | Add G2 gate parallel to L2 |

### scripts/run-security.ts

```typescript
#!/usr/bin/env bun
/**
 * G2 Security Gate — osv-scanner (dependency CVE) + gitleaks (secrets)
 *
 * Pre-push hook runs this alongside L2 E2E tests.
 * Both tools must pass (exit 0) for push to proceed.
 */

import { $ } from "bun";

const results: { tool: string; ok: boolean; output: string }[] = [];

// 1. osv-scanner — scan bun.lock for known CVEs
console.log("→ G2: osv-scanner (dependency vulnerabilities)");
try {
  const osv = await $`osv-scanner --lockfile=bun.lock`.quiet();
  results.push({ tool: "osv-scanner", ok: true, output: osv.text() });
  console.log("  ✔ osv-scanner: no vulnerabilities found");
} catch (e: any) {
  results.push({ tool: "osv-scanner", ok: false, output: e.stderr?.toString() ?? "" });
  console.error("  ✘ osv-scanner: vulnerabilities detected");
  console.error(e.stderr?.toString() ?? e.message);
}

// 2. osv-scanner — scan Cargo.lock for Rust CVEs
console.log("→ G2: osv-scanner (Cargo.lock)");
try {
  const osv = await $`osv-scanner --lockfile=probe/Cargo.lock`.quiet();
  results.push({ tool: "osv-scanner-rust", ok: true, output: osv.text() });
  console.log("  ✔ osv-scanner (Rust): no vulnerabilities found");
} catch (e: any) {
  results.push({ tool: "osv-scanner-rust", ok: false, output: e.stderr?.toString() ?? "" });
  console.error("  ✘ osv-scanner (Rust): vulnerabilities detected");
  console.error(e.stderr?.toString() ?? e.message);
}

// 3. gitleaks — scan for leaked secrets in commits since upstream
console.log("→ G2: gitleaks (secrets leak detection)");
try {
  // Detect upstream branch dynamically
  const upstream = (await $`git rev-parse --abbrev-ref @{u}`.quiet()).text().trim();
  await $`gitleaks git --log-opts=${upstream}..HEAD --no-banner`.quiet();
  results.push({ tool: "gitleaks", ok: true, output: "" });
  console.log("  ✔ gitleaks: no leaks detected");
} catch (e: any) {
  // gitleaks exit 1 = leaks found, exit 2+ = error
  results.push({ tool: "gitleaks", ok: false, output: e.stderr?.toString() ?? "" });
  console.error("  ✘ gitleaks: potential secrets detected");
  console.error(e.stderr?.toString() ?? e.message);
}

// Summary
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n✘ G2 Security gate FAILED (${failed.map((f) => f.tool).join(", ")})`);
  process.exit(1);
}

console.log("\n✔ G2 Security gate PASSED");
```

### Tool installation

```bash
# osv-scanner (Google's open-source vulnerability scanner)
# Supports bun.lock (v2+) and Cargo.lock natively
brew install osv-scanner    # or: go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest

# gitleaks (secrets detection)
brew install gitleaks
```

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 6 | `feat: add G2 security gate script (osv-scanner + gitleaks)` | `scripts/run-security.ts`, `package.json` |
| 7 | `chore: wire G2 security gate into pre-push hook` | `.husky/pre-push` |

### Verification

```bash
# Run security gate manually
bun run scripts/run-security.ts
# expect: osv-scanner ✔, gitleaks ✔, exit 0

# Verify pre-push integration
cat .husky/pre-push
# expect: both L2 E2E and G2 security commands
```

---

## Step 4: D1 — Test environment isolation

**Goal**: `wrangler.toml` has `[env.test]` binding to `bat-db-test`, with isolation verification.

### Current state

- `bat-db-test` created: UUID `04bd8235-5aff-445f-9719-55b2836d83b7`
- `wrangler.toml` has no `[env.test]` — dev and prod both point to `bat-db` (`89d4d080-...`)
- Worker E2E uses `--local --persist-to .wrangler/e2e` (local SQLite) — **already isolated from production**
- No `_test_marker` table, no `verify-test-bindings` script

### Architecture decision

Bat's Worker E2E already achieves **physical isolation via local D1** (`.wrangler/e2e/` SQLite).
This is D1-compliant because:
- Tests never touch remote D1
- Fresh migrations applied per run
- Cleanup on teardown

The `[env.test]` binding to `bat-db-test` is for **future remote E2E** (e.g., CI/CD on
Cloudflare's infrastructure). We wire it now for completeness.

### Changes

| File | Change |
|------|--------|
| `packages/worker/wrangler.toml` | Add `[env.test]` section with `bat-db-test` binding |
| `scripts/verify-test-bindings.ts` | Create — validates `[env.test]` bindings contain `-test` suffix |
| `packages/worker/migrations/0018_test_marker.sql` | Create `_test_marker` table (only applied to test DB) |

### wrangler.toml addition

```toml
# Test environment — E2E testing with isolated resources
# Usage: wrangler dev --env test (local) or wrangler d1 execute --env test (remote)
[env.test]
name = "bat-worker-test"

[[env.test.d1_databases]]
binding = "DB"
database_name = "bat-db-test"
database_id = "04bd8235-5aff-445f-9719-55b2836d83b7"

[env.test.vars]
ENVIRONMENT = "test"
```

### verify-test-bindings.ts

```typescript
#!/usr/bin/env bun
/**
 * D1 Isolation Guard — validates that [env.test] bindings use -test suffixed resources.
 * Run before E2E to catch accidental production binding.
 */
import { readFileSync } from "node:fs";

const toml = readFileSync("packages/worker/wrangler.toml", "utf-8");

// Extract [env.test] section
const testSection = toml.match(/\[env\.test\][\s\S]*?(?=\n\[(?!env\.test)|$)/)?.[0];
if (!testSection) {
  console.error("✘ No [env.test] section found in wrangler.toml");
  process.exit(1);
}

// Check all database_name values contain -test
const dbNames = [...testSection.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
const bad = dbNames.filter((name) => !name.endsWith("-test"));

if (bad.length > 0) {
  console.error(`✘ Test bindings without -test suffix: ${bad.join(", ")}`);
  process.exit(1);
}

console.log(`✔ All test bindings verified: ${dbNames.join(", ")}`);
```

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 8 | `feat: add wrangler.toml [env.test] with bat-db-test binding` | `packages/worker/wrangler.toml` |
| 9 | `feat: add verify-test-bindings script for D1 isolation guard` | `scripts/verify-test-bindings.ts` |
| 10 | `feat: add _test_marker migration for test DB identification` | `packages/worker/migrations/0018_test_marker.sql` |

### Verification

```bash
# Verify test bindings
bun run scripts/verify-test-bindings.ts
# expect: "✔ All test bindings verified: bat-db-test"

# Apply marker to test DB (remote)
cd packages/worker
npx wrangler d1 execute bat-db-test --remote --command "CREATE TABLE IF NOT EXISTS _test_marker (key TEXT PRIMARY KEY, value TEXT); INSERT OR REPLACE INTO _test_marker VALUES ('env', 'test');"

# Verify marker
npx wrangler d1 execute bat-db-test --remote --command "SELECT * FROM _test_marker;"
# expect: env | test
```

---

## Step 5: Hooks — align to six-dimension mapping

**Goal**: pre-commit = L1 + G1, pre-push = L2 ‖ G2.

### Current hooks

```
pre-commit: typecheck → biome check → check-coverage.sh → cargo lint
pre-push:   worker E2E only
```

### Target hooks

```
pre-commit: G1 (typecheck + lint-staged + cargo lint) → L1 (check-coverage.sh)
pre-push:   L2 (worker E2E) ‖ G2 (run-security.ts)
```

### .husky/pre-commit (updated)

```bash
#!/usr/bin/env bash
# pre-commit: L1 (Unit tests + coverage) + G1 (Static analysis)
set -euo pipefail

echo "🦇 bat pre-commit — L1 + G1"

# G1: TypeScript typecheck
echo "→ G1: typecheck"
pnpm turbo typecheck

# G1: Biome lint (staged files only via lint-staged)
echo "→ G1: lint (staged)"
pnpm lint-staged

# L1: Unit tests with coverage (TS ≥90%, Rust ≥95%)
echo "→ L1: unit tests + coverage"
bash scripts/check-coverage.sh 90 95

# G1: Rust lint (only if probe/ changed)
if git diff --cached --name-only | grep -q '^probe/'; then
  echo "→ G1: rust lint"
  cd probe
  cargo fmt --check
  cargo clippy -- -D warnings
  cd ..
fi

echo "✔ pre-commit passed (L1 + G1)"
```

### .husky/pre-push (updated)

```bash
#!/usr/bin/env bash
# pre-push: L2 (Integration/API E2E) + G2 (Security)
set -euo pipefail

echo "🦇 bat pre-push — L2 + G2"

# L2: Worker API E2E tests (self-bootstraps Wrangler dev server)
echo "→ L2: Worker API E2E"
pnpm --filter @bat/worker test:e2e

# G2: Security gate (osv-scanner + gitleaks)
echo "→ G2: security scan"
bun run scripts/run-security.ts

echo "✔ pre-push passed (L2 + G2)"
```

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 11 | `refactor: align hooks to six-dimension quality mapping (L1+G1, L2+G2)` | `.husky/pre-commit`, `.husky/pre-push` |

### Verification

```bash
# Dry-run pre-commit
bash .husky/pre-commit
# expect: G1 typecheck → G1 lint → L1 tests → passed

# Dry-run pre-push
bash .husky/pre-push
# expect: L2 E2E → G2 security → passed
```

---

## Step 6: Documentation update

**Goal**: Update docs index and testing doc to reflect six-dimension system.

### Changes

| File | Change |
|------|--------|
| `docs/README.md` | Add row #18 (this document) |
| `docs/07-testing.md` | Update from four-layer to six-dimension terminology |

### Atomic commits

| # | Commit message | Scope |
|---|----------------|-------|
| 12 | `docs: add quality system upgrade document and update index` | `docs/18-quality-system-upgrade.md`, `docs/README.md` |

---

## Commit Summary

| # | Message | Dimension | Files |
|---|---------|-----------|-------|
| 1 | `refactor: upgrade biome rules to strict with all errors` | G1 | `biome.json` + violation fixes |
| 2 | `chore: add lint-staged for incremental lint` | G1 | `package.json` |
| 3 | `chore: pre-commit use lint-staged instead of full biome check` | G1 | `.husky/pre-commit` |
| 4 | `fix: check-coverage.sh fail on missing coverage data` | L1 | `scripts/check-coverage.sh` |
| 5 | `test: dashboard coverage improvements` | L1 | `packages/dashboard/src/**/*.test.ts` (iterative) |
| 6 | `feat: add G2 security gate script (osv-scanner + gitleaks)` | G2 | `scripts/run-security.ts`, `package.json` |
| 7 | `chore: wire G2 security gate into pre-push hook` | G2 | `.husky/pre-push` |
| 8 | `feat: add wrangler.toml [env.test] with bat-db-test binding` | D1 | `packages/worker/wrangler.toml` |
| 9 | `feat: add verify-test-bindings script for D1 isolation guard` | D1 | `scripts/verify-test-bindings.ts` |
| 10 | `feat: add _test_marker migration for test DB identification` | D1 | `packages/worker/migrations/0018_test_marker.sql` |
| 11 | `refactor: align hooks to six-dimension quality mapping` | Hooks | `.husky/pre-commit`, `.husky/pre-push` |
| 12 | `docs: add quality system upgrade document and update index` | Docs | `docs/18-*.md`, `docs/README.md` |

---

## Post-Upgrade Assessment (Expected)

| Dimension | Before | After | Notes |
|-----------|:------:|:-----:|-------|
| L1 Unit | ⚠️ | ⚠️→✅ | Gate fixed (commit 4). Dashboard 39.8% will **block commits** until tests are added (commit 5, separate effort) |
| G1 Static | ⚠️ | ✅ | Biome strict + lint-staged + 0 warnings (commits 1-3) |
| L2 Integration | ✅ | ✅ | Already passing. 7 uncovered endpoints tracked as backlog |
| L3 System/E2E | ✅ | ✅ | Playwright (dashboard) + Wrangler E2E (worker) already in place |
| G2 Security | ❌ | ✅ | osv-scanner + gitleaks installed and gated (commits 6-7) |
| D1 Isolation | ⚠️ | ✅ | `[env.test]` wired to `bat-db-test`, verify script, marker table (commits 8-10) |
| Hooks | ✅ | ✅ | Aligned to L1+G1 / L2+G2 mapping (commit 11) |

### Tier progression

- **Immediate** (commits 1-4, 6-11): Tier C → **Tier B** (G1 ✅, but L1 gate now correctly fails on dashboard)
- **After dashboard tests** (commit 5): Tier B → **Tier S** (all six dimensions green)

### Blocking issue for Tier S

Dashboard coverage must reach ≥ 90%. Current: 39.8%. Estimated effort: 4-8 hours.
This is tracked as a **separate task** — not part of the infrastructure upgrade.

---

## Appendix: Tool Installation

```bash
# One-time setup (macOS)

# osv-scanner — Google's open-source vulnerability scanner
brew install osv-scanner
osv-scanner --version   # expect v2.x (v2+ required for bun.lock support)

# gitleaks — secrets detection
brew install gitleaks
gitleaks version

# lint-staged — incremental lint for staged files
pnpm add -D -w lint-staged
```

## Appendix: Six-Dimension Reference

| Dimension | What | When | Tool |
|-----------|------|------|------|
| **L1** Unit | Logic, pure functions, ≥90% coverage | pre-commit | `bun test --coverage`, `cargo llvm-cov` |
| **L2** Integration | Real HTTP E2E, 100% API coverage | pre-push | `wrangler.test.ts` on :18787 |
| **L3** System/E2E | Browser flows, user perspective | manual/CI | Playwright on :28787 |
| **G1** Static | 0 error + 0 warning, strict | pre-commit | `biome check --error-on-warnings`, `cargo clippy -D warnings` |
| **G2** Security | CVE scan + secrets detection | pre-push | `osv-scanner`, `gitleaks` |
| **D1** Isolation | Test resources physically separated | build-time | `[env.test]`, `verify-test-bindings.ts`, `_test_marker` |
