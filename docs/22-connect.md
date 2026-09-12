# 22 — Connect

Connect gives agents a versioned, server-bound API and gives server managers a protected place to manage its credentials. Open [Connect](https://bat.hexly.ai/connect) with a Cloudflare Access session, choose a server, and create a read or write token. New tokens have no expiry unless a date is selected. A non-expiring key remains usable until it is revoked, rotated, or its issuer loses server authorization.

## Domain and authorization

Bat is a single-tenant deployment. It has hosts, agents, assets, bindings, tags, monitoring data, webhook configurations and global retention settings; it has no workspace membership or remote execution system. A Connect **server ID is the existing canonical `hosts.host_id`**, not the dashboard's short FNV `hid` alias. Tokens cannot create a different tenant boundary by choosing a path parameter.

Every request verifies the deployment-bound credential fingerprint, revocation/expiry, the active host, the issuing principal's current product grant, and ownership of each resource. `write` includes `read`; read credentials accept only GET and HEAD. Access cookies, probe keys, monitoring keys and legacy CLI credentials never authenticate `/api/v1`.

Product administrators are explicit `email:address` or `service:common_name` principals in the `CONNECT_MANAGERS` deployment secret. A narrower grant can be stored in `connect_server_grants(server_id, principal, revoked_at)`. An Access login by itself does not grant Connect access. All managers of the same server can manage that server's tokens. Removal of the issuer's grant invalidates its tokens on the next request, even if the token itself is not revoked. A configured global manager must be removed from `CONNECT_MANAGERS` to withdraw global authority; a narrower revoked grant cannot override that global permission.

Only local development with `ENVIRONMENT=development` and a loopback hostname permits the `local:developer` principal. Production accepts the two configured public hostnames and uses the actual request URL, never an untrusted `Host` override. The machine hostname rejects credential management and the dashboard.

## Discovery and resource coverage

API base: `https://bat.hexly.ai/api/v1`. An authenticated GET to the base or `/capabilities` describes the token's server, permissions, operation IDs, supported operations, limits and unsupported features. GET `/openapi.json` returns OpenAPI 3.1, including request/response JSON Schemas and security requirements. HEAD works for every GET. The release also provides an exported OpenAPI artifact.

The contract and route registration share `CONNECT_OPERATIONS` in `packages/worker/src/domain/connect-operations.ts`; there is no arbitrary handler, SQL, upstream URL or method dispatch endpoint. The DTO schema snapshot is validated against actual resource responses by both unit and HTTP integration tests.

In this table, `S` means `/servers/{serverId}` under `/api/v1`.

| Product information or action | Connect resource | Boundary |
| --- | --- | --- |
| Host list/detail, identity, current metrics, processes/network | `/servers`, `S` | List contains only the bound active host |
| Host description | `PATCH S/description` | This host only |
| Historical metrics and ingestion | `GET/POST S/metrics` | Required `from`/`to` Unix seconds for reads, maximum 30-day window; host payload must match |
| Identity and tier-2 observations | `POST S/identity`, `GET/POST S/tier2` | Host payload must match; existing product validation applies |
| Daily UTC maintenance | `GET/PUT/DELETE S/maintenance` | Existing recurring UTC window semantics |
| Events | `GET/POST S/events` | Bound host; event payload retains product size/tag limits |
| Alerts and health | `S/alerts`, `S/status` | Host alerts/status only |
| External monitoring and groups | `S/monitoring`, `S/monitoring/groups`, `S/monitoring/alerts` | Group counts and members are filtered to this server |
| Tag catalogue | `GET/POST S/tags`, `PUT/DELETE S/tags/{id}` | Visible tags may be read; mutation requires exclusive host ownership |
| Host tag assignment | `S/host-tags`, `S/host-tags/{tagId}` | Only tags visible to this server |
| Allowed ports | `S/allowed-ports`, `S/allowed-ports/{port}` | Existing per-host port allowlist |
| Webhook event credentials | `S/webhooks`, `S/webhooks/{id}`, `S/webhooks/{id}/rotate` | Lists omit credentials; create/rotate require write and risk confirmation |
| Agents and heartbeat | `S/agents`, `S/agents/{id}`, `S/agents/{id}/tags`, `S/agents/heartbeat` | Source/match-key collisions with other hosts are rejected; host reassignment is forbidden |
| Assets, map and overview | `S/assets`, `S/assets/{id}`, `S/assets/{id}/tags`, `S/assets/map`, `S/assets/overview` | All results and graph edges are filtered to this host |
| Agent/asset bindings | `S/bindings`, `S/bindings/{agentId}/{assetId}` | Both ends must belong to this host |
| Effective retention and probe endpoint | `GET S/settings`, `GET S/setup` | No deployment credentials are returned |
| Audit/provenance | `GET S/audit` | This host's API and credential-management records |
| Retry outcome | `GET /requests/{key}` | Current token's idempotency records only; no stored response secrets |

Shared tags can describe multiple hosts. Connect-created tags have `owner_host_id`; their name/color/delete operations are rejected if another host has acquired a reference through the existing administrative UI or CLI. Deleting an agent or asset removes its tags and bindings, as in the product. Deletion is denied if a cascade would affect a binding whose other end is outside the token's host. Webhook deletion stops its event-ingestion credential. The contract marks these operations as dangerous.

Unsupported operations are explicit in discovery. Global retention writes (`PUT S/settings`), Connect/CLI credential management through Bearer (`/tokens`, `/cli-tokens`), host deletion/retirement (`DELETE S`) and remote execution (`POST S/execute`) return `501 not_supported` for an otherwise authorized write token. Shared tag mutations and cross-server/unassigned resources return `403` or a non-disclosing `404`. Bat has no remote shell, package installation or global host deletion product action to expose.

## Requests, pagination and concurrency

Successful resource responses use `{data, serverId, requestId}`; collections additionally return `{page: {limit, nextCursor}}`. Discovery and OpenAPI are documented standalone objects. Collections use stable resource ID order, with audit ordered newest first. Pass an opaque `cursor` unchanged with the same operation, server and query. Default limit is 50 and maximum is 100. Concurrent changes are not a frozen collection snapshot; agents that need reconciliation should deduplicate IDs while paging.

All configuration reads return a server configuration `ETag`. Every supported mutation requires:

- `Authorization: Bearer …` with write scope.
- A persisted `Idempotency-Key` containing 8–128 letters, digits, `_` or `-`.
- `If-Match` set to the ETag previously read for this server.
- JSON content type for a body. Unknown top-level request fields are rejected.
- `X-Bat-Confirm: {canonical serverId}` for contract-marked dangerous actions, including deletes and webhook credential creation/rotation.

The configuration revision also changes for browser and CLI control edits through D1 triggers. Observational metrics, identity, tier-2 samples and events do not invalidate configuration ETags. A single Durable Object per Bat deployment serializes control mutations across browser, CLI and Connect, because tags, bindings and settings are shared. Reads and existing probe observation endpoints do not enter that queue. The queue remains held while timed-out operations settle; a lost response never releases a second copy of the same destructive intent.

An exact repeated operation/path/query/body with the same idempotency key replays the original status and encrypted response for seven days, with `Idempotency-Replayed: true` and `X-Original-Request-Id`. It does not recheck an old ETag after a completed match, but does recheck current token and product authorization. Different payloads using the same key return `409 idempotency_conflict`. Keys are hashed in D1 and permanent tombstones prevent an expired replay from executing again. JSON member ordering is part of the fingerprint: retain the original request for retries.

On `504`, connection loss, or `409 outcome_unknown`, inspect `/requests/{key}` and the host's current state before deciding whether a new intent is needed. A pending request can remain pending if a Worker terminates after a side effect. Bat does not claim an impossible transaction across arbitrary product handlers, D1 and network requests: pending outcomes are never automatically reclaimed or re-executed. Reuse the existing key; do not blindly send a new one. A `412 version_conflict` means reread and reconsider the change. Successful writes return the new ETag; no-content mutations return `204`.

Errors use one schema:

```json
{"error":{"code":"insufficient_scope","message":"A write token is required.","requestId":"request-uuid"}}
```

| Status | Meaning |
| --- | --- |
| 400 / 415 / 422 | Invalid payload, unsupported media type, or product limit |
| 401 | Missing, invalid, expired, rotated or revoked credential |
| 403 / 404 | Scope/host/product denial or unavailable resource |
| 409 | Idempotency conflict, pending/expired outcome, or resource conflict |
| 412 / 428 | Stale ETag or required precondition/confirmation missing |
| 413 | Request or response exceeds the documented limit |
| 429 | Rate/queue limit; honor `Retry-After` |
| 501 | Explicitly unsupported product operation |
| 503 / 504 | Dependency unavailable or deadline exceeded; a mutation may have an unknown outcome |

Every response is `no-store`, has `X-Request-Id`, and never reflects an Authorization header. Connect permits no browser CORS; cross-origin/OPTIONS requests are denied. Management mutations additionally require the exact same Origin and `X-Bat-Management: 1`. Bearer credentials are not taken from URLs, forms or cookies.

Limits are 64 KiB streamed request bodies, five seconds to receive a body, 2 MiB responses and fifteen seconds for an operation. Native Cloudflare rate limiting applies 600 requests/minute per hashed source IP; D1 enforces 120 reads or 30 writes/minute per token and 60 management requests/minute per principal. The shared configuration queue holds at most 32 requests. The edge limiter is approximate per Cloudflare location; the D1 token limiter is authoritative across locations.

## Recoverable credentials and the UI

Keys contain 256 random bits and a `batc_` prefix. D1 stores a deployment-bound SHA-256 authentication fingerprint and recoverable AES-256-GCM ciphertext, not plaintext. HKDF-SHA256 derives encryption keys from the `CONNECT_TOKEN_KEYS` deployment secret with a Bat/purpose context; a fresh 96-bit nonce is used per encryption. Additional authenticated data binds a token to its deployment, host, record ID, scope, issuer and expiry. Idempotent response encryption has its own token/request context, including webhook credentials returned by high-risk actions.

`CONNECT_TOKEN_KEYS` is a versioned JSON keyring with `active` and `keys` fields. Each key is a base64url-encoded 32-byte random value. The active key ID is written into ciphertext. When rotating the deployment key, keep old key IDs until all corresponding token ciphertext has been rotated and replay payloads have expired. Losing those key versions makes repeat Reveal and stored replay responses unrecoverable. Restore the secret from the deployment operator's secure backup, or revoke/reissue affected tokens. Never use the token hash as a supposed recovery mechanism.

Creation returns metadata only. Repeat Reveal requires entering the token's name and consuming a one-use, sixty-second challenge bound to the manager, token version and action. The key is shown for at most thirty seconds and cleared on blur, hidden tabs, navigation or server change. A delayed response cannot repopulate a key after that privacy boundary. Keys are not stored in browser storage, SWR, query parameters or analytics. Copy is an explicit user action; copied credentials remain in the operating system clipboard until replaced.

Rename, rotate and revoke use optimistic token versions. Rotation replaces both encrypted key and fingerprint, invalidating the previous credential immediately; revocation removes ciphertext. The token list displays server, scope, creation, expiry, last use and lifecycle state. Changing scope or expiry requires a new credential. At most fifty non-revoked tokens may exist per server, including expired tokens; revoke expired records to free a slot.

The page uses Basalt components, shared design tokens and existing responsive navigation. Controls have labels, keyboard focus, dialog escape/focus restoration, disabled pending states and accessible error/status messages. Browser tests disable tracing, video and automatic screenshots for all credential scenarios; only explicitly masked views are retained as evidence.

## Audit and administration

`connect_audit` retains ninety days of request IDs, server/token IDs, actor principal, operation ID, result status, error code and timestamp. It stores no raw headers, token values, submitted bodies or user agents. Credential changes and their audit records commit in the same D1 batch; Reveal records its audit before returning plaintext. API mutation outcome/audit records are persisted together. Audit failures return a closed `503` response and advise checking the original intent, because a product mutation may already have completed.

Worker invocation observability is disabled; Connect's D1 audit supplies provenance without collecting credential traffic. Do not enable request-header/body capture, frontend analytics, Access log exports containing authorization headers, proxy debug output or browser traces on these routes. Application audit includes rejected requests that reach the Worker; requests rejected by the edge or coordination queue are identified by their response request ID and Cloudflare operational telemetry.

Deployment administrators can grant a specific server to an already authorized Access principal using parameterized D1 administration. The grant operation is deliberately outside the Bearer surface. For example, this SQL expresses the intended change; substitute reviewed canonical IDs and an actual Access principal using bound parameters:

```sql
INSERT INTO connect_server_grants(server_id, principal, revoked_at)
VALUES (?, ?, NULL)
ON CONFLICT(server_id, principal) DO UPDATE SET revoked_at = NULL;

UPDATE connect_server_grants SET revoked_at = unixepoch()
WHERE server_id = ? AND principal = ?;
```

Record operator grant changes in the deployment change record. Never promote every Access service token to a Connect manager. Existing CLI token issuance remains Access-protected and is not a way to obtain Connect scope.

## Agent example

Read `BAT_TOKEN` from your secret store. Keep it out of prompts, shell history, process arguments and debug output. The header is passed through stdin below; the examples never print the credential.

```bash
printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- https://bat.hexly.ai/api/v1/capabilities

printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- https://bat.hexly.ai/api/v1/openapi.json \
  --output bat-connect-openapi.json

# Read SERVER_ID from capabilities; record ETag from this response.
printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- --include \
  "https://bat.hexly.ai/api/v1/servers/$SERVER_ID"

# Persist INTENT_ID and this exact request before sending.
printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- --request PATCH \
  --header 'Content-Type: application/json' \
  --header "If-Match: $ETAG" --header "Idempotency-Key: $INTENT_ID" \
  --data '{"description":"Primary application server"}' \
  "https://bat.hexly.ai/api/v1/servers/$SERVER_ID/description"
```

Agent instructions: discover capabilities and the OpenAPI contract first; operate only on the returned canonical server; follow pagination; read current state and ETag before writing; persist one idempotency key per intent; acknowledge destructive actions with `X-Bat-Confirm`; inspect unknown outcomes before any new intent. A read credential is sufficient for inventory, diagnostics and reconciliation reports.

## Access and deployment

Cloudflare Access evaluates before the Worker. A valid Connect Bearer header alone cannot pass an interactive Access login application. The browser application must retain its existing Allow/Service Auth rules and JWT audience. Only the precise machine paths `bat.hexly.ai/api/v1` and `bat.hexly.ai/api/v1/*` receive an Access **Bypass** policy, so those requests reach the Worker's compulsory Connect authentication. The wildcard does not cover the exact parent. Do not bypass `/api/*`, `/connect`, `/api/connect/*`, `/api/auth/*` or the root hostname.

The existing production controls were verified through an authenticated, read-only browser export on 2026-09-12. Preserve these when adding the two Connect paths:

| Application | Existing path coverage | Policies |
|---|---|---|
| `bat-auth` (`1ee43cb7-95a4-4ab6-9fa3-f756824fb605`) | `bat.hexly.ai`, including `/connect` and `/api/connect/*` | `Allow Authorized Users`: Allow for the configured email, 168-hour session; `Service-Auth`: Service Auth (`non_identity`) for three specific service tokens |
| `shared-bypass` (`2950f1fa-7c5d-4a77-a007-09cc57c3e576`) | `*.hexly.ai/api/live`, including the explicit `bat.hexly.ai/api/live` destination | `Bypass`: Everyone; this shared application also serves other projects, so preserve its other destinations |

The browser audience is `f9289df18aed3f2a3f08ada1587c2a5fde199934b873c2026a94bf68863bdcd0`. These are legacy zone-scoped Access applications under zone `c64f1264b07d306e9ec8810cbec9f60f`; an empty account-scoped application listing does not mean the browser is unprotected. Verify access to the zone application/policy endpoints before attempting changes. Browser read access alone does not establish that an API credential can edit those policies.

The independent machine domain `bat-ingest.worker.hexly.ai` also accepts `/api/v1` through the same Bearer validation; its whitelist rejects Connect management and SPA paths. Existing probe, event webhook and monitoring authentication stay separate. `GET /api/live` remains public. `run_worker_first=true` ensures the Worker verifies browser Access JWTs before serving SPA/assets, including the Connect UI.

Production requires these existing secrets: `BAT_READ_KEY`, `BAT_WRITE_KEY`, `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`. New secret names are `CONNECT_TOKEN_KEYS` and `CONNECT_MANAGERS`. Variables are `ENVIRONMENT=production` and `CONNECT_DEPLOYMENT_ID=bat-production`. Bindings are `DB`, optional `BAT_KV`, `ASSETS`, `CONNECT_COORDINATOR` and `CONNECT_EDGE_LIMITER`. The first DO class migration is `connect-v1`; D1 migration `0028_connect.sql` adds credential/grant/audit/retry tables, host tag ownership and configuration revision triggers.

Deploy through the repository's Release workflow, which applies production D1 migrations **before** deploying Worker code. The `connect-access-audit` dispatch performs only metadata reads using the existing production environment token; it never deploys, changes policies or prints credentials. Keep the actual Access application/policy IDs, audience and predeployment Worker version in the release evidence.

Rollback first removes only the two Connect Bypass applications (or disables those two policies), restoring inherited browser Access protection. Cloudflare [does not allow a direct version rollback across a Durable Object class lifecycle migration](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings). Recover by deploying the previous product source through CI **with the `ConnectCoordinator` export, its bindings and the `connect-v1` migration retained**. A compatibility export can return `503` for any old coordinator calls while the original Worker entry serves the previous product. Restore the previous asset routing configuration as well as its UI build. Keep the additive D1 schema and DO namespace; do not drop tables while any deployment may still use them. Keep encryption key versions so an eventual forward deployment can recover existing credentials. Revoking a compromised token and removing its issuer's grant take effect without redeploying. Secret removal must follow withdrawal of Connect traffic and code.

Validation includes the complete manifest's response contracts, read/write and host ownership matrices, real D1/DO HTTP tests, browser privacy/keyboard/mobile flows, audit and encryption failures, concurrent ETags, idempotency and every credential lifecycle transition. L2 and L3 always use separate local Wrangler databases and generated mode-0600 test keyrings under `.wrangler`; they never overwrite `.dev.vars` or use production D1. Production smoke uses dedicated temporary hosts, credentials and product records, then revokes/deletes those fixtures and temporary Access authorization.
