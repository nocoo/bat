#!/usr/bin/env bash
# L3 Playwright setup script — prepares D1 database before tests run
# Called by webServer command in playwright.config.ts
set -euo pipefail

PERSIST_DIR=".wrangler/e2e-pw"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/../packages/worker"
cd "$WORKER_DIR"
if [ -n "${CLOUDFLARE_API_TOKEN:-}${CLOUDFLARE_ACCOUNT_ID:-}${CF_API_TOKEN:-}" ]; then
  echo "[L3 setup] Refusing to run with remote Cloudflare credentials in the environment."
  exit 1
fi

echo "[L3 setup] Preparing local D1 database..."

# Clean previous persist dir for fresh state
rm -rf "$PERSIST_DIR"

# Keep each test suite's secrets isolated from developer configuration.
mkdir -p .wrangler
bun -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; const ring = JSON.stringify({ active: "test", keys: { test: randomBytes(32).toString("base64url") } }); writeFileSync(".wrangler/connect-e2e-pw.env", `BAT_WRITE_KEY=playwright-write-key\nBAT_READ_KEY=playwright-read-key\nCONNECT_TOKEN_KEYS=${ring}\n`, { mode: 0o600 });'

# Apply all migrations
for migration in migrations/0*.sql; do
  echo "[L3 setup] Applying $migration..."
  bunx wrangler d1 execute bat-db --local --persist-to "$PERSIST_DIR" --file "$migration"
done

# Seed test data
echo "[L3 setup] Seeding test data..."
bunx wrangler d1 execute bat-db --local --persist-to "$PERSIST_DIR" --file "$SCRIPT_DIR/l3-seed.sql"

echo "[L3 setup] Database ready."
