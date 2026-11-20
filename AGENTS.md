# Bat

VPS monitoring monorepo with a Rust probe (`probe/`), Cloudflare Worker API + SPA (`packages/worker/`), Vite dashboard (`packages/ui/`), shared types (`packages/shared/`), and public Node.js CLI `@nocoo/bat` (`packages/cli/`).
Docs: [README](README.md) · [Docs Index](docs/README.md) · [Architecture](docs/02-architecture.md) · [Testing](docs/07-testing.md) · [Development](docs/21-development.md) · [Environments](docs/23-local-environments.md) · [Workstations](docs/24-workstations.md) · [Retrospective](Retrospective.md)

## Commands

Run from root with TypeScript 7, Bun 1.4.4/Turbo, Node.js 22+ (CLI runtime), stable Rust (`cargo`, `clippy`, `rustfmt`), nightly `cargo-llvm-cov` + LLVM tools (preserves `coverage(off)`), and Chromium in `packages/ui`. Bindings: D1 `bat-db`, optional prod `BAT_KV`, and Connect coordinator Durable Object. Local secrets live in gitignored `packages/worker/.dev.vars` and `packages/ui/.env.local`; prod Worker secrets are managed separately.

```sh
bun install --frozen-lockfile
bun run dev                            # gateway 7025 persistent Demo; --mode e2e for manual E2E
bun run dev:built                      # build first; same local control
bun run demo:reset                     # stop Demo launcher first
bun run typecheck                      # S1 TS
bun run lint                           # S2 Biome check-only, 0 warnings
bun run build                          # B1 shared + UI/Worker static assets + @nocoo/bat CLI
bun run test:unit:coverage             # L1 TS + Rust coverage (scripts/check-coverage.sh)
bun run test:l1-gate                   # pre-commit probe suite in temp clone
bun run test:quality-gate              # Z1 / push-range / focus-check unit tests
bun run test:environments              # L3 local environment suite
bun run capture:environments           # L4 disposable rich E2E captures
bun turbo test:e2e --filter=@bat/worker # L2 real Worker HTTP / D1 / DO
bun run test:e2e:pw                    # L4 Playwright full suite (test:e2e:pw:smoke for smoke)
bun scripts/quality/runtime-kv.mjs     # L2 real Wrangler D1 / KV bindings
bun scripts/quality/probe-integration.mjs # L3 probe -> Worker -> query
bun scripts/quality/verify-package.mjs # P1 packed @nocoo/bat consumer
bun run gate:security                  # G1 staged gitleaks + G2 osv-scanner
cargo test --manifest-path probe/Cargo.toml
cargo clippy --locked --all-features --manifest-path probe/Cargo.toml -- -D warnings
cargo fmt --manifest-path probe/Cargo.toml --check
```

Build the UI (`bun run build`) before L2/L3/L4 so Worker static assets are real. Unset `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CF_API_TOKEN` for isolated tests (the runner rejects production-capable credentials).

## Invariants

- Single Worker serves API and SPA: browser host `bat.hexly.ai` uses Cloudflare Access; ingestion host `bat-ingest.worker.hexly.ai` uses `BAT_WRITE_KEY` / `BAT_READ_KEY`.
- Daily gateway 7025 (`bat.dev.hexly.ai`) boots Demo from de-identified `scripts/environments/fixtures/recorded.json` (shared alias template; automated fixtures stay synthetic); only Prod uses Access proxy.
- Vite and native local Workers use ephemeral loopback ports; never test against the daily gateway. Legacy `.wrangler/state` and `.wrangler/e2e-pw` are untouched ([Environments](docs/23-local-environments.md)).
- L2/L3/L4 must remain local with dedicated persistence and guarded fixtures. Never use remote D1/KV or deploy remote `-test` resources.
- Apply production D1 migrations before code that needs new columns; preserve data via copy/rename rather than destructive table replacement. E2E auto-discovers numbered migrations.
- `BAT_KV` is an optional cache (absent KV falls back to D1). Connect uses a Durable Object and versioned keys; never collect invocation URLs, headers, or bodies in observability ([Connect](docs/22-connect.md)).
- Keep MVVM boundaries and thin routes; route/page scan hits (`gate:routes`, `gate:pages`) are structural evidence, not assertion quality.
- Use Bun (never pnpm). Root `package.json` is the version source, synced by `scripts/release.ts` (including release snapshots). Never run laptop `bun run deploy` / `wrangler deploy` (races CD).
- `packages/cli` publishes `@nocoo/bat` (`bat` binary only; Node.js 22+). `npm install` never registers tasks or collects data; workstation creds stay in `~/.config/bat/workstation/`, separate from assets/heartbeat.
- Workstations are not server hosts: enrollment uses Access consent + one-use PKCE; `batw_` keys only discover authorized public targets, submit own reports, and self-revoke ([Workstations](docs/24-workstations.md)).
- Connect workstation grants are explicit and read-only; connectivity reads require authorization on both the workstation and each target server.
- Workstation schedules run a bounded 10-min probe in the user session. Never register real tasks or alter real home ACLs in tests; use temp stores and fake executors (native scheduler acceptance is manual).
- Authorized releases run `bun run release` (patch default; `-- minor`, `-- major`, explicit version, `-- --dry-run`), requiring `gh` auth and green CI on the exact commit; verify GitHub Release separately.
- CD (`.github/workflows/release.yml`) owns D1 migration, Worker deploy, and static musl probe R2 upload/pruning ([Development](docs/21-development.md), [Edge](docs/19-edge-deployment.md), [Probe](docs/04-probe.md)).

