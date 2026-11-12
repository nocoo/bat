# Bat

VPS monitoring with a Rust probe, Cloudflare Worker API and Vite dashboard.
Profile: native-hybrid, with TypeScript and Rust lanes.
Direction: [docs/02-architecture.md](docs/02-architecture.md) and [development](docs/21-development.md). Frameworks must not rewrite this file.

## Scope and instruction sources

- This file is the only project handbook; nested files do not compete with it. Do not create a `CLAUDE.md` alias or copy.
- This file is the contract; hooks, CI and configuration enforce it. Raise weaker enforcement instead of lowering this contract.
- Human docs: [README.md](README.md) and the [docs index](docs/README.md). Version: root `package.json`, synchronized by `scripts/release.ts`. Enforcement: `.husky/`, CI/release workflows, per-package Vitest configs, `scripts/check-coverage.sh`. Local secrets: ignored `packages/worker/.dev.vars` and `packages/ui/.env.local`; production Worker secrets are managed separately. Machine rules/accidents: global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md).

## Project invariants

- One Worker serves API and SPA. Browser host `bat.hexly.ai` uses Access; ingestion host `bat-ingest.worker.hexly.ai` uses `BAT_WRITE_KEY` / `BAT_READ_KEY`.
- Daily local gateway 7025 (`bat.dev.hexly.ai`) starts Demo by default using the checked-in, de-identified observation catalog in `scripts/environments/fixtures/recorded.json`. Server aliases share one workload template; the focused automated catalog stays synthetic. Only explicit Prod selection uses the production Access proxy. Vite and native local Workers use ephemeral loopback ports; never test against the daily gateway.
- L2/L3/L4 must remain local with dedicated persistence and guarded fixtures. Never use remote D1/KV or deploy remote `-test` resources.
- Apply production D1 migrations before code that needs new columns. Preserve migration data with copy/rename rather than destructive table replacement; the E2E harness discovers numbered migrations automatically.
- `BAT_KV` is an optional cache: absent KV falls back to D1. Connect uses a Durable Object and versioned keys; never collect invocation URLs, headers or bodies in observability.
- Keep MVVM boundaries and thin routes. Route/page scan hits are structural evidence, not assertion quality.
- Use Bun, not pnpm. Release through the existing script and CD; laptop `bun run deploy` / `wrangler deploy` would race CD. Probe fleet upgrades remain manual.
- `packages/cli` builds the public `@nocoo/bat` package with only the `bat` executable. Workstation commands use isolated credentials below `~/.config/bat/workstation/`; assets credentials and the original heartbeat service remain separate. npm installation never registers tasks or collects data.
- Workstations are not server hosts. Dedicated `batw_` credentials can only discover authorized public targets, submit their own observations and revoke themselves. Enrollment uses Access consent plus one-use PKCE codes. Connect workstation grants are explicit, and connectivity reads require both workstation and target-server authorization.
- Workstation schedules run a bounded one-shot probe every ten minutes in the current user's session. Never test by registering actual tasks or changing ACLs in the real home directory. Automated fixtures use temporary stores and fake command executors; native scheduler acceptance remains separately authorized.

## Setup and commands

TypeScript 7, Bun 1.3.11/Turbo, Hono Worker, Vite SPA; Rust probe lane with cargo, clippy, rustfmt and cargo-llvm-cov; D1 `bat-db`, optional production `BAT_KV` and a Connect coordinator Durable Object. `packages/shared/` and `packages/worker/` hold types and Worker/API/SPA assets; `packages/ui/`, `packages/cli/` and `probe/` hold the dashboard, public Node.js CLI and Rust agent. The root build includes the bundled CLI; its runtime needs Node.js 22+ rather than Bun.

Run from the root after a frozen Bun install. Rust coverage needs `cargo-llvm-cov` and LLVM tools; nightly preserves existing `coverage(off)` annotations. Browser tests need Chromium in `packages/ui`.

```bash
bun install --frozen-lockfile
bun run dev # persistent Demo; --mode e2e for switchable manual E2E
bun run dev:built # build first; same local control
bun run demo:reset # stop Demo launcher first
bun run test:environments
bun run capture:environments # disposable rich E2E captures
bun run typecheck
bun run lint
bun run build
bun run test:unit:coverage
bun run test:l1-gate
bun run test:quality-gate
bun turbo test:e2e --filter=@bat/worker
bun run test:e2e:pw
bun scripts/quality/runtime-kv.mjs
bun scripts/quality/probe-integration.mjs
bun scripts/quality/verify-package.mjs
cargo test --manifest-path probe/Cargo.toml
cargo clippy --manifest-path probe/Cargo.toml -- -D warnings
cargo fmt --manifest-path probe/Cargo.toml --check
bun run gate:security
```

Build the UI before L2/L3/L4 so Worker static assets are real. Unset `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CF_API_TOKEN` for isolated tests; the runtime runner rejects production-capable credentials. Never run tests against the daily Vite proxy.

Environment design, fixture matrix, and capture limitations: [local environments](docs/23-local-environments.md). Legacy `.wrangler/state` and `.wrangler/e2e-pw` are never reset by these commands.

## Testing and quality contract

