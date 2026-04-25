#!/usr/bin/env bash
# Check coverage for TypeScript packages (vitest) and Rust probe (cargo-llvm-cov)
# Fails if any package drops below the threshold
set -euo pipefail

THRESHOLD="${1:-95}"
RUST_THRESHOLD="${2:-90}"

# Parse the vitest v8 coverage "All files" row.
# Format:
#   File       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
#   All files  |  98.11  |  95.06   |  99.34  |  98.01  |
#
# We check line coverage (column 5).
check_ts_coverage() {
  local pkg="$1"
  local output="$2"

  # Preferred: parse the "Lines : X% (Y/Z)" line from the coverage summary,
  # which is printed whether or not any per-file rows are present.
  local coverage
  coverage=$(echo "$output" | grep -E "^Lines\s*:" | awk -F'[:%]' '{print $2}' | tr -d ' ' | head -1)

  # Fallback: parse the "All files" row (only present when at least one file
  # has < 100% coverage).
  if [ -z "$coverage" ]; then
    coverage=$(echo "$output" | grep -E "^All files" | awk -F'|' '{print $5}' | tr -d ' ' | head -1)
  fi

  if [ -z "$coverage" ]; then
    echo "✘ ${pkg}: no coverage data found (FAIL — cannot verify threshold)"
    return 1
  fi

  local int_coverage
  int_coverage=$(echo "$coverage" | cut -d. -f1)

  if [ "$int_coverage" -lt "$THRESHOLD" ]; then
    echo "✘ ${pkg}: coverage ${coverage}% < ${THRESHOLD}% threshold"
    return 1
  fi

  echo "✔ ${pkg}: coverage ${coverage}% ≥ ${THRESHOLD}%"
  return 0
}

check_rust_coverage() {
  if ! command -v cargo-llvm-cov &>/dev/null; then
    echo "⚠ probe: cargo-llvm-cov not installed (skipping)"
    return 0
  fi

  # Prefer nightly for coverage(off) attribute support
  local toolchain=""
  if rustup run nightly rustc --version &>/dev/null; then
    toolchain="+nightly"
  else
    echo "⚠ probe: nightly toolchain not found, falling back to stable (coverage(off) annotations ignored)"
  fi

  echo "→ probe (Rust): running cargo ${toolchain:-stable} llvm-cov..."
  # shellcheck disable=SC2086
  if ! cargo $toolchain llvm-cov --fail-under-lines "$RUST_THRESHOLD" --manifest-path probe/Cargo.toml 2>&1 | tail -3; then
    echo "✘ probe: line coverage < ${RUST_THRESHOLD}% threshold"
    return 1
  fi

  echo "✔ probe: line coverage ≥ ${RUST_THRESHOLD}%"
  return 0
}

echo "Checking coverage threshold: TS=${THRESHOLD}% Rust=${RUST_THRESHOLD}%"
echo "---"

failed=0

# TypeScript packages — run vitest in each package dir
for pkg in shared worker ui; do
  pkg_dir="packages/${pkg}"
  filter="@bat/${pkg}"

  output=$(cd "$pkg_dir" && npx vitest run --coverage 2>&1) || true
  if ! check_ts_coverage "$filter" "$output"; then
    failed=1
  fi
done

# Rust probe
if ! check_rust_coverage; then
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "---"
  echo "Coverage check FAILED"
  exit 1
fi

echo "---"
echo "Coverage check PASSED"
