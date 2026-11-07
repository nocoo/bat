# `bat` CLI

Command line client for [bat](https://bat.hexly.ai). It talks to two independent domains and keeps
them isolated: an **assets profile** for the bat API, and a **workstation profile** for this machine.

```bash
npm install --global @nocoo/bat
# or run without installing
npx @nocoo/bat --help
```

Requires Node.js 22 or newer. The published package is a single self-contained bundle: no
postinstall scripts, no native build step, no workspace dependencies at runtime.

## Domains

| Domain              | Host                                                                 | Credential              | Commands                                                  |
| ------------------- | -------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| Assets profile      | Browser login at `bat.hexly.ai`; API at `bat-ingest.worker.hexly.ai` | Assets-scoped CLI token | `login`, `status`, `agent`, `asset`, `binding`, `service` |
| Workstation profile | `https://bat-ingest.worker.hexly.ai` (ingest)                        | `batw_` workstation key | `workstation login`, `setup`, `probe`, `status`, `logout` |

Asset commands manage remote agents, assets and bindings. Login and service commands also manage
their own local configuration and heartbeat task. Workstation commands report this laptop or desktop's
capacity and server reachability. The dashboard retains their observation history under the global
retention setting; workstation probes do not collect process lists or create server alerts.

The two profiles never share credential files or tokens. They use separately configured API origins;
a workstation login does not overwrite the assets profile.

## Self-check and upgrade

```bash
bat doctor [--offline] [--json]   # runtime, profiles, token, schedule, recent report
bat update [--check]              # upgrade from npm, falling back to the Tencent mirror
```

`doctor` is read-only. A failing check exits non-zero; a warning (optional
profile, unknown version, stale log, held probe lock) does not. `--offline`
skips the registry, token and reachability probes instead of guessing.
`update` resolves the newest published version from npmjs first and the mirror
second, and attempts the install in that same order.

## Asset commands

```bash
bat login [--url https://bat.hexly.ai]   # browser OAuth, writes ~/.config/bat/config.json
bat status                               # verify the stored token against the API
bat agent list                           # agents registered for this source key
bat agent create <match-key> [--nickname ...] [--role ...]
bat agent update <id> [--status ...] [--clear-nickname]
bat agent delete <id>
bat agent heartbeat <key:running,key:stopped>
bat agent tags <id> [--tag-ids 1,2,3] [--clear]
bat asset list|create|update|delete|tags
bat binding list|create|delete
bat service run <key:status,...>          # foreground heartbeat loop
bat service status                        # PID file check
bat service install <key:status,...>      # macOS launchd plist (does not load it)
bat service uninstall                     # bootout + remove the plist
```

The config lives in `~/.config/bat/` with `0600` permissions. Credentials are overwritten only by
`bat login`; a re-login keeps the installation `source_key` unless none exists yet.

## Workstation commands

Workstation commands live under `bat workstation` with their own profile in
`~/.config/bat/workstation/`. The stable installation UUID (`installation.json`) survives logout; the
`batw_` credential (`workstation.json`) does not. Both files are atomic writes with `0600` permissions, and
a Windows login additionally restricts the directory ACL to the current user.

```bash
bat workstation login             # PKCE browser authorization, then machine exchange
bat workstation probe             # one collection cycle and one report
bat workstation setup             # install the 10 minute schedule (login required)
bat workstation setup --remove    # remove only the files this CLI owns
bat workstation status            # local profile and schedule source config
bat workstation logout            # revoke the key on the server, then forget it
```

`login` opens `/workstation-login` on `https://bat.hexly.ai`; the machine then exchanges the
authorization code with `https://bat-ingest.worker.hexly.ai`. That ingest origin is derived locally
from the trusted dashboard origin, never from callback data, and the exchange response must name
exactly that origin. Local acceptance uses one explicit origin:

```bash
bat workstation login --loopback-url http://127.0.0.1:8787
```

`probe` fetches authorized targets, samples CPU over at least 200 ms, reads memory with platform
semantics, checks only the primary local volume through an isolated `statfs` child, lists addresses
without MAC data, and pings each target exactly three times. Unix uses argv-only `ping`/`ping6` with
`LC_ALL=C` (macOS `ping6` has no usable `-W`); Windows uses the .NET `Ping` class through PowerShell
with bounded output. A missing ping binary or a denied socket is reported as a local error, never as a
network outage, and a lost packet keeps its sequence slot. At most 100 targets run with 8 in flight
inside one absolute 120 second deadline that also covers HTTP, child processes, retries and sleeps;
the upload keeps a reserved budget, retries reuse the same report ID and body, and there is no
persisted queue or cached target list. Targets that were never probed are reported as an error with
the reason in `collection_errors`. Report bodies are capped at 64 KiB and collection errors are
bounded.

`setup` installs a native per-user schedule with an absolute Node.js path and an absolute entry point:

| OS      | Backend | Registration                                                 |
| ------- | ------- | ------------------------------------------------------------ |
| macOS   | launchd | `StartInterval` 600, no `KeepAlive`                          |
| Linux   | systemd | `--user` oneshot service plus timer                          |
| POSIX   | cron    | explicit `--backend cron`, managed crontab block only        |
| Windows | windows | interactive Task Scheduler task, battery allowed, no wake-up |

There is no silent fallback: Linux without `systemd --user` fails and tells you to pass
`--backend cron`. `setup` requires a logged-in profile, is idempotent for the same backend, and
refuses to switch backends while an old schedule is registered (remove it first). Registration is
transactional: a failed reinstall restores the previous working files and registration instead of
deleting a valid schedule. Removal unregisters first, tolerates only "nothing registered" answers,
deletes its own files, then reloads the unit manager; a real unregister failure keeps the files and
the schedule record.

A probe holds a single-instance lock at `~/.config/bat/workstation/probe.lock` via `proper-lockfile`:
acquisition is an atomic directory create, the lock is refreshed every 30 seconds, and a lock older
than three minutes (longer than one run) is recovered automatically. If the lock is stolen or its
heartbeat fails, the whole run aborts instead of reporting. `status` reports a live lock.

`logout` revokes the current key through `POST /api/workstation-probe/revoke` before deleting the
credential. If revocation fails nothing is deleted and the command exits non-zero, so a machine never
silently keeps a live key or claims an offline revoke. The installation UUID and any installed
schedule remain; the schedule is removed only by `setup --remove`.

## Development

```bash
bun run build        # bun build --target node → dist/bat.js
bun run dev          # run the entrypoint from source
bun run typecheck
bun run test:coverage
```

`dist/bat.js` is a single bundled Node.js file; it embeds the shared types/validators and the CLI
framework. The command modules stay thin: argument parsing and output only, with the logic in
exported `run*` functions that tests call directly.

## License

MIT