System0 quality 1.3.0, base-ci v2026.15. The repository implements all 11
implementation slots plus Z1; there are no `na` slots. The CI workflow uses the
native mode: `ci.yml` has one `quality` caller job and
`quality-slots.yml` owns the named slot jobs.

| Slot | Command / evidence                                                                                  | Checked object                   | Stage                    | Measured (2026-11-12)      | Coverage / gap                                           |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------ | -------------------------- | -------------------------------------------------------- |
| S1   | `bun turbo typecheck`; `cargo check --locked --all-features --manifest-path probe/Cargo.toml`       | Index snapshot / CI checkout     | pre-commit               | Rust check 0.6s            | TS strict; Rust cargo check                              |
| S2   | `biome check --error-on-warnings .`; focus scan; `cargo fmt --check`; `cargo clippy -- -D warnings` | Index snapshot / CI checkout     | pre-commit               | Rust fmt/clippy 0.7s       | zero diagnostics required                                |
| S3   | actionlint; yamllint; `scripts/check-workflows.py`                                                  | Index snapshot / CI checkout     | pre-commit*, CI          | 0.58s local                | immutable refs and 12-slot structure                     |
| G1   | staged `gitleaks`; push-range `gitleaks`; synthetic-secret self-test                                | Staged index / pushed ranges     | pre-commit, pre-push, CI | staged scan 0.02s          | `[extend] useDefault = true`                             |
| G2   | `osv-scanner` over `bun.lock` and `probe/Cargo.lock`                                                | Snapshot lockfiles / CI checkout | pre-push, CI             | 1.9s local                 | both language locks                                      |
| B1   | dashboard + Worker assets + public CLI + release probe                                              | Snapshot / CI checkout           | pre-push, CI             | pre-push pass; probe 13.7s | real artifacts                                           |
| L1   | Vitest coverage; nightly `cargo llvm-cov`; script/environment suites                                | Snapshot / CI checkout           | pre-commit, pre-push, CI | TS coverage in 11.77s hook | TS four-metric 95% target; Rust line/function/region 95% |
| L2   | `runtime-kv.mjs`; `turbo test:e2e --filter=@bat/worker`                                             | Isolated local runtime           | CI                       | runtime KV 13s             | real Wrangler D1/KV/DO and HTTP                          |
| L3   | `test:environments`; `probe-integration.mjs`                                                        | Isolated local services          | pre-push, CI             | 28s local                  | probe → Worker → query                                   |
| L4   | pre-push `test:e2e:pw:smoke`; CI `test:e2e:pw`; `capture:environments`                              | Built SPA + local Worker         | pre-push, CI             | smoke 64 / 35.3s; CI 194   | Chromium journeys and captures                           |
| P1   | `npm pack`; tarball inspection; throwaway install; installed CLI smoke                              | Built public CLI package         | pre-push, CI             | 34 checks                  | public `@nocoo/bat` tarball                              |
| Z1   | `quality / Z1: Gate` verifies results and one tested SHA                                            | CI job results                   | CI                       | real CI pending            | all impl success; no skipped impl                        |

`*` S3 is conditional in pre-commit and always runs in CI. Worker/UI branch
coverage is 91.16%/94.69%, below the 95% governance target; their existing 90%
thresholds are preserved. Rust branch coverage is not available from
`cargo-llvm-cov`; line/function/region coverage is 98.16%/98.09%/98.80%.

| Hook       | Current behavior                                                                             | Measured / target                                 |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| pre-commit | Index snapshot via `checkout-index`; G1; parallel S1/S2/L1 and structural gates; optional S3 | 14.81s cold; 12.48s hot; target ≤15s, reject >30s |
| pre-push   | stdin local-OID snapshot; B1/G1/G2/L1 parallel; L3 next; L4 smoke and P1 after L3            | 2:20.73; target ≤2.5min                           |

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

Every Worker test lane must reject remote bindings, assert test context, initialize `_test_marker(key,value)` with `env=test` and verify it before resets/cleanup. Keep Wrangler logs redirected as the L3 wrapper does to avoid workerd pipe failures.

## Operations / release

Authorized maintainers use `bun run release` (patch default; `-- minor`, `-- major`, explicit version, or `-- --dry-run`). Release requires authenticated `gh` and successful CI for the exact pushed commit before creating its tag. Verify GitHub Release creation separately. CD owns migration/deployment after source proof; fleet probe installation is manual.

R2 probe release retention: after both architectures and their SHA-256 files are successfully uploaded to the version directory and `latest/`, run `python3 scripts/prune-probe-releases.py --release-version X.Y.Z --apply`. Keep only the three newest numeric `X.Y.Z` version directories under `zhe/apps/bat/`, plus `latest/`; never delete other prefixes or non-version keys. The script defaults to a dry run, requires complete retained releases and matching `latest/`, and verifies the remaining inventory. Serialize probe releases so upload and cleanup cannot overlap. For one-time cleanup, wait for any in-flight probe upload to finish and use the same script. Required credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print them.

Preserve static musl probe packaging and version targets, including release snapshots. Procedures and live checks: [edge deployment](docs/19-edge-deployment.md), [probe](docs/04-probe.md), [Connect](docs/22-connect.md).

## Retrospective

Narratives remain in [Retrospective.md](Retrospective.md); keep only recurring rules here, cross-project lessons in global rules/nmem and deterministic checks in hooks/tests.
