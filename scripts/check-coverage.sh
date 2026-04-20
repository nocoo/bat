#!/usr/bin/env bash
# Check coverage for TypeScript packages (bun) and Rust probe (cargo-llvm-cov)
# Fails if any package drops below the threshold
set -euo pipefail

THRESHOLD="${1:-90}"
RUST_THRESHOLD="${2:-$THRESHOLD}"

check_ts_coverage() {
  local pkg="$1"
  local output="$2"
  local scope="${3:-all}"  # "all" uses All files line, "lib" calculates from src/lib/ lines

  if [ "$scope" = "lib" ]; then
    # Calculate weighted average of line coverage for src/lib/ files only
    # (UI thin shells — page.tsx, layout.tsx, components — are exempt per quality system)
    local total_lines=0
    local covered_lines=0
    while IFS='|' read -r file funcs lines uncovered; do
      file=$(echo "$file" | tr -d ' ')
      lines=$(echo "$lines" | tr -d ' ')
      # Skip empty lines or header
      if [[ -z "$lines" ]] || [[ "$lines" == *"Lines"* ]]; then
        continue
      fi
      if [[ "$file" == src/lib/* ]] || [[ "$file" == src/hooks/* ]]; then
        # Estimate: assume 100 lines per file as proxy weight, then apply percentage
        # Since bun doesn't output absolute line counts, use the "All files" approach
        # on a filtered test run instead
        total_lines=1
        covered_lines=1
      fi
    done <<< "$output"

    # Simpler approach: re-parse the lib-specific lines from the full coverage output
    # and compute average coverage
    local sum=0
    local count=0
    while IFS='|' read -r file funcs lines uncovered; do
      file=$(echo "$file" | tr -d ' ')
      lines=$(echo "$lines" | tr -d ' ')
      if [[ -z "$lines" ]] || [[ "$lines" == *"Lines"* ]] || [[ "$lines" == *"---"* ]]; then
        continue
      fi
      if [[ "$file" == src/lib/* ]] || [[ "$file" == src/hooks/* ]]; then
        sum=$(echo "$sum + $lines" | bc)
        count=$((count + 1))
      fi
    done <<< "$output"

    if [ "$count" -eq 0 ]; then
      echo "✘ ${pkg}: no lib coverage data found (FAIL)"
      return 1
    fi

    local coverage
    coverage=$(echo "scale=2; $sum / $count" | bc)
    local int_coverage
    int_coverage=$(echo "$coverage" | cut -d. -f1)

    if [ "$int_coverage" -lt "$THRESHOLD" ]; then
      echo "✘ ${pkg}: lib coverage ${coverage}% < ${THRESHOLD}% threshold (${count} files)"
      return 1
    fi

    echo "✔ ${pkg}: lib coverage ${coverage}% ≥ ${THRESHOLD}% (${count} files)"
    return 0
  fi

  # Default: use "All files" summary line
  # bun test --coverage outputs: All files | % Funcs | % Lines | Uncovered
  # We check line coverage (column 3)
  local coverage
  coverage=$(echo "$output" | grep -E "^All files" | awk -F'|' '{print $3}' | tr -d ' ' | head -1)

  if [ -z "$coverage" ]; then
    echo "✘ ${pkg}: no coverage data found (FAIL — cannot verify threshold)"
    return 1
  fi

  # Compare as integers (floor)
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

# TypeScript packages — run bun test directly in each package dir
# (bun --filter ... test -- --coverage breaks: bun treats --coverage after -- as a file filter)
for pkg in shared worker; do
  pkg_dir="packages/${pkg}"
  filter="@bat/${pkg}"

  output=$(cd "$pkg_dir" && bun test --coverage 2>&1) || true
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
