#!/usr/bin/env bash
# CI setup that must run after bun install and before quality gates.
set -euo pipefail

if ! command -v cargo-llvm-cov &>/dev/null; then
  rustup component add llvm-tools-preview
  cargo install cargo-llvm-cov --locked
fi

rustup toolchain install nightly --profile minimal --component llvm-tools-preview

bun run build
