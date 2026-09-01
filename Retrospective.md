# Retrospective

Accident narratives for this repo.

Routing: narrative stays here. A project-specific rule that will recur may become one line in `CLAUDE.md`. Cross-project lessons go to nmem or a global rule. If it can be checked by a machine, add a hook or test instead of prose.

## bun is the sole package manager

- **What:** pnpm leftovers broke hooks and Docker installs.
- **Why:** only `bun.lock` exists; hooks call `bun turbo` / `bunx`.
- **Follow-up:** do not introduce pnpm.

## E2E migration list is manual

- **What:** worker E2E 500s on routes that touch new columns; pre-push blocked.
- **Why:** `packages/worker/test/e2e` applies a hardcoded migration list.
- **Follow-up:** add every new migration to that list.

## Docker Hub TLS vs pull

- **What:** `docker build` TLS-timeout to `auth.docker.io` while `docker pull` works.
- **Why:** different auth paths.
- **Follow-up:** `docker pull rust:1-alpine` then retry build.

## Dummy main.rs mtime skips cargo rebuild

- **What:** Docker dep-cache with dummy `main.rs` shipped the dummy binary.
- **Why:** `COPY` keeps old mtime so cargo skips compile.
- **Follow-up:** `touch src/main.rs` before `cargo build`.

## R2 `latest/` CDN staleness

- **What:** in-place R2 overwrite kept serving old probe binaries.
- **Why:** Cloudflare CDN cache on the same key.
- **Follow-up:** purge, versioned paths, or SCP for immediate updates.

## DROP TABLE wipes alert state

- **What:** `0003_tier2_tables.sql` cleared active alerts on deploy.
- **Why:** SQLite cannot `ALTER TABLE ... ADD CHECK`; the migration dropped `alert_states`.
- **Follow-up:** `CREATE new → INSERT SELECT → DROP old → RENAME`.

## glibc from `rust:1-slim`

- **What:** binaries failed `GLIBC_2.39 not found` on Debian 12.
- **Why:** `rust:1-slim` tracks testing glibc.
- **Follow-up:** `rust:1-alpine` + musl; `file` must show static-pie.

## Migrate D1 before Worker code

- **What:** Worker referencing new columns 500'd `/api/ingest` fleet-wide.
- **Why:** code deployed before `wrangler d1 migrations apply --remote`.
- **Follow-up:** migrate production D1 before the Worker that needs the schema. CD, not laptop `wrangler deploy`.

## Edge dashboard migration

- **What:** Next.js + Railway dashboard vs current Vite SPA on the Worker.
- **Why:** 2026-04 edge cutover; `packages/dashboard` is git history only.
- **Follow-up:** `packages/ui`; no Railway.

## Release snapshots in VERSION_TARGETS

- **What:** stale-version `rg` failed on e2e snapshots.
- **Why:** live/fleet snapshot JSON was not in `scripts/release.ts`.
- **Follow-up:** `VERSION_TARGETS` includes those snapshots; do not `--update` + amend.

## Stale cargo-llvm-cov looks like 88%

- **What:** probe coverage ~88% blocked the 95% gate.
- **Why:** leftover stable llvm-cov artifacts / missing nightly `coverage(off)`.
- **Follow-up:** `cargo +nightly llvm-cov clean` then re-run.

## Dummy worker static HTML breaks L2

- **What:** `GET / returns SPA HTML` failed pre-push.
- **Why:** placeholder `packages/worker/static/index.html`.
- **Follow-up:** `bun turbo build --filter=@bat/ui` before pre-push.

## Playwright seed titles must not embed the app version

- **What:** `Deploy v2.1.0` aborted `release.ts` stale-version scan.
- **Why:** fixtures matched the version regex.
- **Follow-up:** fixtures use a fixed `v1.2.3`.
