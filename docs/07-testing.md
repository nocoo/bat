# 07 — Testing and System0 Quality

> Bat uses the System0 12-slot quality model. The old 6DQ names are gone:
> L1.5 is L2 Runtime, old L2 API is L3 Integration, and old L3 Browser is L4 E2E.
>
> The contract is in [AGENTS.md](../AGENTS.md); slot definitions are in the
> System0 quality skill. This document records the repository's actual commands,
> evidence boundaries and current gaps.

## Slot map

| Slot | Name         | Command / evidence                                                                                  | Checked object                   | Stage                    | Status |
| ---- | ------------ | --------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------ | ------ |
| S1   | Types        | `bun turbo typecheck`; `cargo check --locked --all-features --manifest-path probe/Cargo.toml`       | Index snapshot / CI checkout     | pre-commit               | impl   |
| S2   | Lint         | `biome check --error-on-warnings .`; focus scan; `cargo fmt --check`; `cargo clippy -- -D warnings` | Index snapshot / CI checkout     | pre-commit               | impl   |
| S3   | Workflow     | actionlint, yamllint and `scripts/check-workflows.py`                                               | Index snapshot / CI checkout     | pre-commit*, CI          | impl   |
| G1   | Secrets      | `gitleaks git --staged`; push-range scan; scanner self-test with a synthetic secret                 | Staged index / pushed ranges     | pre-commit, pre-push, CI | impl   |
| G2   | Dependencies | `osv-scanner` over `bun.lock` and `probe/Cargo.lock`                                                | Snapshot lockfiles / CI checkout | pre-push, CI             | impl   |
| B1   | Build        | dashboard + Worker assets + public CLI + release probe                                              | Snapshot / CI checkout           | pre-push, CI             | impl   |
| L1   | Unit         | Vitest coverage; nightly `cargo llvm-cov`; script and environment unit suites                       | Snapshot / CI checkout           | pre-commit, pre-push, CI | impl   |
| L2   | Runtime      | real Wrangler D1/KV checks and the Worker HTTP/D1/DO suite                                          | Isolated local runtime           | CI                       | impl   |
| L3   | Integration  | local environment suite plus `probe → Worker ingest → query`                                        | Isolated local services          | pre-push, CI             | impl   |
| L4   | E2E          | Chromium Playwright journeys plus disposable environment captures                                   | Built SPA + local Worker         | pre-push, CI             | impl   |
| P1   | Package      | `npm pack`, tarball inspection, throwaway install, installed `bat --version/--help`                 | Built public CLI package         | pre-push, CI             | impl   |
| Z1   | Gate         | CI `quality / Z1: Gate` verifies all implemented slots, their results and one tested SHA            | CI job results                   | CI                       | impl   |

`*` S3 runs in pre-commit only when the staged index touches workflows or the
workflow checker. CI always runs it.

## Coverage

`scripts/check-coverage.sh --ts` runs each package's Vitest configuration and
then enforces line coverage ≥ 95%. The Vitest configs enforce the package
thresholds; the current measured values are:

| Package       | Lines | Branches | Functions | Statements |
| ------------- | ----: | -------: | --------: | ---------: |
| `@bat/shared` | 98.87 |    97.95 |     98.71 |      98.66 |
| `@bat/worker` | 95.80 |    91.16 |     95.53 |      95.45 |
| `@bat/ui`     | 99.00 |    94.69 |     98.47 |      98.86 |
| `@nocoo/bat`  | 98.96 |    95.25 |     97.96 |      98.89 |

Worker and UI keep their existing branch thresholds at 90%; their measured
branches are still below the System0 95% governance target. This is a recorded
gap, not a passing claim.

Rust coverage runs `cargo +nightly llvm-cov` with 95% fail-under thresholds for
lines, functions and regions. Current measured values are 98.16% lines, 98.09%
functions and 98.80% regions. `cargo-llvm-cov` does not provide branch coverage,
so no branch number is claimed for Rust.

## Local hooks

### pre-commit

The hook materialises the Git index with `git checkout-index`, checks the
installed Bun version and dependency digest against the declared toolchain and
lockfiles, then runs the selected checks in parallel. It never reads unstaged
fixes as evidence.

Current stages: G1 staged secret scan and scanner self-test; shared build;
TypeScript types; Biome lint and test-focus scan; TypeScript coverage; script,
environment and Python unit suites; route/page structural gates; Rust `fmt`,
`cargo check` and `clippy`; and S3 when relevant workflow files are staged.

The measured hot run on 2026-11-12 was 11.77 seconds wall time. Every stage has
a timeout and a missing tool or missing exit report fails the hook.

### pre-push

The hook reads Git's push protocol from stdin and creates a snapshot for each
local OID. Deleted refs are skipped. The G1 range is derived from that ref and
its remote OID; a new branch scans the local OID against `origin`.

Current order:

1. B1, G1/G2 and Rust L1 coverage run in parallel.
2. L3 runs the environment suite and probe-to-Worker integration.
3. L4 runs Playwright and environment capture; P1 runs the packed-CLI consumer
   check. These share no mutable environment store after L3 has finished.

L3 and L4 both use `packages/worker/.wrangler/environments`; they are serialized
because the environment launcher owns and cleans stores below that root.

## CI

`.github/workflows/ci.yml` has one caller job named `quality`, which invokes the
native `.github/workflows/quality-slots.yml` workflow. The called workflow has
the 11 implementation jobs above plus `Z1: Gate`. Every implementation job
exports `tested-sha`; Z1 runs with `if: always()` and rejects a failed, skipped
or missing implementation slot, a SHA mismatch, or an undeclared blocking job.

There are no separate slot-outside CI jobs in the current workflow. Build,
coverage, runtime, integration, browser and package checks are all owned by the
named slots. Evidence from L4 is uploaded with `if: always()`.

## Isolation

L2, L3 and L4 use the shared native launcher, fresh local D1/KV/Durable Object
resources, generated identities and ephemeral loopback ports. The launcher
rejects inherited production-capable Cloudflare credentials and verifies the
per-run ownership marker before cleanup. Tests never use the daily gateway,
remote D1/KV, a deployed Worker or production data.

The focused automated fixture catalog remains synthetic. The checked-in
recorded Demo catalog is exercised by the isolated rich Demo acceptance and
capture paths, not by focused Playwright fixtures.

## Commands

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test:unit:coverage
bun run test:l1-gate
bun run test:quality-gate
bun turbo test:e2e --filter=@bat/worker
bun run test:environments
bun scripts/quality/runtime-kv.mjs
bun scripts/quality/probe-integration.mjs
bun run test:e2e:pw
bun run capture:environments
bun scripts/quality/verify-package.mjs
cargo test --manifest-path probe/Cargo.toml
cargo clippy --manifest-path probe/Cargo.toml -- -D warnings
cargo fmt --manifest-path probe/Cargo.toml --check
bun run gate:security
```

`gate:security` scans staged content for G1 and all dependency lockfiles for G2.
It does not use a recent-commit fallback; push and CI paths pass an explicit
range or checkout snapshot.

## Remaining gaps

- Worker and UI branch coverage remain below 95%; their existing 90% branch
  thresholds are preserved rather than lowered further.
- Rust branch coverage is unavailable in the current `cargo-llvm-cov` version.
- Native scheduler acceptance and fleet probe installation remain manual and
  outside the automated slots.
