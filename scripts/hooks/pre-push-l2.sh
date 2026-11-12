#!/usr/bin/env bash
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../ensure-tools.sh
source "$HOOK_DIR/../ensure-tools.sh"
require_tool bun "pre-push quality checks"
require_tool git "OID snapshots"
require_tool timeout "per-slot timeouts"
require_tool cargo "Rust coverage and builds"
require_tool rustup "Rust toolchain"
require_tool osv-scanner "G2 dependency scan"
require_tool gitleaks "G1 push-range scan"
require_tool node "package checks"
require_tool npm "P1 package checks"

repo=$(git rev-parse --show-toplevel)
stdin_file=$(mktemp "${TMPDIR:-/tmp}/bat-push-refs-XXXXXX")
trap 'rm -f "$stdin_file"' EXIT
cat >"$stdin_file"
[ -s "$stdin_file" ] || {
	echo "pre-push requires Git refs on stdin" >&2
	exit 1
}

push_range() {
	local_ref="$1"
	local_oid="$2"
	remote_oid="$3"
	if [[ "$local_ref" == refs/tags/* ]]; then
		printf '%s' "-1 $local_oid"
	elif [[ "$remote_oid" =~ ^0+$ ]]; then
		printf '%s' "$local_oid --not --remotes=origin"
	else
		printf '%s' "$remote_oid..$local_oid"
	fi
}

run_oid() {
	local local_ref="$1"
	local local_oid="$2"
	local remote_oid="$3"
	local snapshot logs pids name pid
	snapshot=$(mktemp -d "${TMPDIR:-/tmp}/bat-push-XXXXXX")
	logs=$(mktemp -d "${TMPDIR:-/tmp}/bat-push-log-XXXXXX")
	pids=

	cleanup_oid() {
		status=$?
		trap - EXIT INT TERM HUP
		for pid in $pids; do
			kill "$pid" 2>/dev/null || true
		done
		rm -rf "$snapshot" "$logs"
		exit "$status"
	}
	trap cleanup_oid EXIT
	trap "exit 130" INT
	trap "exit 143" TERM
	trap "exit 129" HUP

	bash "$repo/scripts/quality/git-snapshot.sh" oid "$repo" "$snapshot" "$local_oid"
	bash "$repo/scripts/quality/prepare-snapshot.sh" "$repo" "$snapshot"
	cd "$snapshot"
	export PATH="$repo/node_modules/.bin:$PATH"
	export XDG_CACHE_HOME="$repo/.cache/quality/xdg"
	export XDG_STATE_HOME="$repo/.cache/quality/state"
	export TURBO_CACHE_DIR="$repo/.cache/quality/turbo"
	export CARGO_INCREMENTAL=0
	export WRANGLER_SEND_METRICS=false
	mkdir -p "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$TURBO_CACHE_DIR"

	run_bg() {
		name="$1"
		seconds="$2"
		shift 2
		timeout "$seconds" "$@" >"$logs/$name.log" 2>&1 &
		pid=$!
		pids="$pids $pid"
		eval "pid_$name=$pid"
	}

	wait_stage() {
		name="$1"
		pid="$2"
		if wait "$pid"; then status=0; else status=$?; fi
		echo "━━━ $name (exit=$status) ━━━"
		cat "$logs/$name.log" 2>/dev/null || true
		if [ "$status" -ne 0 ]; then
			echo "❌ pre-push stage '$name' failed" >&2
			return "$status"
		fi
	}

	range=$(push_range "$local_ref" "$local_oid" "$remote_oid")
	run_bg b1 240 env CARGO_TARGET_DIR="$repo/.cache/quality/cargo-release" bash -c \
		'bun run build && (cd packages/worker && bun run build) && cargo build --locked --release --manifest-path probe/Cargo.toml'
	run_bg g1_g2 120 bun scripts/run-security.ts --root "$snapshot" \
		--gitleaks-repo "$repo" --gitleaks-log-opts "$range"
	run_bg l1_rust 240 env CARGO_TARGET_DIR="$repo/.cache/quality/cargo-cov" \
		bash scripts/check-coverage.sh --rust

	wait_stage b1 "$pid_b1"
	wait_stage g1_g2 "$pid_g1_g2"
	wait_stage l1_rust "$pid_l1_rust"
	pids=

	run_bg l3 240 env CARGO_TARGET_DIR="$repo/.cache/quality/cargo-debug" \
		BAT_PROBE_BIN="$repo/.cache/quality/cargo-debug/debug/bat-probe" bash -c \
		'cargo build --locked --manifest-path probe/Cargo.toml && bun run test:environments && bun scripts/quality/probe-integration.mjs'
	wait_stage l3 "$pid_l3"
	pids=

	run_bg l4 240 bash -c 'bun run test:e2e:pw && bun run capture:environments'
	run_bg p1 90 bun scripts/quality/verify-package.mjs
	wait_stage l4 "$pid_l4"
	wait_stage p1 "$pid_p1"

	trap - EXIT INT TERM HUP
	rm -rf "$snapshot" "$logs"
}

while IFS=' ' read -r local_ref local_oid remote_ref remote_oid; do
	[ -n "${local_ref:-}" ] || continue
	if [[ "$local_oid" =~ ^0+$ ]]; then
		echo "pre-push: skip deleted ref $local_ref"
		continue
	fi
	if [[ ! "$local_oid" =~ ^[0-9a-f]{40}$ || ! "$remote_oid" =~ ^[0-9a-f]{40}$ ]]; then
		echo "pre-push: invalid OID for $local_ref" >&2
		exit 1
	fi
	if ! git -C "$repo" cat-file -e "$local_oid^{commit}" 2>/dev/null; then
		echo "pre-push: $local_ref points to an unknown commit $local_oid" >&2
		exit 1
	fi
	echo "pre-push: validating $local_ref at $local_oid"
	run_oid "$local_ref" "$local_oid" "$remote_oid"
done <"$stdin_file"

echo "✔ pre-push passed (G1/G2/B1/L1/L3/L4/P1 on pushed OIDs)"