## Quality & Local Gates

Follows `system1-quality`; CI slot definitions and pinned `base-ci` revision live in `.github/workflows/quality-slots.yml` (called by `.github/workflows/ci.yml`; `quality / Z1: Gate` required on `main`). All 11 delivery slots and `Z1` are `enforced` (`N/A`: none); slot map, per-package Vitest thresholds, and benchmarks live in [Testing](docs/07-testing.md). Raise weaker enforcement instead of lowering this contract. Status vocabulary: `enforced`, `planned`, `manual`, `N/A`.

- **Exceptions / gaps**: Worker/UI branches keep 90% thresholds (<95% target); Rust `cargo-llvm-cov` omits branches (95% line/function/region on nightly); scheduler acceptance and probe upgrades are `manual`.
- **Local hooks**: installed via `bun run prepare` (`.husky/` -> `scripts/hooks/`); check-only, never use `--no-verify`.
- **pre-commit**: verifies the staged index snapshot (`G1`, `S1`, `S2`, TS `L1`, script/env/Python unit, route/page gates, conditional `S3`).
- **pre-push**: verifies each pushed local OID (`B1`, `G1`/`G2`, Rust `L1`, `L3`, `L4` smoke + capture, `P1`).

## Resources & Isolation

| Lane           | Endpoint / State                                                              | Boundary                                                                                |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Daily dev      | Gateway `127.0.0.1:7025` (`bat.dev.hexly.ai`), `.wrangler/environments/demo`  | Persistent Demo CRUD; explicit Prod access only; never run tests here                   |
| Isolated tests | Ephemeral loopback ports, `.wrangler/environments/e2e-<uuid>`                 | Fresh D1/KV/DO and identity per run; serial mutations; never run L3 and L4 concurrently |
| Prod           | `https://bat.hexly.ai` (Access) · `https://bat-ingest.worker.hexly.ai` (keys) | Read-only checks unless deployment is authorized                                        |

Install restores Husky. Hooks must stay check-only; never use `--no-verify` on
commits or branch pushes. CI pins base-ci at
`777bbe4f9bacab8a91d8c01974480a6ee23d28e0 # v2026.15`.

## Resources and isolation

| Lane      | Resource                                             | Boundary                                                            |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Daily dev | Gateway 7025; `.wrangler/environments/demo`          | Persistent offline-fixture CRUD; explicit Prod access only          |
| L2        | Ephemeral ports; `.wrangler/environments/e2e-<uuid>` | Automated lock, fresh identity, owned D1 cleanup                    |
| L3        | Ephemeral ports; `.wrangler/environments/e2e-<uuid>` | Per-run native state; serial conflicting scenarios, no server reuse |
| L4        | Ephemeral ports; `.wrangler/environments/e2e-<uuid>` | Playwright and capture share the launcher root; never run with L3   |

Every Worker test lane must reject remote bindings and production Cloudflare credentials, assert test context, initialize `_test_marker(key,value)` with `env=test`, and verify ownership before reset/cleanup. Keep Wrangler logs redirected as the L3 wrapper does to avoid `workerd` pipe failures.

## Operations / release

Authorized maintainers use `bun run release` (patch default; `-- minor`, `-- major`, explicit version, or `-- --dry-run`). Release requires authenticated `gh` and successful CI for the exact pushed commit before creating its tag. Verify GitHub Release creation separately. CD owns migration/deployment after source proof; fleet probe installation is manual.

R2 probe release retention: after both architectures and their SHA-256 files are successfully uploaded to the version directory and `latest/`, run `python3 scripts/prune-probe-releases.py --release-version X.Y.Z --apply`. Keep only the three newest numeric `X.Y.Z` version directories under `zhe/apps/bat/`, plus `latest/`; never delete other prefixes or non-version keys. The script defaults to a dry run, requires complete retained releases and matching `latest/`, and verifies the remaining inventory. Serialize probe releases so upload and cleanup cannot overlap. For one-time cleanup, wait for any in-flight probe upload to finish and use the same script. Required credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print them.

Preserve static musl probe packaging and version targets, including release snapshots. Optional container-based probe cross-compilation (`probe/Dockerfile.build`) supports `apple/container` (`container build --platform linux/amd64 -f probe/Dockerfile.build -o type=local,dest=probe/out .`, with `--dns <ip>` behind fake-ip proxies) without Docker Desktop; all `L1`–`L4` test lanes run natively without containers. Procedures and live checks: [edge deployment](docs/19-edge-deployment.md), [probe](docs/04-probe.md), [Connect](docs/22-connect.md).

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and enforceable safeguards to tests/hooks.
