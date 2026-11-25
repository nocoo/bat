#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$repo"

command -v actionlint >/dev/null 2>&1 || {
	echo "actionlint is required for S3" >&2
	exit 1
}
python3 -c 'import yaml' >/dev/null 2>&1 || {
	echo "PyYAML is required for S3" >&2
	exit 1
}

actionlint -shellcheck= -pyflakes= .github/workflows/*.yml
python3 scripts/check-workflows.py
