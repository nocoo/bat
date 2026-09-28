# Local environments

Shared plan: [system0-envs](../../workflow/tasks/system0-envs/SKILL.md).
Implementation: `scripts/environments/`, UI `src/environment.ts`, and the normal
Worker authentication middleware. All modes use the same UI, routes, validation,
authorization, repositories and numbered production migrations.

## Commands

Run from the repository root with Bun, Node and installed Chromium:

```sh
bun run build
bun run dev
bun run dev --mode e2e
bun run dev:built --mode demo
bun run demo:reset
bun turbo test:e2e --filter=@bat/worker
bun run test:e2e:pw
bun run test:environments
bun run capture:environments
```

Stop the Demo launcher before reset. Reset deletes only the owned
`packages/worker/.wrangler/environments/demo` store; the next start seeds the
current catalog. Normal Demo CRUD survives restarts. The previous daily
`.wrangler/state`, old `.wrangler/e2e-pw`, and personal `.dev.vars` remain untouched.
Never delete the whole `.wrangler` directory.

Gateway 7025 also works through the existing `https://bat.dev.hexly.ai` Caddy
mapping. Vite, native Worker, inspector and external fixture provider use ephemeral
loopback ports. A running storage lock prevents another launcher or reset from
using the same Demo database. A failed E2E startup retains logs under `.wrangler/environment-failures` and
removes verified temporary state. If ownership cannot be verified, it retains the
store and fails explicitly. Failed Demo initialization retains its store; inspect
its owner marker and `running.lock` PID before manual recovery. Do not
remove another live process's lock or any unverified directory.

Tests reject inherited Cloudflare API credentials, Access service credentials and
BAT static keys. They generate their own keys, local JWKS, database, KV and Durable
Object namespace per invocation. An ownership manifest and D1 `_test_marker`
must agree before cleanup. Playwright uses one worker for conflicting mutations.
No test reuses the daily server, deployed backend or a fixed test port.

## Selection, authentication and parity

Only the launcher injects the local capability. Hosted assets have no switching
endpoint or control. Selection is automated lock, explicit initial mode, valid
`bat:environment-mode` localStorage preference, then Demo. Session storage binds
a tab to its current immutable instance across route reloads. A remembered E2E
preference starts a fresh manual instance in a new session. Automation neither
reads nor writes interactive preferences; CI hides the control.

Manual E2E stays switchable. Accepted changes reload the home route; cancelled
draft discard preserves the current instance and preference. A departing instance
expires before cleanup, pending requests retain their original target, and stale
URLs return 410. Another tab's preference change never retargets existing requests.
Concurrent switches from one instance are rejected.

Local identities use per-store RS256 keys and the normal jose JWT verifier,
including issuer, audience, signature and expiry checks. The fixture manager is
`operator@example.test`; arbitrary identities do not gain Connect manager rights.
Static read/write keys and scoped CLI/Connect tokens retain normal authorization.
The profile HTTP provider returns synthetic Morgan Chen identity and an original
SVG avatar through the existing profile fetch/parser path. No production dump is used.

Local config derives from production `wrangler.toml`: compatibility date/flags,
rate limits, DO classes/migrations and built SPA assets are shared. Intentional
differences are local D1/KV IDs, local Access JWKS/issuer/audience, generated keys,
deployment identifier, loopback profile boundary, disabled telemetry and disabled
scheduled crons (a demonstration must not silently purge its persistent history).
Probe upload and collection code is unchanged.

Prod is an explicit local interactive selection using `https://bat.hexly.ai`.
Install `cloudflared` and authenticate with
`cloudflared access login --quiet https://bat.hexly.ai`. Selecting Prod reuses the
application-scoped user token; if missing or expired, it opens the normal Access
browser login (90-second timeout). No service token is required. The launcher
verifies `/api/me` reports an authenticated user before accepting the switch.
The token remains server-side and is fixed to that instance; browser cookies and
auth headers cannot replace it. Failure preserves the current environment.
An expired live session requires a fresh login and leaving/reentering Prod.

Explicit read-only live verification on 2026-09-28 passed for `/api/me`,
`/api/hosts`, and `/api/live` (backend version 2.3.2). The local frontend is based
on `847af18` plus the authentication/toolbar fix. The deployed commit hash and
MFA challenge were not exposed/independently verified; no production writes were made.
Offline authentication regression: `bun test scripts/environments/production.test.mjs`.

## Fixture matrix and evidence

Catalog version 2 uses a recorded UTC epoch anchor, stable host/tag IDs, reserved
documentation IPs and example.test domains. Focused fixtures preserve two hosts;
rich Demo adds full snapshots, 120 historical samples per active host, offline and
inactive inventory, related assets/agents, maintenance and a scoped Connect key.
History is a snapshot and naturally ages; explicit reset regenerates its anchor.
Application authentication uses real current time.

