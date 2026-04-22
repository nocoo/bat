#!/usr/bin/env bash
# Autoresearch benchmark: measures architectural complexity + testability.
#
# Primary metric:   complexity_score = src_loc - 4 * unit_tests_passing
#   - lower is better (simpler code, more tests both reduce score)
#   - 4 LoC credit per test prevents trivially adding 1-line tests
#
# Hard gates (must all pass):
#   - typecheck (turbo typecheck)
#   - all worker unit tests pass
#   - all shared unit tests pass
#   - no decrease in number of unit tests vs baseline (BASELINE_TESTS env)
#
# Anti-cheat:
#   - src_loc counts production .ts/.tsx files in packages/*/src, excluding
#     tests, generated files, and node_modules.
#   - Running `wc -l` on raw source — minified single-line files are easy to
#     spot in diffs; reviewers will reject them.
#   - Tests must be real (passing assertions); we count via test runner output.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "GATE_FAIL: $1" >&2; echo "METRIC complexity_score=999999"; exit 1; }

# 1) Typecheck (gate)
if ! bun run typecheck >/tmp/ar_tc.log 2>&1; then
  cat /tmp/ar_tc.log >&2
  fail "typecheck"
fi

# 2) Shared tests (gate)
SHARED_OUT=$(bun --cwd packages/shared test 2>&1) || { echo "$SHARED_OUT" >&2; fail "shared tests"; }
SHARED_PASS=$(echo "$SHARED_OUT" | grep -E "^ *[0-9]+ pass" | awk '{print $1}' | head -1)
SHARED_FAIL=$(echo "$SHARED_OUT" | grep -E "^ *[0-9]+ fail" | awk '{print $1}' | head -1)
[ "${SHARED_FAIL:-0}" = "0" ] || fail "shared tests fail=$SHARED_FAIL"

# 3) Worker tests (gate)
WORKER_OUT=$(bun --cwd packages/worker test 2>&1) || { echo "$WORKER_OUT" >&2; fail "worker tests"; }
WORKER_PASS=$(echo "$WORKER_OUT" | grep -E "^ *[0-9]+ pass" | awk '{print $1}' | head -1)
WORKER_FAIL=$(echo "$WORKER_OUT" | grep -E "^ *[0-9]+ fail" | awk '{print $1}' | head -1)
[ "${WORKER_FAIL:-0}" = "0" ] || fail "worker tests fail=$WORKER_FAIL"

# 3b) UI unit tests (gate, optional - only if any *.test.ts(x) under src/)
UI_PASS=0
if find packages/ui/src -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) -print -quit | grep -q .; then
  UI_OUT=$(bun --cwd packages/ui test 2>&1) || { echo "$UI_OUT" >&2; fail "ui tests"; }
  UI_PASS=$(echo "$UI_OUT" | grep -E "^ *[0-9]+ pass" | awk '{print $1}' | head -1)
  UI_FAIL=$(echo "$UI_OUT" | grep -E "^ *[0-9]+ fail" | awk '{print $1}' | head -1)
  [ "${UI_FAIL:-0}" = "0" ] || fail "ui tests fail=$UI_FAIL"
fi

UNIT_TESTS=$(( ${SHARED_PASS:-0} + ${WORKER_PASS:-0} + ${UI_PASS:-0} ))

# Baseline-tests gate (don't allow regression in test count)
BASELINE_TESTS="${BASELINE_TESTS:-448}"
if [ "$UNIT_TESTS" -lt "$BASELINE_TESTS" ]; then
  fail "test count regressed: $UNIT_TESTS < baseline $BASELINE_TESTS"
fi

# 4) Source LoC (production code only)
SRC_LOC=$(find packages/shared/src packages/ui/src packages/worker/src \
    -type f \( -name "*.ts" -o -name "*.tsx" \) \
    ! -name "*.test.ts" ! -name "*.test.tsx" \
    ! -path "*/__tests__/*" ! -path "*/node_modules/*" ! -path "*/dist/*" \
    -print0 2>/dev/null | xargs -0 cat | wc -l | tr -d ' ')

# 5) File counts (informational)
SRC_FILES=$(find packages/shared/src packages/ui/src packages/worker/src \
    -type f \( -name "*.ts" -o -name "*.tsx" \) \
    ! -name "*.test.ts" ! -name "*.test.tsx" \
    ! -path "*/__tests__/*" ! -path "*/node_modules/*" ! -path "*/dist/*" \
    | wc -l | tr -d ' ')

# Composite metric: simpler code AND more tests both reduce score.
# 4 LoC credit per passing test ≈ realistic "test worth" without
# rewarding fake one-liner tests too much.
SCORE=$(( SRC_LOC - 4 * UNIT_TESTS ))

echo "src_loc=$SRC_LOC src_files=$SRC_FILES unit_tests=$UNIT_TESTS"
echo "METRIC complexity_score=$SCORE"
echo "METRIC src_loc=$SRC_LOC"
echo "METRIC unit_tests=$UNIT_TESTS"
echo "METRIC src_files=$SRC_FILES"
