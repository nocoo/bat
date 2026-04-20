#!/usr/bin/env bash
# Sourced by git hooks to enforce security tool availability.
# Missing tool → exit 1 (hard gate). Callers: require_tool <cmd> <label>

require_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ $1 is required but not found — cannot run $2." >&2
    echo "   Install: brew install $1" >&2
    exit 1
  fi
}
