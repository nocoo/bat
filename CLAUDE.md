# Bat

VPS monitoring with a Rust probe, Cloudflare Worker API and Vite dashboard.
Profile: native-hybrid, with TypeScript and Rust lanes.
Direction: [docs/02-architecture.md](docs/02-architecture.md) and [development](docs/21-development.md). Frameworks must not rewrite this file.

## Sources of Truth

This file is the contract; hooks, CI and configuration enforce it. Raise weaker enforcement instead of lowering this contract.

| Fact | Where |
|---|---|
| Human docs | [README.md](README.md), [docs index](docs/README.md) |
| Version | Root `package.json`, synchronized by `scripts/release.ts` |
| Enforcement | `.husky/`, CI/release workflows, per-package Vitest configs, `scripts/check-coverage.sh` |
| Local secrets | Ignored `packages/worker/.dev.vars` and `packages/ui/.env.local`; production Worker secrets are managed separately |
| Machine rules / accidents | Global `AGENTS.md` and `rules/`; [Retrospective.md](Retrospective.md) |

## Project Invariants

- One Worker serves API and SPA. Browser host `bat.hexly.ai` uses Access; ingestion host `bat-ingest.worker.hexly.ai` uses `BAT_WRITE_KEY` / `BAT_READ_KEY`.
- Daily Vite 7025 (`bat.dev.hexly.ai`) proxies API traffic to production with explicit Access service-token configuration. Worker 37025 is local development, never an E2E endpoint.
- L2/L3 must remain local with dedicated persistence and guarded fixtures. Never use remote D1/KV or deploy remote `-test` resources.
- Apply production D1 migrations before code that needs new columns. Preserve migration data with copy/rename rather than destructive table replacement; the E2E harness discovers numbered migrations automatically.
- `BAT_KV` is an optional cache: absent KV falls back to D1. Connect uses a Durable Object and versioned keys; never collect invocation URLs, headers or bodies in observability.
- Keep MVVM boundaries and thin routes. Route/page scan hits are structural evidence, not assertion quality.
- Use Bun, not pnpm. Release through the existing script and CD; laptop `bun run deploy` / `wrangler deploy` would race CD. Probe fleet upgrades remain manual.

## Stack / Layout

| Component | Choice |
|---|---|
| Runtime / install | TypeScript 7, Bun 1.3.11/Turbo, Hono Worker, Vite SPA |
| Native lane | Rust probe, cargo, clippy, rustfmt, cargo-llvm-cov |
| State | D1 `bat-db`, optional production `BAT_KV`, Connect coordinator Durable Object |
| `packages/shared/`, `packages/worker/` | Types and Worker/API/SPA assets |
| `packages/ui/`, `packages/cli/`, `probe/` | Dashboard, CLI and Rust agent |

## Commands

