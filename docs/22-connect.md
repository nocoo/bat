# 22 — Connect

Connect gives agents a versioned API with explicit server authorization and gives server managers a protected place to manage its credentials. Open [Connect](https://bat.hexly.ai/connect) with a Cloudflare Access session, create a read or write key, and select its servers. **One key may authorize multiple servers, and one server may be authorized by multiple keys.** New keys have no expiry unless a date is selected. An explicit empty `serverIds: []` grants no server access; it never means every server.

## Domain and authorization

Bat is a single-tenant deployment. It has hosts, agents, assets, bindings, tags, monitoring data, webhook configurations and global retention settings; it has no workspace membership or remote execution system. A Connect **server ID is the existing canonical `hosts.host_id`**, not the dashboard's short FNV `hid` alias. Tokens cannot create a different tenant boundary by choosing a path parameter.

Every request verifies the deployment-bound credential fingerprint and revocation/expiry, then recomputes the intersection of the key's configured server set, active hosts, and its issuer's current product grants. The target server must be in that effective set, and every resource must belong to the request's target server. Even when a key authorizes A and B, a request under A cannot select or move B's resources. `write` includes `read`; read credentials accept only GET and HEAD. Access cookies, probe keys, monitoring keys and legacy CLI credentials never authenticate `/api/v1`.

Product administrators are explicit `email:address` or `service:common_name` principals in the `CONNECT_MANAGERS` deployment secret. A narrower grant can be stored in `connect_server_grants(server_id, principal, revoked_at)`. An Access login by itself does not grant Connect access. A co-manager must have authority over the key's **entire configured set** to list, reveal, edit, rotate or revoke it; empty keys require their owner or a global manager. Newly added servers must also be within the issuer's current authority. Removing the issuer's grant for A immediately disables A while preserving authorized B access. A configured global manager must be removed from `CONNECT_MANAGERS` to withdraw global authority; a narrower revoked grant cannot override that global permission.

Create with `POST /api/connect/tokens` and required `serverIds`, name and scope. `PATCH /api/connect/tokens/{tokenId}` edits the set, name, scope or expiry using the key's `If-Match` version. IDs are deduplicated and sorted; unknown, deleted or inactive servers are rejected. Omitting `serverIds` on a canonical create is an error. The Access-protected management contract is `/api/connect/openapi.json`; token GET/list, challenge, Reveal, rotate, revoke and audit use the same canonical token path. Existing `/api/connect/servers/{serverId}/tokens` routes remain available for singleton clients and require full-set authority; omitting the set on legacy create selects that path's server. Legacy PATCH still only permits name and server set edits.

For existing singleton clients, token metadata, capabilities and the server-list envelope retain the deprecated `serverId` field when exactly one server is present. New clients always use `serverIds`; empty and multi-server sets omit the scalar field.

Only local development with `ENVIRONMENT=development` and a loopback hostname permits the `local:developer` principal. Production accepts the two configured public hostnames and uses the actual request URL, never an untrusted `Host` override. The machine hostname rejects credential management and the dashboard.

## Discovery and resource coverage

API base: `https://bat-ingest.worker.hexly.ai/api/v1`. An authenticated GET to the base or `/capabilities` describes the token's effective `serverIds`, permissions, operation IDs, supported operations, limits and unsupported features. GET `/openapi.json` returns OpenAPI 3.1, including request/response JSON Schemas and security requirements. HEAD works for every GET. An empty key can discover capabilities and receives an empty server list, but no server resources. The release also provides exported OpenAPI artifacts.

The contract and route registration share `CONNECT_OPERATIONS` in `packages/worker/src/domain/connect-operations.ts`; there is no arbitrary handler, SQL, upstream URL or method dispatch endpoint. The DTO schema snapshot is validated against actual resource responses by both unit and HTTP integration tests.

In this table, `S` means `/servers/{serverId}` under `/api/v1`.

| Product information or action | Connect resource | Boundary |
| --- | --- | --- |
| Host list/detail, identity, current metrics, processes/network | `/servers`, `S` | List contains only the currently authorized active hosts; detail targets one server |
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
| Retry outcome | `GET /requests/{key}` | Current token's records only, and only while the original target server remains authorized; no stored response secrets |

Shared tags can describe multiple hosts. Connect-created tags have `owner_host_id`; their name/color/delete operations are rejected if another host has acquired a reference through the existing administrative UI or CLI. Deleting an agent or asset removes its tags and bindings, as in the product. Deletion is denied if a cascade would affect a binding whose other end is outside the request's target server. Webhook deletion stops its event-ingestion credential. The contract marks these operations as dangerous.

Unsupported operations are explicit in discovery. Global retention writes (`PUT S/settings`), Connect/CLI credential management through Bearer (`/tokens`, `/cli-tokens`), host deletion/retirement (`DELETE S`) and remote execution (`POST S/execute`) return `501 not_supported` for an otherwise authorized write token. Shared tag mutations and cross-server/unassigned resources return `403` or a non-disclosing `404`. Bat has no remote shell, package installation or global host deletion product action to expose.

## Requests, pagination and concurrency

Successful server resource responses use `{data, serverId, requestId}`; the cross-server list uses `serverIds`. Collections additionally return `{page: {limit, nextCursor}}`. Discovery and OpenAPI are documented standalone objects. Collections use stable resource ID order, with audit ordered newest first. Pass an opaque `cursor` unchanged with the same operation, server and query. The server-list cursor binds a fixed-size hash of the effective authorization set; changing the set invalidates that cursor. Default limit is 50 and maximum is 100. Concurrent changes are not a frozen collection snapshot; agents that need reconciliation should deduplicate IDs while paging.

Server configuration reads return that server's `ETag`, shared across all keys that authorize it. Multi-server discovery returns a credential ETag, so clients must read the target server before writing. Singleton discovery retains its previous server ETag behavior. Every supported mutation requires:

- `Authorization: Bearer …` with write scope.
- A persisted `Idempotency-Key` containing 8–128 letters, digits, `_` or `-`.
- `If-Match` set to the ETag previously read for this server.
- JSON content type for a body. Unknown top-level request fields are rejected.
- `X-Bat-Confirm: {canonical serverId}` for contract-marked dangerous actions, including deletes and webhook credential creation/rotation.

The configuration revision also changes for browser and CLI control edits through D1 triggers. Observational metrics, identity, tier-2 samples and events do not invalidate configuration ETags. A single Durable Object per Bat deployment serializes control mutations across browser, CLI and Connect, because tags, bindings and settings are shared. Reads and existing probe observation endpoints do not enter that queue. The queue remains held while timed-out operations settle; a lost response never releases a second copy of the same destructive intent.

An exact repeated operation/path/query/body with the same idempotency key replays the original status and encrypted response for seven days, with `Idempotency-Replayed: true` and `X-Original-Request-Id`. It does not recheck an old ETag after a completed match, but does recheck current token and product authorization. Removing the original server's grant prevents both replay and request-status disclosure. The idempotency key namespace is token-wide: different payloads or target servers using the same key return `409 idempotency_conflict`. Keys are hashed in D1 and permanent tombstones prevent an expired replay from executing again. JSON member ordering is part of the fingerprint: retain the original request for retries.

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

Every response is `no-store` and `no-transform`, has `X-Request-Id`, and never reflects an Authorization header. `no-transform` prevents CDN compression from weakening the configuration ETag: clients must be able to copy the returned strong validator into `If-Match` unchanged. Connect permits no browser CORS; cross-origin/OPTIONS requests are denied. Management mutations additionally require the exact same Origin and `X-Bat-Management: 1`. Bearer credentials are not taken from URLs, forms or cookies.

Limits are 64 KiB streamed request bodies, five seconds to receive a body, 2 MiB responses and fifteen seconds for an operation. Native Cloudflare rate limiting applies 600 requests/minute per hashed source IP; D1 enforces 120 reads or 30 writes/minute per token and 60 management requests/minute per principal. The shared configuration queue holds at most 32 requests. The edge limiter is approximate per Cloudflare location; the D1 token limiter is authoritative across locations.

## Recoverable credentials and the UI

Keys contain 256 random bits and a `batc_` prefix. D1 stores a deployment-bound SHA-256 authentication fingerprint and recoverable AES-256-GCM ciphertext, not plaintext. HKDF-SHA256 derives encryption keys from the `CONNECT_TOKEN_KEYS` deployment secret with a Bat/purpose context; a fresh 96-bit nonce is used per encryption. Additional authenticated data binds a token to its deployment, immutable legacy context, record ID, scope, issuer and expiry. Legacy keys retain their original `server_id` only as encryption context; new keys use an empty context. Authorization is stored separately in `connect_token_servers(token_id, server_id)`. Editing the set never changes the key value. Scope/expiry edits re-encrypt that same key against its new authenticated metadata. Idempotent responses retain their own target-server/token/request encryption context, including webhook credentials returned by high-risk actions.

`CONNECT_TOKEN_KEYS` is a versioned JSON keyring with `active` and `keys` fields. Each key is a base64url-encoded 32-byte random value. The active key ID is written into ciphertext. When rotating the deployment key, keep old key IDs until all corresponding token ciphertext has been rotated and replay payloads have expired. Losing those key versions makes repeat Reveal and stored replay responses unrecoverable. Restore the secret from the deployment operator's secure backup, or revoke/reissue affected tokens. Never use the token hash as a supposed recovery mechanism.

Creation returns metadata only. Repeat Reveal requires entering the token's name and consuming a one-use, sixty-second challenge bound to the manager, token version and action. The key is shown for at most thirty seconds and cleared on blur, hidden tabs, navigation or server change. A delayed response cannot repopulate a key after that privacy boundary. Keys are not stored in browser storage, SWR, query parameters or analytics. Copy is an explicit user action; copied credentials remain in the operating system clipboard until replaced.

All edits, rotation and revocation use optimistic token versions. A set replacement, version update and before/after audit snapshot commit in one D1 batch; concurrent changes using the same ETag have one winner. Rotation replaces both encrypted key and fingerprint, invalidating the previous credential on every selected server immediately; revocation removes ciphertext. The list and create/edit dialogs show the complete selected server set, including an explicit no-access state, plus scope, creation, expiry, last use and lifecycle state. Scope/expiry edits invalidate old confirmation challenges and take effect on the next request. At most fifty non-revoked keys may authorize each server and two hundred may belong to one issuer, including expired keys; revoke expired records to free a slot. A key accepts at most one hundred input server IDs.

The page uses Basalt components, shared design tokens and existing responsive navigation. Controls have labels, keyboard focus, dialog escape/focus restoration, disabled pending states and accessible error/status messages. Browser tests disable tracing, video and automatic screenshots for all credential scenarios; only explicitly masked views are retained as evidence.

## Audit and administration

`connect_audit` retains ninety days of request IDs, server/token IDs, actor principal, operation ID, result status, error code, timestamp and before/after authorization sets. It stores no raw headers, token values, submitted bodies or user agents. A server's audit endpoint omits other server IDs. Token audit also filters historical product operations and clips historical sets to the requesting manager's current server authority; global managers can inspect the full history. Credential changes and their audit records commit in the same D1 batch; Reveal records its audit before returning plaintext. API mutation outcome/audit records are persisted together. Audit failures return a closed `503` response and advise checking the original intent, because a product mutation may already have completed.

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
  curl --fail-with-body --header @- https://bat-ingest.worker.hexly.ai/api/v1/capabilities

printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- https://bat-ingest.worker.hexly.ai/api/v1/openapi.json \
  --output bat-connect-openapi.json

# Choose SERVER_ID from capabilities.serverIds; record this server's ETag.
printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- --include \
  "https://bat-ingest.worker.hexly.ai/api/v1/servers/$SERVER_ID"

# Persist INTENT_ID and this exact request before sending.
printf 'Authorization: Bearer %s\n' "$BAT_TOKEN" |
  curl --fail-with-body --header @- --request PATCH \
  --header 'Content-Type: application/json' \
  --header "If-Match: $ETAG" --header "Idempotency-Key: $INTENT_ID" \
  --data '{"description":"Primary application server"}' \
  "https://bat-ingest.worker.hexly.ai/api/v1/servers/$SERVER_ID/description"
```

Agent instructions: discover capabilities and the OpenAPI contract first; choose a target from the returned canonical `serverIds`; follow pagination; read that server's current state and ETag before writing; persist one idempotency key per intent; acknowledge destructive actions with `X-Bat-Confirm`; inspect unknown outcomes before any new intent. A read credential is sufficient for inventory, diagnostics and reconciliation reports.

## Access and deployment

Cloudflare Access evaluates before the Worker. A valid Connect Bearer header alone cannot pass an interactive Access login application. Connect uses Bat's existing dedicated machine hostname, `bat-ingest.worker.hexly.ai`, for `/api/v1` and `/api/v1/*`. This hostname is outside the browser Access application, and the Worker requires Connect Bearer authentication on every versioned request. No new Bypass, Service Auth or Allow policy is needed for the Agent API. The browser application retains its existing Allow/Service Auth rules and JWT audience. Its entire hostname, including `/connect`, `/api/connect/*`, `/api/auth/*` and `/api/v1`, remains protected by Access at both the edge and Worker. Only the existing `/api/live` health exception remains public.

The existing production controls were verified through an authenticated, read-only browser export on 2026-09-12. Preserve these existing controls for the dual-hostname deployment:

| Application | Existing path coverage | Policies |
|---|---|---|
| `bat-auth` (`1ee43cb7-95a4-4ab6-9fa3-f756824fb605`) | `bat.hexly.ai`, including `/connect` and `/api/connect/*` | `Allow Authorized Users`: Allow for the configured email, 168-hour session; `Service-Auth`: Service Auth (`non_identity`) for three specific service tokens |
| `shared-bypass` (`2950f1fa-7c5d-4a77-a007-09cc57c3e576`) | `*.hexly.ai/api/live`, including the explicit `bat.hexly.ai/api/live` destination | `Bypass`: Everyone; this shared application also serves other projects, so preserve its other destinations |

The browser audience is `f9289df18aed3f2a3f08ada1587c2a5fde199934b873c2026a94bf68863bdcd0`. These are legacy zone-scoped Access applications under zone `c64f1264b07d306e9ec8810cbec9f60f`; an empty account-scoped application listing does not mean the browser is unprotected. Verify access to the zone application/policy endpoints before attempting changes. Browser read access alone does not establish that an API credential can edit those policies.

The canonical machine domain `bat-ingest.worker.hexly.ai` accepts `/api/v1` through compulsory Bearer validation; its whitelist rejects Connect management, browser authentication and SPA paths, including requests with forged Host or Access headers. The UI, capabilities and OpenAPI advertise this machine hostname. Browser requests to `/api/v1` would require both a valid Access session and a Connect Bearer token; Agents use the advertised machine endpoint instead. Existing probe, event webhook and monitoring authentication stay separate. `GET /api/live` remains public. `run_worker_first=true` ensures the Worker verifies browser Access JWTs before serving SPA/assets, including the Connect UI.

Production requires these existing secrets: `BAT_READ_KEY`, `BAT_WRITE_KEY`, `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`. New secret names are `CONNECT_TOKEN_KEYS` and `CONNECT_MANAGERS`. Variables are `ENVIRONMENT=production` and `CONNECT_DEPLOYMENT_ID=bat-production`. Bindings are `DB`, optional `BAT_KV`, `ASSETS`, `CONNECT_COORDINATOR` and `CONNECT_EDGE_LIMITER`. The first DO class migration is `connect-v1`; D1 migration `0028_connect.sql` adds credential/grant/audit/retry tables, host tag ownership and configuration revision triggers.

D1 migration `0029_connect_token_servers.sql` converts legacy singleton rows to junction entries for active hosts and removes the host-to-key cascade. It rebuilds the token table together with both dependent tables so ciphertext, challenges, pending requests, completed responses and permanent tombstones survive byte for byte. Requests gain an independent target server. Compatibility triggers populate junction/target fields for old Worker inserts between migration and deployment. Deleting or retiring a host removes only its junction entries and invalidates affected key versions; recreating/reactivating that host does not restore grants. A shared key and its remaining servers, ciphertext and retry history survive deletion of its original host.

Deploy through the repository's Release workflow, which applies production D1 migrations **before** deploying Worker code. The `connect-access-audit` dispatch performs only metadata reads using the existing production environment token; it never deploys, changes policies or prints credentials. Keep the actual Access application/policy IDs, audience and predeployment Worker version in the release evidence.

No Access policy rollback is needed because Connect preserves the existing browser application and adds no Bypass. Cloudflare [does not allow a direct version rollback across a Durable Object class lifecycle migration](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/#bindings). Recover by deploying the previous product source through CI **with the `ConnectCoordinator` export, its bindings and the `connect-v1` migration retained**. A compatibility export can return `503` for any old coordinator calls while the original Worker entry serves the previous product. Restore the previous asset routing configuration as well as its UI build. Keep the additive D1 schema and DO namespace; do not drop tables while any deployment may still use them. Keep encryption key versions so an eventual forward deployment can recover existing credentials. Revoking a compromised token and removing its issuer's grant take effect without redeploying. Secret removal must follow withdrawal of Connect traffic and code.

Validation includes the complete manifest's response contracts, read/write and host ownership matrices, real D1/DO HTTP tests, browser privacy/keyboard/mobile flows, audit and encryption failures, concurrent ETags, idempotency and every credential lifecycle transition. L2 and L3 always use separate local Wrangler databases and generated mode-0600 test keyrings under `.wrangler`; they never overwrite `.dev.vars` or use production D1. Production smoke uses dedicated temporary hosts, credentials and product records, then revokes/deletes those fixtures. Management and browser smoke use a short-lived human session obtained through the standard `cloudflared access login --quiet` flow, scoped to the existing application and configured user. This operator session is kept in a mode-0600 file, sent only as an Access header or authorization cookie, and never supplied to Agents. The normal Agent API needs only its own Connect Bearer token; it has no interactive login or Access service-token requirement.
