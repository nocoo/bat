#!/usr/bin/env bash
# L3 Playwright setup script — prepares D1 database before tests run
# Called by webServer command in playwright.config.ts
set -e

PERSIST_DIR=".wrangler/e2e-pw"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/../packages/worker"

echo "[L3 setup] Preparing local D1 database..."

# Clean previous persist dir for fresh state
rm -rf "$PERSIST_DIR"

# Write .dev.vars if missing
if [ ! -f .dev.vars ]; then
  echo "BAT_WRITE_KEY=playwright-write-key" > .dev.vars
  echo "BAT_READ_KEY=playwright-read-key" >> .dev.vars
fi

# Apply all migrations
for migration in migrations/0*.sql; do
  echo "[L3 setup] Applying $migration..."
  bunx wrangler d1 execute bat-db --local --persist-to "$PERSIST_DIR" --file "$migration" 2>/dev/null || true
done

echo "[L3 setup] Database ready."
