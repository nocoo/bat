#!/usr/bin/env bash
# L3 Playwright webServer — seed local D1, then run wrangler dev.
#
# stdout/stderr are redirected to a file on purpose. When Playwright captures
# wrangler pipes (`webServer.stdout/stderr: "pipe"`), workerd can exit mid-suite
# with EPIPE while writing request logs (cloudflare/workers-sdk#15202). That kills
# the server and turns the rest of L3 into net::ERR_CONNECTION_REFUSED noise.
# Readiness is polled via HTTP (`url` in playwright.config.ts), not log output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/../packages/worker"
LOG_FILE="$WORKER_DIR/.wrangler/e2e-pw-wrangler.log"

cd "$WORKER_DIR"
bash "$SCRIPT_DIR/l3-setup.sh"

mkdir -p "$(dirname "$LOG_FILE")"
: >"$LOG_FILE"

# Suppress per-request logs: workerd can terminate with EPIPE while emitting
# high-volume access logs during Playwright. Keep error output for diagnostics.
exec bunx wrangler dev --log-level error --port 27025 --local --persist-to .wrangler/e2e-pw \
	>>"$LOG_FILE" 2>&1
