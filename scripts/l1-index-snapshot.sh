#!/usr/bin/env bash
# Materialise the Git index to a temp directory and wire monorepo dependencies.
# Prints the snapshot root path on stdout; callers must remove it on exit.
set -euo pipefail

repo="${1:-$(git rev-parse --show-toplevel)}"
snapshot=$(mktemp -d "${TMPDIR:-/tmp}/bat-index-XXXXXX")

git -C "$repo" checkout-index --all --prefix="$snapshot/"

if [ ! -d "$repo/node_modules" ]; then
	echo "pre-commit: node_modules is required (run bun install --frozen-lockfile)" >&2
	exit 1
fi
if [ ! -f "$snapshot/package.json" ] || [ ! -f "$snapshot/bun.lock" ]; then
	echo "pre-commit: staged package.json and bun.lock are required" >&2
	exit 1
fi
if ! cmp -s "$snapshot/package.json" "$repo/package.json" || ! cmp -s "$snapshot/bun.lock" "$repo/bun.lock"; then
	echo "pre-commit: staged package.json/bun.lock must match the installed worktree copies" >&2
	exit 1
fi

mkdir "$snapshot/node_modules"
for entry in "$repo/node_modules"/*; do
	[ -e "$entry" ] || continue
	ln -s "$entry" "$snapshot/node_modules/${entry##*/}"
done
ln -s "$repo/node_modules/.bin" "$snapshot/node_modules/.bin"
mkdir -p "$snapshot/node_modules/.vite" "$snapshot/node_modules/.vitest" "$snapshot/.cache"

for pkg in worker ui cli; do
	repo_nm="$repo/packages/$pkg/node_modules"
	snap_nm="$snapshot/packages/$pkg/node_modules"
	[ -d "$repo_nm" ] || continue
	rm -rf "$snap_nm"
	mkdir -p "$snap_nm"
	for entry in "$repo_nm"/*; do
		base="${entry##*/}"
		[ "$base" = "@bat" ] && continue
		ln -s "$entry" "$snap_nm/$base"
	done
	mkdir -p "$snap_nm/@bat"
	ln -sf "../../../shared" "$snap_nm/@bat/shared"
done

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX
unset GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

printf '%s\n' "$snapshot"
