#!/usr/bin/env bash
set -euo pipefail

source_kind="${1:?source kind required: index or oid}"
repo="${2:?repository required}"
dest="${3:?destination required}"
oid="${4:-}"

mkdir -p "$dest"
case "$source_kind" in
	index)
		git -C "$repo" checkout-index --all --prefix="$dest/"
		;;
	oid)
		[ -n "$oid" ] || {
			echo "snapshot OID is required" >&2
			exit 2
		}
		git -C "$repo" archive --format=tar "$oid" | tar -xf - -C "$dest"
		;;
	*)
		echo "unknown snapshot source: $source_kind" >&2
		exit 2
		;;
esac

test -f "$dest/package.json" || {
	echo "snapshot is missing package.json" >&2
	exit 1
}
test -f "$dest/bun.lock" || {
	echo "snapshot is missing bun.lock" >&2
	exit 1
}
