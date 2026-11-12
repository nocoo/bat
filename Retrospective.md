# Retrospective

## 2026-10-29 - Keep lockfile updates limited to versions

An offline Bun install using the machine's mirror rewrote package tarball URLs
while synchronizing workspace versions. The dependency graph was unchanged, so
the unrelated mirror URL churn was removed and the four workspace-version edits
were verified with a frozen offline install. Review lockfile diffs before staging
and do not publish machine-specific registry rewrites with a product version bump.

## 2026-10-29 - Include non-FK state in host deletion

The first deletion implementation covered active alerts but omitted the separate
duration-staging table, which has no host foreign key. Independent review caught
the retained timers and the possibility of a concurrent ingest rewriting them.
Inventory every host-keyed table, not only foreign keys; delete pending timers in
the same transaction, guard delayed inserts with the tombstone, and verify that
re-registration starts duration rules from a new first-seen timestamp.

## 2026-10-29 - Validate workspace setup before focused tests

The first targeted Vitest invocation used the repository root with a package-local
configuration, so its relative include matched no tests. The next invocation
reached the suite but the fresh checkout had not built `@bat/shared`. Build the
shared workspace first and run focused suites from their package directory.
An initial deletion fixture also assumed a webhook `name` column that does not
exist; use the actual migration schema when seeding relationship tests.

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

## 2026-10-22 - Preserve short labels in responsive headers

Adding the detail-page back control reduced the subtitle's available width.
The status badge then shrank and split `Critical` across two lines on mobile,
although the page still passed its overall overflow check. Screenshot inspection
caught the regression. The shared status badge now preserves its intrinsic width
and single-line label; a browser regression measures the rendered text lines.
Check inline labels as well as outer geometry when adding navigation gutters.

## 2026-10-22 - Migrate control contracts, not only element names

The first Select migration tests still matched the library's hidden native
options, sent keyboard commands before Radix restored focus, and selected a
webhook cleanup row by list order. The checks failed before cleanup. Tests now
use accessible roles, await focused options, and clean up the exact host row.
The Connect example toggle also changed from a button to a radio; its regression
must follow the new semantic contract without dropping the permission checks.

A CSS rewrite searched for the first `/*` and matched Tailwind's `/**/*` source
glob, corrupting the stylesheet header. Formatting caught it before commit.
Keep import/source directives intact, use anchored sections for scripted edits,
and scan direct CSS-variable references as well as utility classes when removing
a token system. Typecheck, full browser tests and theme captures follow the rewrite.

## 2026-10-22 - Wait for populated details before visual acceptance

The initial detail capture waited for its heading, which precedes metrics and
process data. Its mobile screenshot therefore showed skeletons and missed the
wide process table's grid min-content overflow. Independent review caught the
weak capture. The chart grid column now has `min-w-0`, keeping scrolling inside
the standard Table. A populated two-process browser fixture checks mobile width,
sorting and filtering; visual checks wait for rows, chart and editor content
before testing overflow and capture the scrolled editors and active tooltip.

## 2026-10-29 - Bind chart grids to explicit axes

The Disk I/O dual-axis conversion assigned named axes to every series and
chart overlays but left CartesianGrid on its default axis. Recharts used
an implicit axis, dropping the interior IOPS grid lines. The initial browser
check only compared the outer grid bounds, so it missed the defect. Review
caught it before push. Bind the grid to the IOPS axis and verify that every
interior left-axis tick has an aligned horizontal grid line. The new assertion
failed against the original build before the binding fix.

## 2026-11-06 - Keep workstation contracts and installs bounded

The first shared-contract draft silently changed endpoint paths, omitted the
agreed report history, and accepted non-loopback HTTPS callbacks. Coordination
caught these differences before Worker integration. Freeze the endpoint and
permission matrix before parallel coding, and test loopback boundaries for every
accepted scheme. A genuine measured zero-millisecond RTT is valid; only missing
measurements must be null.

A temporary mirror install also populated hundreds of mirror tarball URLs in
`bun.lock`. The generated install-only changes were restored, retaining only the
reviewed CLI workspace rename. Verify the lockfile contains no mirror URLs before
staging, rather than trusting the temporary registry setting to leave it clean.

The Rust bootstrap executable initially failed because it had been renamed to
`bat-rustup-init`; rustup dispatches by executable basename. Keep the official
`rustup-init` name inside a task-specific directory, verify its published checksum,
and install without modifying the user's shell startup files.

