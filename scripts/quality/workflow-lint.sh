#!/usr/bin/env bash
set -euo pipefail

repo=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$repo"

command -v actionlint >/dev/null 2>&1 || {
	echo "actionlint is required for S3" >&2
	exit 1
}
if python3 -c 'import yaml, yamllint' >/dev/null 2>&1; then
	yamllint=(python3 -m yamllint)
elif command -v uvx >/dev/null 2>&1; then
	yamllint=(uvx --from yamllint==1.38.0 yamllint)
else
	echo "PyYAML and yamllint are required for S3" >&2
	exit 1
fi

actionlint .github/workflows/*.yml
"${yamllint[@]}" -d \
	'{extends: default, rules: {line-length: disable, document-start: disable, truthy: disable, comments: {min-spaces-from-content: 1}}}' \
	.github/workflows/*.yml
python3 scripts/check-workflows.py