| Feature / route | Prepared fixture or scenario | Executed evidence | Visual review |
| --- | --- | --- | --- |
| Hosts, sorting/filtering | Critical alpha, healthy beta, offline archive; inactive standby; three colored tags | L3 hosts, filter, navigation; rich catalog assertions | Desktop list |
| Host detail and charts | CPU/memory/network history, inventory, descriptions, disk capacity | L3 detail; real description update L2 | Desktop detail and charts |
| Tier 3 charts/processes | PSI pressure, disk I/O, TCP connections, PostgreSQL process snapshot | Native fixture/API assertion and capture | Process table and disk/TCP charts |
| Tier 2 detail | Ports, SSH/firewall/fail2ban, failed backup service, running/exited containers, disk files, Nginx/PostgreSQL, TLS/plain websites | Rich native seeding; L2 tier2 read/write | Lower detail sections not individually reviewed |
| Alerts | Warning memory and critical disk records | L2 alerts, L3 alert table and navigation | Summary on detail |
| Tags | production/staging/us-east; matching and nonmatching hosts | L3 create/rename/delete/filter; draft cancellation | List chips |
| Webhooks and events | Synthetic deploy/config events and local webhook token | L2 validation/rate limits/CRUD; L3 generate and display | Not separately reviewed |
| Retention settings | Default 7 days; supported 1/30 day changes | L2/L3 real API persistence and invalid-value rejection | Not separately reviewed |
| Connect | Demo read-only inventory grant; focused create/reveal/rotate/revoke/scopes and conflicts | L2 native DO/DB; L3 desktop/mobile and delayed response boundary | Existing L3 assertions; no new reviewed capture |
| Agent/asset/binding/map | Catalog builder, edge gateway and relationship | Rich real API seed; L2 CRUD, heartbeat, relationships | API-only; no dashboard route |
| CLI authorization | Scoped CLI token issue/list/revoke scenarios | L2 normal JWT/key boundaries; CLI unit suite | CLI has no visual surface |
| Setup and account | Actual local URLs, synthetic avatar and email | L3 setup; L2 me/profile parser | Avatar/name on list |
| Errors and permissions | Invalid signatures/claims/keys, read key denied write, missing routes, bad inputs | Real verifier unit test, L2/L3, native environment checks | Error states asserted; no separate capture |
| Environment control | Explicit/manual E2E, fresh reentry, expired URLs, cancelled draft | Local Chromium interaction script; hosted/preference unit checks; automated server lock and CI capability assertions | Top-right segmented control |
| Uploads/documents/export | Not offered by this dashboard | N/A | N/A |

Rich catalog assertion verifies native seeding, not every possible UI state.
Focused L2/L3 scenarios supply additional action/permission coverage.
The external boundary fixture does not prove Cloudflare Access login or live
internet behavior. Native Linux probe system acceptance remains separate from
Rust unit/coverage checks.

## Capture evidence

`bun run capture:environments` uses rich data in disposable locked E2E storage,
a fresh Chromium profile, 1440 × 1000 viewport, en-US locale and UTC timezone.
It can run alongside daily Demo. Captures are ignored under
`artifacts/environments/automated/`: hosts.png, detail.png, processes.png and manifest.json.
For manual switching acceptance, stop the daily Demo launcher and run
`bun run test:environments:ui`; this writes the sibling manual capture set and
exercises switching through persistent Demo without resetting its data.
The manifest records application revision, fixture version, anchor and routes. The host detail route is
the actual hashed route `/hosts/f0d3fd30`.

The list/detail captures were opened and reviewed: loaded synthetic avatar,
correct control placement, distinct host states, readable labels and real charts.
Full-page capture follows the application's scroll container, so the detail
capture covers its initial viewport rather than every lower panel.

For an automated capture with the control hidden, use:

```sh
CI=1 bun run capture:environments
```

This command uses rich data in locked E2E storage, checks that browser preferences
remain unchanged, and writes a separate `artifacts/environments/automated/` set.
The manual acceptance command verifies switching; the default capture does
not access daily Demo. Both also open the unmodified hosted bundle directly and
check that no local capability/control is present.

Executed quality evidence: L2 171/171; L3 81/81; shared/Worker/UI line coverage
98.36%/96.32%/99.79%; Rust 637 tests, clippy and fmt pass, with 98.98% line coverage.
The JS/Cargo vulnerability scans and secret scan passed. Native runtime parity,
parallel isolated stores, storage lock, automatic cleanup, and Demo CRUD across
a restart were exercised. Reset's active-store rejection was exercised; destructive
daily Demo reset was intentionally not run against retained demonstration data.
