# Bat

Lightweight VPS monitoring: Rust probe, Cloudflare Worker (Hono + D1 + SPA assets), Vite dashboard.
Profile: native-hybrid
Direction: [docs/02-architecture.md](docs/02-architecture.md). Other `docs/NN` and README may be stale (ports, alerts, Next). Frameworks must not rewrite this file.

## Sources of Truth

This file is the **contract**. Hooks, CI, and config are **enforcement**. If they disagree, that is a failure — raise enforcement; never lower this file to a weaker hook.

| Fact | Where |
|---|---|
| Agent handbook | this file |
| Human docs | README.md; current architecture is `docs/02` (not every numbered doc) |
| Version | root `package.json` `"version"` (synced by `scripts/release.ts`) |
| Enforcement | `.husky/*`, `.github/workflows/{ci,release}.yml`, vitest configs, `scripts/check-coverage.sh` |
| Machine rules | global `AGENTS.md`, `rules/git-commit.md` |
| Accidents | [Retrospective.md](Retrospective.md) |
| Env files | `packages/worker/.dev.vars`, `packages/ui/.env.local` gitignored. Secrets via `wrangler secret put` |

## Project Invariants

- Browser: `bat.hexly.ai` (Access). Ingest: `bat-ingest.worker.hexly.ai` (`BAT_WRITE_KEY` / `BAT_READ_KEY`). One Worker serves API + SPA.
- Daily UI: Vite :7025 (or `https://bat.dev.hexly.ai`) proxies `/api` to prod; needs `packages/ui/.env.local` Access service-token vars. Wrangler :37025 is local worker **dev**, not E2E (L2 :17025, L3 :27025). Not 8787.
- E2E is `--local --persist-to` only. Never `--remote` D1. L2 `.wrangler/e2e` :17025; L3 `.wrangler/e2e-pw` :27025.
- Apply production D1 migrations before Worker code that uses new columns. Do not `wrangler deploy` from a laptop.
- `gate:routes` is a static `(method, path)` scan vs e2e files — structural hit, not assertion quality.
- Version with `bun run release`. `bun run deploy` races CD (`.github/workflows/release.yml`).

## Stack / Layout

| Component | Choice |
|---|---|
| Language | TypeScript 7 strict + Rust (probe) |
| Package manager | Bun workspaces + Turbo |
| Runtime | Cloudflare Workers (Hono) + Vite SPA + static Rust probe |
| Lint | Biome `--error-on-warnings`; probe `clippy -D warnings` + `fmt` |
| Tests | Vitest L1; wrangler L2; Playwright L3; `cargo test` |
| Data | D1 `bat-db` (+ prod KV `BAT_KV`) |

```
packages/shared  types    packages/worker  Hono + D1
packages/ui      Vite :7025    packages/cli
probe/           Rust    docs/  numbered Chinese
```

## Commands

```bash
bun run dev
bun run typecheck
bun run lint
bun run build
bun run test:unit:coverage
bun turbo test:e2e --filter=@bat/worker
cd packages/ui && bunx playwright test
bun run release -- --dry-run
```

## Verification

Status: `enforced` | `planned` | `manual` | `N/A`. `enforced` Evidence = hook/CI/config/script. `planned` has no Evidence.

Org gaps: index-snapshot pre-commit; stdin-range pre-push; `.skip`/`.only` (Playwright `forbidOnly` only in CI). Today: pre-commit coverage/typecheck/lint-staged/gitleaks/gates on the working tree. pre-push L2 + `gate:security`. CI bun-quality `@aec4adc1a817c56790d1698329ef9398a15a754a` (v2026.5) + L2 + L3 + probe. L3 is CI-only.

| Change | Proof | Status | Evidence |
|---|---|---|---|
| Logic TS | L1 line ≥90% pre-commit (`check-coverage.sh 90 95`); CI default script is 95% TS | enforced | pre-commit; CI `test:unit:coverage` |
| Logic Rust | pre-commit llvm-cov ≥95%; CI `test:unit:coverage` llvm-cov ≥90%; `probe` job is `cargo test` | enforced | `check-coverage.sh`; CI quality + `probe` |
| API L2 | real HTTP wrangler `--local`; structural 100% `/api` routes | enforced | pre-push → `turbo test:e2e --filter=@bat/worker`; CI `l2-e2e`; `gate:routes` |
| UI L3 | Playwright Chromium | enforced | CI `l3-playwright` (`packages/ui` + `l3-webserver.sh`) |
| Types / lint | tsc + Biome 0 warning; clippy | enforced | pre-commit typecheck + lint-staged; CI lint/typecheck/clippy |
| G2 secrets | gitleaks | enforced | pre-commit `--staged`; pre-push + CI bun-quality |
| G2 deps JS | osv `bun.lock` | enforced | pre-push `gate:security`; CI bun-quality |
| G2 deps Rust | osv `probe/Cargo.lock` | enforced | pre-push `gate:security` only (CI does not scan Cargo.lock) |
| Bundler | `turbo build --filter=@bat/ui` | enforced | CI L2/L3 `bun run build`; `scripts/ci-pre-command.sh` |
| Docs | numbered doc if behavior changes | manual | human review |
| Release | version + changelog + tag; CD deploy | enforced | `scripts/release.ts` (GitHub Release is skipped/non-fatal without `gh`); `release.yml` |

| Hook | Org bar | Status | Evidence |
|---|---|---|---|
| pre-commit | index snapshot for G1+L1 | planned | — |
| pre-push | stdin ref range | planned | — |

`--no-verify` forbidden on commits and branch pushes. Tag-only may skip.

## Resources / Isolation

| Purpose | Port / resource | Isolation |
|---|---|---|
| Dev | 7025 Vite (`bat.dev.hexly.ai`) | `/api` → prod; `.env.local` Access tokens |
| Dev wrangler | 37025 | local worker dev; `.dev.vars` |
| L2 | 17025 | `--local --persist-to .wrangler/e2e` + test marker |
| L3 | 27025 | `--local --persist-to .wrangler/e2e-pw` |

E2E never touches prod D1/KV.

## Operations / Release

- Entry: `bun run release` (patch default; `-- minor` / `-- major` / `-- x.y.z`; `-- --dry-run`). Who: GitHub write on `nocoo/bat` (`gh`) plus the `production` GitHub Environment for CD.
- Do not `bun run deploy` / `wrangler deploy` in the same breath. CD: `.github/workflows/release.yml` (tag `v*.*.*` and CI-green `main`). Probe VPS upgrade stays manual.
- Live-check: `https://bat.hexly.ai` (Access) and ingest health on `bat-ingest.worker.hexly.ai`. Runbook: [docs/19-edge-deployment.md](docs/19-edge-deployment.md).

## Retrospective

| Kind | Where |
|---|---|
| Accident narrative | [Retrospective.md](Retrospective.md) |
| Recurring project rule | one line here (cap ~10) |
| Cross-project | nmem / global rules |
| Checkable rule | hook or test |

- SPA is Vite on the Worker. Do not restore Next/Railway.
- L2/L3 stay `--local --persist-to`. Never `--remote`.
- Migrate prod D1 before the Worker that needs the new schema.
- Do not add pnpm.
