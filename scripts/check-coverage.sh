#!/usr/bin/env bash
set -euo pipefail

mode="${1:-all}"
case "$mode" in
	--ts) run_ts=1; run_rust=0 ;;
	--rust) run_ts=0; run_rust=1 ;;
	all) run_ts=1; run_rust=1 ;;
	*)
		echo "usage: check-coverage.sh [--ts|--rust|all]" >&2
		exit 2
		;;
esac

ts_threshold="${TS_THRESHOLD:-95}"
rust_threshold="${RUST_THRESHOLD:-95}"
failed=0

check_ts_coverage() {
	local pkg_dir="$1"
	local label="$2"
	local output
	if ! command -v npx >/dev/null 2>&1; then
		echo "npx is required for TypeScript coverage" >&2
		return 1
	fi
	if ! output=$(cd "$pkg_dir" && npx --no-install vitest run --coverage 2>&1); then
		echo "✘ ${label}: unit tests or configured coverage thresholds failed"
		echo "$output"
		return 1
	fi
	local coverage
	coverage=$(printf '%s\n' "$output" | sed -nE 's/^Lines[[:space:]]*:[[:space:]]*([0-9.]+)%.*/\1/p' | head -1)
	if [ -z "$coverage" ]; then
		echo "✘ ${label}: no coverage summary found" >&2
		return 1
	fi
	if ! awk -v value="$coverage" -v threshold="$ts_threshold" 'BEGIN { exit !(value >= threshold) }'; then
		echo "✘ ${label}: line coverage ${coverage}% < ${ts_threshold}%"
		return 1
	fi
	echo "✔ ${label}: line coverage ${coverage}% ≥ ${ts_threshold}%"
}

check_rust_coverage() {
	if ! command -v cargo-llvm-cov >/dev/null 2>&1; then
		echo "cargo-llvm-cov is required; install it before running Rust coverage" >&2
		return 1
	fi
	if ! rustup run nightly rustc --version >/dev/null 2>&1; then
		echo "nightly Rust with llvm-tools-preview is required; stable is not accepted" >&2
		return 1
	fi
	local output
	if ! output=$(cargo +nightly llvm-cov \
		--locked \
		--fail-under-lines "$rust_threshold" \
		--fail-under-functions "$rust_threshold" \
		--fail-under-regions "$rust_threshold" \
		--manifest-path probe/Cargo.toml 2>&1); then
		printf '%s\n' "$output" | tail -20
		echo "✘ probe: line/function/region coverage below ${rust_threshold}% or tests failed"
		return 1
	fi
	printf '%s\n' "$output" | tail -4
	echo "✔ probe: line/function/region coverage ≥ ${rust_threshold}%"
}

if [ "$run_ts" = 1 ]; then
	check_ts_coverage packages/shared "@bat/shared" || failed=1
	check_ts_coverage packages/worker "@bat/worker" || failed=1
	check_ts_coverage packages/ui "@bat/ui" || failed=1
	check_ts_coverage packages/cli "@nocoo/bat" || failed=1
fi

if [ "$run_rust" = 1 ]; then
	check_rust_coverage || failed=1
fi

exit "$failed"
