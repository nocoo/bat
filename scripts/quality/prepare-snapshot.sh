#!/usr/bin/env bash
set -euo pipefail

repo="${1:?repository required}"
snapshot="${2:?snapshot required}"

bun "$repo/scripts/quality/install-state.mjs" --check "$snapshot"

mkdir -p "$snapshot/node_modules" "$snapshot/.cache"
for entry in "$repo/node_modules"/*; do
	[ -e "$entry" ] || continue
	ln -s "$entry" "$snapshot/node_modules/${entry##*/}"
done
ln -s "$repo/node_modules/.bin" "$snapshot/node_modules/.bin"
mkdir -p "$snapshot/node_modules/.vite" "$snapshot/node_modules/.vitest"

for package_dir in "$snapshot"/packages/*; do
	[ -d "$package_dir" ] || continue
	repo_nm="$repo/packages/${package_dir##*/}/node_modules"
	snap_nm="$package_dir/node_modules"
	[ -d "$repo_nm" ] || continue
	mkdir -p "$snap_nm"
	for entry in "$repo_nm"/*; do
		[ -e "$entry" ] || continue
		base="${entry##*/}"
		[ "$base" = "@bat" ] && continue
		ln -s "$entry" "$snap_nm/$base"
	done
	mkdir -p "$snap_nm/@bat"
	[ "${package_dir##*/}" = "shared" ] || ln -sfn "../../../shared" "$snap_nm/@bat/shared"
done
