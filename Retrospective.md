# Retrospective

Accident narratives for this repo.

Routing: narrative stays here. A project-specific rule that will recur may become one line in `AGENTS.md`. Cross-project lessons go to nmem or a global rule. If it can be checked by a machine, add a hook or test instead of prose.

## bun is the sole package manager

- **What:** pnpm leftovers broke hooks and Docker installs.
- **Why:** only `bun.lock` exists; hooks call `bun turbo` / `bunx`.
- **Follow-up:** do not introduce pnpm.

## E2E migration list was manual

- **What:** worker E2E 500s on routes that touch new columns; pre-push blocked.
- **Why:** e2e used to apply a hardcoded migration list.
- **Follow-up:** `packages/worker/test/e2e/global-setup.ts` now auto-discovers numbered migrations. Do not revive a hardcoded list.

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

## 2026-09-28 — Dependency verification runner setup

The dependency-upgrade UI run initially placed a temporary TypeScript config under `node_modules` and invoked Playwright from the repository root. Node refused TypeScript stripping in that directory, and the root invocation resolved a separate Playwright runner. Run the workspace-installed executable with `--no-install`; use a JavaScript temporary config when it lives under `node_modules`.

The isolated UI database setup also exceeded the 120-second startup budget while launching Wrangler separately for every migration. For this verification run, concatenate the ordered migrations and seed into one temporary SQL file after creating and verifying the test marker. Keep the random local persistence directory, reject remote credentials, disable server reuse, and verify the marker again before cleanup. The Bun wrapper still stalled during startup; invoking the installed Wrangler executable directly started the same seeded Worker successfully. Run Playwright through its exact workspace executable against that verified task-owned server. Do not relax assertions or use the daily production proxy to bypass setup failures.

## 2026-09-28 — Restoring only the frontend left the API unavailable

When restoring the daily development server, I started Vite on 7025 and verified only the HTML response. The local environment selected `VITE_API_TARGET=http://127.0.0.1:37025`, but the Worker was stopped, so host loading failed with proxy connection refusals and HTTP 502. Starting the local Worker restored all dashboard APIs and the existing 36-host local database.

Before declaring development restored, inspect the effective proxy target without printing credentials, start its required local backend, and verify JSON responses from hosts, identity, tags, and alerts through the browser-facing domain. An HTTP 200 for the SPA alone is insufficient.

## 2026-09-28 — Native environment migration checks

The first isolated gateway forwarded an already decompressed fetch body with the
upstream content-encoding header. Native L2 requests exposed decompression errors;
the gateway now removes content-encoding/content-length after buffering while
preserving the no-transform requirement. The first Playwright adapter changed
only globalSetup's config object, which did not propagate a dynamic baseURL to
workers. Passing the allocated address through the runner environment fixed it.

Real authentication also exposed a missing write-route classification for host
descriptions and tests using write keys for reads. Those were corrected without
restoring localhost bypasses. Browser verification caught a raw host ID used in a
capture route instead of its public hash. Local cleanup verification needed a
non-creating SQLite connection that can handle WAL sidecars after Worker shutdown.
All failures were in owned local resources; the old daily database and production
were untouched. Keep the native HTTP/browser checks as part of environment changes
rather than treating launcher readiness or source inspection as acceptance.

## 2026-09-28 — Local Prod authentication prerequisite

The environment launcher required an unconfigured Access service token without
verifying the existing user authentication path, so selecting Prod failed before
reaching the API. Use application-scoped cloudflared user login, verify the real
`/api/me` response before accepting a switch, and test the explicit read-only live
path separately from isolated automation. Toolbar order also needs a rendered
position check against the shared environment contract.

## 2026-10-03 — Mirror URL inspection must block staging

Bun 1.4.2 wrote temporary mirror tarball URLs into the lockfile during a
dependency update. I printed the matches but continued into staging and a commit
attempt instead of treating them as a failure. I stopped the commit before it
completed and removed only the mirror resolution URLs, preserving versions and
integrity hashes. Before staging dependency changes, assert that mirror URLs are
absent, inspect the reduced diff, and verify a frozen install. Diagnostic output
followed by `|| true` is not an enforcement check.

## 2026-10-03 — Browser acceptance must respect machine-only authentication

The liveness acceptance probe incorrectly expected a browser-session request to
`/api/monitoring/hosts` to return 200. It correctly returned 401 because monitoring
requires a read key, even for an authenticated browser. The probe was corrected
to check browser routes; monitoring authorization and status remain covered by
isolated L2 tests. Do not weaken authentication to satisfy an invalid smoke test.

## 2026-10-21 — Navigation patch sequencing

The first navigation test selected collapsed icon links by a text name that was
not exposed in that state. Selecting the existing route href exposed the actual
regression: cross-page navigation reset the sidebar and disconnected the header.
During the fix, a malformed second patch was rejected after page wrappers had
already been removed, but the shell command continued into a partial-build test.
The owned test was interrupted, the missing shell patch was applied, and the
complete build and regression suite were rerun. No daily or production runtime
was used. Keep dependent patch/build commands fail-fast, and distinguish selector
failures from lifecycle failures before treating a red test as evidence.

## 2026-10-21 - Dependency verification probes

A temporary browser probe checked focus immediately after drawer dismissal,
before the asynchronous focus restoration completed. Replacing the immediate
assertion with Playwright's bounded `toBeFocused` matcher passed against both
Basalt versions without changing application behavior. An import inventory also
used Python directory traversal instead of the required `rg`; the inventory was
rerun with `rg`. Use web-first assertions for asynchronous UI transitions and
keep repository discovery on the prescribed tools, including temporary helpers.

The initial 390px browser check missed a new Sheet padding rule at the 640px
breakpoint. Review arrived after the package commit; a 700px regression test
reproduced the 24px inset and the consumer now explicitly clears it there. Keep
responsive boundary checks and review ahead of issue-closing commit references.
A proposed footer alignment fix was unnecessary: the published collapsed-rail
CSS already centers it, confirmed after waiting for the rail's final width.

## 2026-10-21 - Demo readiness is more than the HTML response

I opened the local acceptance page after checking only its HTTP 200 response.
The lazily initialized Demo backend still had a September 28 lock whose owner
process had exited, so the user encountered an unavailable environment. Recovery
stopped the owned launcher, verified the absent PID, database ownership markers
and lack of open database handles, then removed only the stale lock. Restarting
Demo restored both liveness and Hosts API responses through Caddy; host, tag,
event and metric row counts were unchanged. Verify actual mode initialization
and API readiness before handoff, not just the Vite HTML response. Never reset
persistent Demo data to clear an unverified lock.

## 2026-10-22 - Native-link browser evidence

The new sidebar regression initially waited for the originating page's `popup`
event after a modified click. Chromium opened a separate background tab without
that event, so the check timed out despite preserving the source route. Waiting
for the browser context's new-page event verified both the destination tab and
unchanged source page without changing application navigation. Use the event
that represents the browser action, rather than replacing native links to fit a
test assumption.
