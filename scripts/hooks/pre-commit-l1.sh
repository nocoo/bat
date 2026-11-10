#!/usr/bin/env bash
# pre-commit: unified L1 on the Git index snapshot (6DQ)
set -e
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../ensure-tools.sh
source "$HOOK_DIR/../ensure-tools.sh"
require_tool gitleaks "secrets scanning"
require_tool bun "L1 checks"
require_tool git "index snapshot"

snapshot=
TMPDIR_HOOK=
cleanup() {
	status=$?
	trap - EXIT INT TERM HUP
	if [ -n "$TMPDIR_HOOK" ]; then
		rm -rf "$TMPDIR_HOOK" || :
		TMPDIR_HOOK=
	fi
	if [ -n "$snapshot" ]; then
		rm -rf "$snapshot" || :
		snapshot=
	fi
	exit "$status"
}
trap cleanup EXIT
trap "exit 130" INT
trap "exit 143" TERM
trap "exit 129" HUP

repo=$(git rev-parse --show-toplevel)
gitleaks protect --staged --no-banner

snapshot=$(bash "$repo/scripts/l1-index-snapshot.sh" "$repo")
TMPDIR_HOOK=$(mktemp -d "${TMPDIR:-/tmp}/bat-precommit-XXXXXX")

export XDG_CACHE_HOME="$snapshot/.cache"
export XDG_STATE_HOME="$snapshot/.cache"
cd "$snapshot"
PATH="$snapshot/node_modules/.bin:$PATH"

bun turbo build --filter=@bat/shared

set -o pipefail

run_bg() {
	local name="$1"
	shift
	local out_log="$TMPDIR_HOOK/$name.log"
	local out_exit="$TMPDIR_HOOK/$name.exit"
	(
		cd "$snapshot"
		export PATH="$snapshot/node_modules/.bin:$PATH"
		export XDG_CACHE_HOME="$snapshot/.cache"
		export XDG_STATE_HOME="$snapshot/.cache"
		"$@" >"$out_log" 2>&1
		echo $? >"$out_exit"
	) &
	printf -v "PID_${name}" '%s' "$!"
}

wait_stage() {
	local name="$1"
	local pid_var="PID_${name}"
	local pid="${!pid_var:-}"
	local status
	if [ -z "$pid" ]; then
		echo "❌ pre-commit stage '$name' was not started" >&2
		exit 1
	fi
	wait "$pid" 2>/dev/null || true
	status=$(cat "$TMPDIR_HOOK/$name.exit" 2>/dev/null || echo 1)
	echo "━━━ $name (exit=$status) ━━━"
	cat "$TMPDIR_HOOK/$name.log"
	if [ "$status" -ne 0 ]; then
		echo "❌ pre-commit stage '$name' failed" >&2
		exit "$status"
	fi
}

run_bg unit_cov bash scripts/check-coverage.sh 90 95
run_bg typecheck bun turbo typecheck
run_bg environments bun run test:environments:unit
run_bg lint bun run lint
run_bg routes bun run gate:routes
run_bg pages bun run gate:pages
run_bg rust_lint bash -c 'cd probe && cargo fmt --check && cargo clippy -- -D warnings'

wait_stage unit_cov
wait_stage typecheck
wait_stage environments
wait_stage lint
wait_stage routes
wait_stage pages
wait_stage rust_lint

echo "✔ pre-commit passed (L1 index snapshot)"
