<p align="center">
  <img src="../assets/brand/icon-rounded.png" width="128" alt="Bat logo" />
</p>
<h1 align="center">Bat</h1>
<p align="center">Collect Linux host metrics and inspect status, alerts, and infrastructure assets.</p>
<p align="center">
  <a href="https://bat.hexly.ai">Website</a> ·
  <a href="../README.md">简体中文</a>
</p>

## What it does

Bat helps individuals and small teams look after multiple VPS hosts. A Rust probe collects Linux metrics, a Cloudflare Worker receives them and evaluates alerts, and a React dashboard shows trends, events, and asset relationships.

One Hono Worker serves both API and SPA. D1 persists data, while the production KV binding caches selected frequent queries. Browsers access `bat.hexly.ai` through Cloudflare Access; probes, monitoring integrations, and the CLI use the machine endpoint with their own credentials. Probe distributions target Linux x86_64 and aarch64.

## Features

- Collect CPU, memory, disk, network, PSI, TCP, and process metrics. Basic metrics are sent every 30 seconds by default, with a configurable interval.
- Discover hardware, software, Docker containers, systemd services, listening ports, and selected web-server configuration. Available commands and read permissions determine what can be collected.
- Inspect host history, alerts, tags, and events; configure allowed ports and daily maintenance windows in UTC.
- Expose monitoring APIs for tools such as Uptime Kuma to query host or group health. Webhook endpoints receive events from external scripts.
- Manage agents, assets, their relationships, and agent heartbeats through the dashboard and CLI.
- Create server-bound read/write Bearer tokens in Connect, discover `/api/v1` through OpenAPI, and access authorized resources with repeat Reveal, rotation, revocation and optional expiry.
- Aggregate and purge data hourly. Retention can be 1, 7, or 30 days, defaulting to 7, and applies to raw metrics, hourly aggregates, extended snapshots, and events.

KV is optional: missing or failed cache reads fall back to D1. Server rules evaluate alerts. Webhooks receive events; the repository does not provide a general alert-message delivery channel.

## Usage

Open the [dashboard](https://bat.hexly.ai) with Access permission. To connect a Linux host, obtain `BAT_WRITE_KEY` from the instance maintainer and follow the [probe installation guide](21-development.md#安装-linux-探针) to install the binary and repository systemd unit. Configure `/etc/bat/config.toml`:

```toml
worker_url = "https://bat-ingest.worker.hexly.ai"
write_key = "<your-write-key>"
interval = 30
```

`worker_url` requires HTTPS except for loopback development URLs. The interval must be at least 10 seconds. The Setup API returns only the URL, not a write key. Releases upload probe binaries and checksums, without a ready-to-use installation script.

The asset CLI is a private workspace package. After installing dependencies and building as described below, run it from source:

```bash
bun packages/cli/src/bin/bat-cli.ts login
bun packages/cli/src/bin/bat-cli.ts agent list
```

Browser login saves a token scoped to assets. The heartbeat service periodically submits the supplied `running` or `stopped` status; it does not inspect whether a process is actually running. On macOS, `service install` writes a launchd plist that must be loaded separately. Linux metric collection uses the Rust probe.

## Development

Use Bun and Node.js 22.12+. Building or testing the probe also requires a current stable Rust toolchain.

```bash
git clone https://github.com/nocoo/bat.git
cd bat
bun install --frozen-lockfile
bun run build
cargo build --release --locked --manifest-path probe/Cargo.toml
```

`build` builds the shared package and UI, writing the SPA to `packages/worker/static/`. `packages/shared/` contains types and rules, `packages/worker/` contains API and data access, `packages/ui/` is the dashboard, `packages/cli/` manages assets, and `probe/` contains the Rust collector.

The ordinary Vite development proxy is fixed to the production browser endpoint and needs an Access service token in `packages/ui/.env.local`. It does not automatically use the local Worker started alongside it. Prepare your target and credentials using the [development guide](21-development.md#开发配置), then run:

```bash
bun run dev
```

This starts Vite on 7025 and a local Worker on 37025. Production GitHub Actions applies D1 migrations before deploying the Worker. Probe binaries are built only for version-tag releases; updating VPS installations remains manual.

## Tests

Install dependencies and run `bun run build` to prepare Worker assets. API and browser tests generate isolated keyrings under `.wrangler` without overwriting personal `.dev.vars` configuration.

```bash
bun run test
bun run turbo test:e2e --filter=@bat/worker
bunx playwright install chromium
bun run test:e2e:pw
```

The first command runs TypeScript and Rust unit tests. API E2E chooses an ephemeral loopback port and a unique `packages/worker/.wrangler/e2e/<random>` state directory per run; browser tests use port 27025 and `.wrangler/e2e-pw`. Both explicitly use local Wrangler resources.

Keep the browser-test port 27025 free and unset `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CF_API_TOKEN` in the test process. The API runner rejects these remote credentials. Browser tests need Playwright Chromium. Tests use synthetic records without real probes or VPS credentials.

## Stack

| Technology | Purpose |
| --- | --- |
| Rust / Tokio / reqwest | Linux metric collection and upload |
| TypeScript / Bun / Turborepo | Shared code, workspaces, and CLI tooling |
| Hono / Cloudflare Workers | Ingestion, API, scheduled tasks, and static assets |
| Cloudflare D1 / KV | Persistent data and optional caches |
| Vite / React / React Router / Recharts | Dashboard, routing, and trend charts |
| Tailwind CSS / Radix UI | Styling and interface components |
| Cloudflare Access / `@nocoo/base-cli` | Browser authentication and CLI login |
| Vitest / Playwright / Cargo | TypeScript, browser, and Rust tests |
| Cloudflare R2 | Probe binary and checksum distribution |

## Documentation

- [Documentation index](README.md)
- [Probe installation, development, and releases](21-development.md)
- [Architecture and design background](02-architecture.md)
- [Monitoring API](16-monitoring-api.md)
- [Connect API, permissions and deployment](22-connect.md)
- [D1 / KV changes](20-d1-to-kv-migration.md)

## License

[MIT](../LICENSE)
