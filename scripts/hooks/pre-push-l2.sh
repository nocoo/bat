#!/usr/bin/env bash
# pre-push: L2 (Integration E2E) + G2 (Security gate)
set -e
set -o pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../ensure-tools.sh
source "$HOOK_DIR/../ensure-tools.sh"
require_tool osv-scanner "dependency audit"
require_tool gitleaks "secrets scanning"
[ -f bun.lock ] || {
	echo "❌ bun.lock not found" >&2
	exit 1
}

TMPDIR_HOOK=$(mktemp -d -t bat-prepush-XXXXXX)
trap 'rm -rf "$TMPDIR_HOOK"' EXIT

run_bg() {
	local name="$1"
	shift
	( "$@" >"$TMPDIR_HOOK/$name.log" 2>&1; echo $? >"$TMPDIR_HOOK/$name.exit" ) &
	eval "PID_$name=$!"
}

wait_stage() {
	local name="$1"
	pid_var="PID_$name"
	pid=${!pid_var}
	status=$(cat "$TMPDIR_HOOK/$name.exit" 2>/dev/null || echo 1)
	wait "$pid" 2>/dev/null || true
	status=$(cat "$TMPDIR_HOOK/$name.exit" 2>/dev/null || echo 1)
	echo "━━━ $name (exit=$status) ━━━"
	cat "$TMPDIR_HOOK/$name.log"
	if [ "$status" -ne 0 ]; then
		echo "❌ pre-push stage '$name' failed" >&2
		exit "$status"
	fi
}

run_bg l2_e2e bun run turbo test:e2e --filter=@bat/worker
run_bg g2_security bun run gate:security

wait_stage l2_e2e
wait_stage g2_security

echo "✔ pre-push passed (L2 + G2)"