## 2026-11-07 - Verify lifecycle invariants across client and Worker

High unit coverage did not prove the initial workstation lifecycle was safe.
Review found that same-second code replay could rotate a valid credential,
duplicate or late reports could refresh the latest state, and opaque error text
could bypass Connect's server filtering. Bind mutations to a successful consume
nonce, order snapshots by sample time, and test the complete filtered response.
Exercise revocation, retries and schedule rollback through failure paths rather
than asserting only successful status codes.

The first cross-package L2 assertion also assumed its operator could discover
only its own fixture host. A full suite correctly returned all authorized hosts.
Assert the exact discovered target set and the persisted report, without deleting
other fixtures or weakening authorization checks. Package smoke tests should use
the documented informational status exit code instead of assuming missing login
is always a command error.

Mixed Bun resolver installs left mismatched Vitest peer links. Reinstall only
this task's generated node_modules from the frozen lock with pinned Bun before
final evidence; never treat an alternate runner path as the permanent fix.
Freeze agent edits and alternate-runner invocations before coordinator hooks:
the first commit correctly failed when concurrent runners repopulated incompatible
transform caches. Clear only the task-owned cache and rerun the canonical command.

## 2026-11-07 - Freeze dependency graphs during version-only releases

The release preflight exposed a mirror install that would rewrite dependency URLs
and a stale-version scan that rejected historical test samples. Sync only the Bun
workspace version metadata and validate with a frozen install; keep real runtime
constants in the scan while excluding test fixtures. Review also caught a nested
dependency named `version` being mistaken for workspace metadata. Match direct
members only and assert byte-for-byte preservation of nested dependencies.

The first 3.0.0 candidate was blocked before deployment because generated
CHANGELOG headings lacked the blank lines required by the current Markdown
formatter. The staged-code hook had not checked that Markdown file. Validate
generated release documents, and include CHANGELOG in the check-only staged gate.
The script also pushed the tag before its exact commit's CI completed, causing
release-source rejection. Wait for successful source proof before tagging; leave
published tags immutable and use a patch release to recover a failed candidate.

## 2026-11-07 - Normalize recorded fixture identifiers before persistence

A development-recording review caught IPv6 documentation-prefix and zone-id
checks that could preserve private labels, and missing receipt ages that would
break historical joins. Validate canonical addresses, strip zones before mapping,
retain receipt timestamps as relative ages, and build target metadata from both
latest reports and history. Audit the serialized result against source identifiers
before staging; never expose raw captures or reversible mapping tables to model
contexts, CI or the checked-in fixture catalog.

The first Demo loader copied connectivity-history objects into report payloads,
losing the protocol's `sent` count and hiding loss percentages. Docker start ages
also survived inside nested JSON. Test the returned API DTOs, not just row counts:
compare payload and relational observations, traverse nested timestamps, and keep
captured packet tuples distinct from aggregate-equivalent history reconstruction.
Block forbidden production requests before dispatch in offline captures, and fix
only the capture page clock when comparing two time-windowed charts.

## 2026-11-08 - Restarting the daily Demo needs the stale lock and the build order

Killing the Demo launcher left `packages/worker/.wrangler/environments/demo/running.lock`
behind with a dead PID, so the next start failed with `EEXIST` and the gateway
answered 503 long after the process was gone. Verify the lock PID is dead before
removing that one file, never the store directory. A `bun run build` started while
the Demo was running also rewrote `packages/worker/static` under a live worker and
killed it. Build first, then start the Demo, and restart the launcher after any
worker-side change because the launcher does not hot-reload the Worker.

## 2026-11-08 - Split public addresses by family, and review the migration against real data

The first cut of the per-family public address work made the UI read only the new
family columns while the migration only added them, so every host already in the
fleet would have shown no address until a manual probe upgrade. A second cut moved
the classification into SQL shape filters and still promoted junk such as
`999.1.1.1`. Migrations stay additive; validate legacy values with the shared
address parsers on the read path instead of re-implementing address grammar in
SQL, and test the migration and the read path against pre-existing rows, not only
against rows written by the new probe.

## 2026-11-10 - Three separate reasons the daily Demo answered 503

The owner hit the same failure three times in one day; it was not one bug.

1. `bun run build` rewrote `packages/worker/static` under the running worker, which
   exited and left the launcher proxying to a dead runtime. The instance now copies
   the built assets into its own directory, so a rebuild cannot touch a live instance.
