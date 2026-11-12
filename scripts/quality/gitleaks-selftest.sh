#!/usr/bin/env bash
set -euo pipefail

repo="${1:?repository required}"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/bat-gitleaks-XXXXXX")
trap 'rm -rf "$tmp"' EXIT

cat >"$tmp/probe.txt" <<'EOF'
aws_access_key_id = "AKIAIOSFODNN7EXAMPLZ"
EOF

if gitleaks detect --no-git --source "$tmp" --config "$repo/.gitleaks.toml" --no-banner --redact \
	>"$tmp/report.log" 2>&1; then
	echo "gitleaks self-test did not detect the synthetic secret" >&2
	exit 1
fi
grep -q "leaks found" "$tmp/report.log" || {
	cat "$tmp/report.log" >&2
	echo "gitleaks self-test failed for an operational reason, not a detected leak" >&2
	exit 1
}