Run from the root after a frozen Bun install. Rust coverage needs `cargo-llvm-cov` and LLVM tools; nightly preserves existing `coverage(off)` annotations. Browser tests need Chromium in `packages/ui`.

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run build
bun run test:unit:coverage
bun turbo test:e2e --filter=@bat/worker
bun run test:e2e:pw
cargo test --manifest-path probe/Cargo.toml
cargo clippy --manifest-path probe/Cargo.toml -- -D warnings
cargo fmt --manifest-path probe/Cargo.toml --check
bun run gate:security
```

Build the UI before L2/L3 so Worker static assets are real. Unset `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CF_API_TOKEN` for isolated tests; the L2 runner rejects production-capable credentials. Never run tests against the daily Vite proxy.

## Verification

6DQ = L1/L2/L3 + G1/G2 + D1. Status: `enforced`, `planned`, `manual`, `N/A`.

| Dimension | Required proof | Status | Current enforcement / gap |
|---|---|---|---|
| L1 TypeScript | Statements, branches, functions and lines each ≥95%; no `.skip` / `.only` | planned | Shared config is four-metric 95%; Worker/UI branches are 90%. Script checks lines, commit passes TS=90, CI defaults TS=95; skip/focus gate incomplete |
| L1 Rust | Preserve ≥95% lines and raise measurable remaining coverage to ≥95% | planned | Commit requires llvm-cov 95% lines; script/CI default is 90%. Branch/function/statement enforcement is absent |
| L2 API | Real local HTTP over 100% of endpoint/method combinations | planned | Pre-push/CI run real Wrangler tests and route mapping; static coverage hits do not verify every assertion/method |
| L3 UI/probe | Critical dashboard and probe-to-server workflows | planned | CI Chromium covers dashboard; complete native probe system acceptance is not enforced |
| G1 TypeScript | Strict types and check-only lint, zero errors/warnings | enforced | Commit typecheck/lint-staged and CI typecheck/lint |
| G1 Rust | Clippy warnings denied and rustfmt check | enforced | Commit when probe changes; CI probe job always tests/lints/formats |
| G2 security | Secret and dependency scans in both lanes; missing tools fail | enforced | Pre-push scans Bun/Cargo locks and secrets; CI default quality scan covers Bun only. Local secret range uses upstream or a recent-commit fallback |
| D1 isolation | Per-run local stores, guards and verified marker before mutations/cleanup | planned | L2 allocates random state/ports and checks `_test_marker`; L3 still reuses `.wrangler/e2e-pw` and may reuse an existing server |
| Build | Real dashboard bundle and native artifact | enforced | CI prepares UI, probe compiles during tests; release packages its intended artifacts |
| Docs / operations | Architecture and migration/release behavior reviewed | manual | Numbered docs and maintainer checks |

| Hook | Current behavior | Required follow-up |
|---|---|---|
| pre-commit | Working-tree coverage/types/staged lint/secrets/route/page gates; conditional Rust lint | G1+L1 on index snapshot, <30s |
| pre-push | Local Worker L2 and G2 in parallel | Test commits named by stdin push refs, <3min |

Install restores Husky. Hooks must stay check-only; never use `--no-verify` on commits or branch pushes. CI pins shared workflows at `ad43150de3a2be2fa464b5cd2f921dc4fa9f8f0f`.

## Resources / Isolation

| Lane | Resource | Boundary |
|---|---|---|
| Daily dev | UI 7025, Worker 37025 | UI proxy can reach production; separate test traffic |
| L2 | Ephemeral loopback/inspector ports; `.wrangler/e2e/<random>` | Local SQLite/fixtures; rejects remote credentials and verifies marker |
| L3 | 27025, `.wrangler/e2e-pw` | Local only; per-run storage and no-reuse guard still planned |

Every Worker test lane must reject remote bindings, assert test context, initialize `_test_marker(key,value)` with `env=test` and verify it before resets/cleanup. Keep Wrangler logs redirected as the L3 wrapper does to avoid workerd pipe failures.

## Operations / Release

Authorized maintainers use `bun run release` (patch default; `-- minor`, `-- major`, explicit version, or `-- --dry-run`). GitHub Release creation is nonfatal without `gh`; verify it separately. CD owns migration/deployment after source proof; fleet probe installation is manual.

R2 probe release retention: after both architectures and their SHA-256 files are successfully uploaded to the version directory and `latest/`, run `python3 scripts/prune-probe-releases.py --release-version X.Y.Z --apply`. Keep only the three newest numeric `X.Y.Z` version directories under `zhe/apps/bat/`, plus `latest/`; never delete other prefixes or non-version keys. The script defaults to a dry run, requires complete retained releases and matching `latest/`, and verifies the remaining inventory. Serialize probe releases so upload and cleanup cannot overlap. For one-time cleanup, wait for any in-flight probe upload to finish and use the same script. Required credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print them.

Preserve static musl probe packaging and version targets, including release snapshots. Procedures and live checks: [edge deployment](docs/19-edge-deployment.md), [probe](docs/04-probe.md), [Connect](docs/22-connect.md).

## Retrospective

Narratives remain in [Retrospective.md](Retrospective.md); keep only recurring rules here, cross-project lessons in global rules/nmem and deterministic checks in hooks/tests.