2. Restarting the launcher emptied the in-memory instance map, so the open tab's
   `POST /__bat/environment` with its old `previous` id answered 410 forever. An
   unknown `previous` now means "no previous instance" and creates one; only an id
   that exists but is inactive answers 410. The UI clears the stored id and retries
   once, so a reload recovers without clearing storage.
3. A dead worker made the proxy answer 503 while the instance stayed `active`, so
   every later request failed the same way. A proxy failure now marks the instance
   inactive and answers 410, which the same retry path turns into a fresh instance.

Two follow-ups from the same investigation: the store-holder check treated the
launcher's own pid, and then its own worker children, as foreign holders, so a
healthy launch refused to reuse its own store; it now excludes the caller's whole
process tree. And `bun run build`/`kill` leave orphan `workerd` children whose
`+`-containing paths defeat a plain `pkill -f` pattern — kill them by an unescaped
substring or by pid, and prefer restarting the whole launcher over restarting only
the worker, since only the launcher owns the instance map.

The launcher's SIGTERM handler still does not reliably tear down the worker group
under Bun; the local restart script kills the worker tree explicitly before
relaunching. Treat "no orphan workerd after stop" as unproven until that handler is
verified.

## 2026-11-12 - System0 migration: verify the target, not the wrapper

The migration exposed several failures that looked like successful gates:

- v2026.15 is an annotated tag; its tag object SHA is not a valid `uses:` target.
  Resolve `^{commit}` and pin `777bbe4f9bacab8a91d8c01974480a6ee23d28e0`.
- G1 over the working tree scanned `node_modules` and produced hundreds of false
  positives. Snapshot tracked content for CI and scan the staged index locally.
- A background stage that was not waited on let cleanup delete its snapshot before
  `cargo check` ran, which appeared as "Current directory is invalid". Wait for the
  exact PID and preserve its exit status.
- L3 and L4 both own `packages/worker/.wrangler/environments`; running them
  concurrently deletes each other's stores. Run L3 first, then L4 and P1.
- `bun --cwd` is not a supported flag in this toolchain; use a subshell.
- The local machine had Bun 1.4.4 while `package.json` declared 1.3.11. Comparing
  only the marker's runtime let the mismatch pass. Install-state now checks the
  declared version as well as the lockfile digest.
- The conditional S3 background job was checked by looking for its `.exit` file,
  not by waiting for its PID. A slow workflow check could still be running when
  the hook reported success and cleanup killed it. Wait on the recorded PID.
- `workflow-lint.sh` used `git rev-parse` to find its root. When a snapshot lived
  inside another repository, it checked the parent worktree instead of the
  snapshot. Derive the root from the script path.
- OID snapshots need package-local `.bin` links, and captures without `.git`
  need `BAT_CAPTURE_REVISION`; otherwise Vite cannot start and capture cannot
  identify the pushed revision.
- Running the full 194-test browser suite in pre-push exceeds the 2.5-minute
  budget. Keep a 64-test smoke set locally and run the full suite in CI.
- Cleanup traps under `set -u` must use `${var:-}` for variables that may not be
  assigned yet.
- A tag was scanned as `-1 <oid>`, which only covers the tagged commit. A secret
  added in an earlier commit and removed before the tag escaped G1. New refs now
  scan `<oid> --not --remotes=<target-remote>`; use the remote Git actually
  pushes to, not a hard-coded `origin`.
- S3 filtered staged paths with `--diff-filter=ACMR`, so deleting a workflow or
  renaming it out of `.github/workflows` skipped workflow lint. Match both old
  and new paths from `--name-status -M` across add, copy, modify, rename,
  delete and type-change statuses.
- Pre-push required Bun, Cargo, scanners and npm before reading stdin. A
  deleted-ref push then failed on a machine without those tools instead of
  skipping the ref. Parse and filter stdin first; require the toolchain only
  when at least one non-deleted OID remains.
- `test:l1-gate` wrote probes into the real index and restored it to `HEAD`,
  which could discard a developer's staged work. Every probe now runs in a
  temporary local clone with symlinked dependencies and caches.
- The background stage fix did not cover the foreground G1, self-test and
  shared-build timeouts. A tool that ignores `TERM` could still hang the hook;
  every `timeout` now has `--kill-after=5`.
- A temporary clone that writes its own install-state marker without checking
  the source installation can bless stale dependencies. Run the source
  `install-state --check` against the clone manifests before writing.
- The push-range regression existed only in the local hook. CI L1 and
  `test:quality-gate` now run the same file so the two lists cannot drift.
