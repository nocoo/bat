#!/usr/bin/env bash
set -euo pipefail

# Seed local development database with 32 rich hosts and realistic telemetry
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${DIR}/.." && pwd)"

echo "==> Applying local D1 migrations..."
cd "${ROOT_DIR}/packages/worker"
npx wrangler d1 migrations apply bat-db --local

echo "==> Seeding rich dataset (32+ hosts, metrics, tier2, webhooks, events)..."
npx wrangler d1 execute bat-db --local --file="${ROOT_DIR}/scripts/seed-32-hosts.sql"

echo "==> Done! Local D1 database populated successfully."
