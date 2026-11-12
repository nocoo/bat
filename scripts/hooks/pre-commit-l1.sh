#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../ensure-tools.sh
source "$HOOK_DIR/../ensure-tools.sh"
require_tool gitleaks "G1 staged secret scan"
require_tool bun "quality checks"
require_tool git "index snapshot"
require_tool timeout "per-slot timeouts"
require_tool cargo "Rust S1/S2"
require_tool rustup "Rust toolchain"
require_tool python3 "script tests"
require_tool npx "TypeScript coverage"

repo=$(git rev-parse --show-toplevel)
snapshot=
logs=
pids=

cleanup() {
	status=$?
	trap - EXIT INT TERM HUP
	for pid in ${pids:-}; do
		kill "$pid" 2>/dev/null || true
		wait "$pid" 2>/dev/null || true
	done
	if [ -n "${logs:-}" ]; then rm -rf "$logs"; fi
	if [ -n "${snapshot:-}" ]; then rm -rf "$snapshot"; fi
	exit "$status"
}
trap cleanup EXIT
trap "exit 130" INT
trap "exit 143" TERM
trap "exit 129" HUP

snapshot=$(mktemp -d "${TMPDIR:-/tmp}/bat-index-XXXXXX")
logs=$(mktemp -d "${TMPDIR:-/tmp}/bat-precommit-XXXXXX")
bash "$repo/scripts/quality/git-snapshot.sh" index "$repo" "$snapshot"
timeout 30 gitleaks git --staged --config "$snapshot/.gitleaks.toml" --no-banner --redact
timeout 30 bash "$repo/scripts/quality/gitleaks-selftest.sh" "$snapshot"
bash "$repo/scripts/quality/prepare-snapshot.sh" "$repo" "$snapshot"

cd "$snapshot"
export PATH="$repo/node_modules/.bin:$PATH"
export XDG_CACHE_HOME="$repo/.cache/quality/xdg"
export XDG_STATE_HOME="$repo/.cache/quality/state"
export TURBO_CACHE_DIR="$repo/.cache/quality/turbo"
export CARGO_TARGET_DIR="$repo/.cache/quality/cargo-lint"
export CARGO_INCREMENTAL=0
mkdir -p "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$TURBO_CACHE_DIR" "$CARGO_TARGET_DIR"

timeout 60 bun turbo build --filter=@bat/shared

run_bg() {
	name="$1"
	seconds="$2"
	shift 2
	(
		cd "$snapshot"
		export PATH="$repo/node_modules/.bin:$PATH"
		export XDG_CACHE_HOME="$repo/.cache/quality/xdg"
		export XDG_STATE_HOME="$repo/.cache/quality/state"
		export TURBO_CACHE_DIR="$repo/.cache/quality/turbo"
		export CARGO_TARGET_DIR="$repo/.cache/quality/cargo-lint"
		export CARGO_INCREMENTAL=0
		exec timeout --kill-after=5 "$seconds" "$@" >"$logs/$name.log" 2>&1
	) &
	pid=$!
	pids="$pids $pid"
	eval "pid_$name=$pid"
}

wait_stage() {
	name="$1"
	pid="$2"
	if wait "$pid" 2>/dev/null; then status=0; else status=$?; fi
	echo "━━━ $name (exit=$status) ━━━"
	cat "$logs/$name.log" 2>/dev/null || true
	if [ "$status" -ne 0 ]; then
		echo "❌ pre-commit stage '$name' failed" >&2
		exit "$status"
	fi
}

run_bg types 90 bun turbo typecheck
run_bg lint 60 bun run lint
run_bg focus 30 bun run scripts/check-test-focus.ts
run_bg coverage_ts 120 bash scripts/check-coverage.sh --ts
run_bg scripts_unit 60 bun test scripts/release.test.ts scripts/probe-manifest.test.ts \
	scripts/quality/z1-gate.test.ts scripts/check-test-focus.test.ts
run_bg environments 60 bun run test:environments:unit
run_bg python_unit 30 python3 -m unittest discover -s scripts -p 'test_prune_probe_releases.py'
run_bg routes 30 bun run gate:routes
run_bg pages 30 bun run gate:pages
run_bg rust_s1_s2 120 bash -c \
	'cargo fmt --check --manifest-path probe/Cargo.toml && cargo check --locked --all-features --manifest-path probe/Cargo.toml && cargo clippy --locked --all-features --manifest-path probe/Cargo.toml -- -D warnings'

if git -C "$repo" diff --cached --name-only --diff-filter=ACMR | grep -Eq \
	'^(\.github/(workflows|actions)/|scripts/check-workflows\.py$|scripts/quality/workflow-lint\.sh$)'; then
	require_tool actionlint "S3 workflow lint"
	run_bg workflow 90 bash scripts/quality/workflow-lint.sh
fi

wait_stage types "$pid_types"
wait_stage lint "$pid_lint"
wait_stage focus "$pid_focus"
wait_stage coverage_ts "$pid_coverage_ts"
wait_stage scripts_unit "$pid_scripts_unit"
wait_stage environments "$pid_environments"
wait_stage python_unit "$pid_python_unit"
wait_stage routes "$pid_routes"
wait_stage pages "$pid_pages"
wait_stage rust_s1_s2 "$pid_rust_s1_s2"
if [ -n "${pid_workflow:-}" ]; then
	wait_stage workflow "$pid_workflow"
fi

echo "✔ pre-commit passed (S1/S2/G1/L1 on the Git index snapshot)"
