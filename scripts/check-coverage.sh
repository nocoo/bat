#!/usr/bin/env bash
# Check coverage output from bun test --coverage
# Fails if any package drops below the threshold
set -euo pipefail

THRESHOLD="${1:-90}"

check_coverage() {
  local pkg="$1"
  local output="$2"

  # bun test --coverage outputs a table with "All files" summary line
  # Format: All files | XX.XX | XX.XX | XX.XX
  local coverage
  coverage=$(echo "$output" | grep -E "^All files" | awk -F'|' '{print $2}' | tr -d ' ' | head -1)

  if [ -z "$coverage" ]; then
    echo "⚠ ${pkg}: no coverage data found (skipping)"
    return 0
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

echo "Checking coverage threshold: ${THRESHOLD}%"
echo "---"

failed=0

for pkg in shared worker dashboard; do
  filter="@bat/${pkg}"
  output=$(pnpm --filter "$filter" test -- --coverage 2>&1) || true
  if ! check_coverage "$filter" "$output"; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "---"
  echo "Coverage check FAILED"
  exit 1
fi

echo "---"
echo "Coverage check PASSED"
