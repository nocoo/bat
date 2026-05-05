#!/usr/bin/env bash
# CI setup that must run after bun install and before quality gates.
set -euo pipefail

if ! command -v cargo-llvm-cov &>/dev/null; then
  rustup component add llvm-tools-preview
  cargo install cargo-llvm-cov --locked
fi

cd node_modules/better-sqlite3
npx --yes node-gyp rebuild
cd ../..

bun run build
