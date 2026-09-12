import { BAT_VERSION, CONNECT_LIMITS } from "@bat/shared";
import type { Context, Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { base64url, ConnectFault, fingerprint, seal, unseal } from "../domain/connect.js";
import { connectOpenApi, validateConnectInput } from "../domain/connect-contract.js";
import {
	CONNECT_OPERATIONS,
	CONNECT_UNSUPPORTED,
	type ConnectOperation,
} from "../domain/connect-operations.js";
import {
	auditEntry,
	connectApiBaseUrl,
	connectBody,
	connectError,
	deploymentId,
	nowSeconds,
} from "../middleware/connect.js";
import type { ConnectRequest } from "../repos/connect.js";
import type { AppEnv } from "../types.js";
import {
	agentsCreateRoute,
	agentsDeleteRoute,
	agentsGetRoute,
	agentsListRoute,
	agentsTagsReplaceRoute,
	agentsUpdateRoute,
} from "./agents.js";
import { alertsListRoute } from "./alerts.js";
import {
	hostAllowedPortsAddRoute,
	hostAllowedPortsListRoute,
	hostAllowedPortsRemoveRoute,
} from "./allowed-ports.js";
import {
	assetsCreateRoute,
	assetsDeleteRoute,
	assetsGetRoute,
	assetsListRoute,
	assetsTagsReplaceRoute,
	assetsUpdateRoute,
} from "./assets.js";
import {
	assetsMapRoute,
	assetsOverviewRoute,
	bindingsCreateRoute,
	bindingsDeleteRoute,
	bindingsListRoute,
} from "./bindings.js";
import { validateEventPayload } from "./events-ingest.js";
import { parseTags } from "./events-list.js";
import { fleetStatusRoute } from "./fleet-status.js";
import { agentsHeartbeatRoute } from "./heartbeat.js";
import { hostDescriptionPatchRoute } from "./host-description.js";
import { hostDetailRoute } from "./host-detail.js";
import { hostsListRoute } from "./hosts.js";
import { identityRoute } from "./identity.js";
import { ingestRoute } from "./ingest.js";
import { maintenanceDeleteRoute, maintenanceGetRoute, maintenanceSetRoute } from "./maintenance.js";
import { hostMetricsRoute } from "./metrics.js";
import {
	monitoringAlertsRoute,
	monitoringGroupsRoute,
	monitoringHostDetailRoute,
} from "./monitoring.js";
import { settingsGetRoute } from "./settings.js";
import { setupRoute } from "./setup.js";
import {
	hostTagsAddRoute,
	hostTagsListRoute,
	hostTagsRemoveRoute,
	hostTagsReplaceRoute,
	tagsCreateRoute,
	tagsDeleteRoute,
	tagsListRoute,
	tagsUpdateRoute,
} from "./tags.js";
import { tier2IngestRoute } from "./tier2-ingest.js";
import { hostTier2Route } from "./tier2-read.js";
import {
	webhooksCreateRoute,
	webhooksDeleteRoute,
	webhooksListRoute,
	webhooksRegenerateRoute,
} from "./webhooks.js";

type ProductHandler = (c: Context<AppEnv>) => Response | Promise<Response>;

async function etag(c: Context<AppEnv>): Promise<string> {
	// Preserve the existing singleton discovery ETag. Multi-server callers read
	// the target server's ETag; a credential ETag cannot authorize a write.
	const server =
		c.var.connectServerId ??
		(c.var.connectServerIds?.length === 1 ? c.var.connectServerIds[0] : undefined);
	if (!server) return `"token:${c.var.connectToken?.id}:${c.var.connectToken?.version}"`;
	return `"${(await fingerprint(`${deploymentId(c)}:${server}`)).slice(0, 16)}:${await c.var.repos.connect.revision(server)}"`;
}

async function pageServer(c: Context<AppEnv>): Promise<string> {
	return (
		c.var.connectServerId ?? fingerprint(JSON.stringify([...(c.var.connectServerIds ?? [])].sort()))
	);
}

interface PageInput {
	limit: number;
	after: string;
	filter: string;
}
async function pageInput(c: Context<AppEnv>, operation: string): Promise<PageInput> {
	const rawLimit = c.req.query("limit") ?? String(CONNECT_LIMITS.pageDefault);
	if (
		!/^\d{1,3}$/.test(rawLimit) ||
		Number(rawLimit) < 1 ||
		Number(rawLimit) > CONNECT_LIMITS.pageMax
	)
		throw new ConnectFault(400, "invalid_pagination", "limit must be an integer from 1 to 100.");
	const url = new URL(c.req.url);
	url.searchParams.delete("cursor");
	url.searchParams.delete("limit");
	url.searchParams.sort();
	const filter = await fingerprint(url.search);
	const rawCursor = c.req.query("cursor");
	let after = "";
	if (rawCursor) {
		try {
			if (rawCursor.length > 2048) throw new Error();
			const cursor = JSON.parse(atob(rawCursor.replaceAll("-", "+").replaceAll("_", "/")));
			if (
				cursor.server !== (await pageServer(c)) ||
				cursor.operation !== operation ||
				cursor.filter !== filter ||
				typeof cursor.after !== "string" ||
				cursor.after.length > 512
			)
				throw new Error();
			after = cursor.after;
		} catch {
			throw new ConnectFault(
				400,
				"invalid_cursor",
				"Cursor does not belong to this server, operation, or query.",
			);
		}
	}
	return { limit: Number(rawLimit), after, filter };
}

async function cursor(
	c: Context<AppEnv>,
	operation: string,
	after: string,
	filter: string,
): Promise<string> {
	return base64url(
		new TextEncoder().encode(
			JSON.stringify({ server: await pageServer(c), operation, after, filter }),
		),
	);
}

function itemKey(item: unknown): string {
	if (!item || typeof item !== "object") return JSON.stringify(item);
	const row = item as Record<string, unknown>;
	if (typeof row.id === "number") return String(row.id).padStart(20, "0");
	if (typeof row.id === "string") return row.id;
	if (typeof row.port === "number") return String(row.port).padStart(5, "0");
	return JSON.stringify([row.agent_id, row.asset_id, row.host_id, row.rule_id, row.name, row.tag]);
}

async function page(c: Context<AppEnv>, operation: string, items: unknown[]) {
	const input = await pageInput(c, operation);
	const ordered = items
		.map((item) => ({ item, key: itemKey(item) }))
		.filter((row) => row.key > input.after)
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	const data = ordered.slice(0, input.limit);
	const last = data.at(-1);
	return {
		data: data.map((row) => row.item),
		page: {
			limit: input.limit,
			nextCursor:
				ordered.length > input.limit && last
					? await cursor(c, operation, last.key, input.filter)
					: null,
		},
		requestId: c.var.connectRequestId,
		...(c.var.connectServerId
			? { serverId: c.var.connectServerId }
			: {
					serverIds: c.var.connectServerIds,
					...(c.var.connectServerIds?.length === 1 ? { serverId: c.var.connectServerIds[0] } : {}),
				}),
	};
}

function capabilities(c: Context<AppEnv>) {
	const token = c.var.connectToken;
	return c.json({
		apiVersion: "v1",
		productVersion: BAT_VERSION,
		serverIds: c.var.connectServerIds,
		...(c.var.connectServerIds?.length === 1 ? { serverId: c.var.connectServerIds[0] } : {}),
		scope: token?.scope,
		permissions: token?.scope === "write" ? ["read", "write"] : ["read"],
		baseUrl: connectApiBaseUrl(c),
		openapi: "/api/v1/openapi.json",
		authorization:
			"A key can authorize multiple servers, and servers can have multiple keys. Every request checks the current selected servers, active hosts, issuer grants and target resource ownership. An empty set grants no server access. write includes read. Tokens cannot manage credentials or move resources across server paths.",
		operations: CONNECT_OPERATIONS.map((operation) => ({
			...operation,
			path: operation.path.replace(/:([A-Za-z]+)/g, "{$1}"),
			requiredScope: operation.method === "GET" ? "read" : "write",
			supported: !operation.unsupported,
			allowed: !operation.unsupported && (operation.method === "GET" || token?.scope === "write"),
		})),
		unsupported: CONNECT_UNSUPPORTED,
		limits: CONNECT_LIMITS,
		concurrency:
			"Send the server configuration ETag in If-Match for all mutations. Browser and CLI control changes invalidate it. Probe observations are independent.",
		idempotency:
			"Use one Idempotency-Key per intent. Persist it before sending; reuse for retries. Pending/expired outcomes return 409 and never run again. Inspect /requests/{key}.",
		requestId: c.var.connectRequestId,
	});
}

const productHandlers: Record<string, ProductHandler> = {
	"capabilities.get": capabilities,
	"contract.get": (c) => c.json(connectOpenApi()),
	"servers.list": async (c) => {
		const base = c.var.repos;
		const allowed = new Set(c.var.connectServerIds);
		c.set("repos", {
			...base,
			hosts: Object.assign(Object.create(base.hosts), {
				listOverviewRows: async () =>
					(await base.hosts.listOverviewRows()).filter((row) => allowed.has(row.host_id)),
			}),
		});
		return hostsListRoute(c);
	},
	"server.get": hostDetailRoute,
	"server.description.update": hostDescriptionPatchRoute,
	"metrics.list": async (c) => {
		const from = Number(c.req.query("from")),
			to = Number(c.req.query("to"));
		if (
			!c.req.query("from") ||
			!c.req.query("to") ||
			!Number.isSafeInteger(from) ||
			!Number.isSafeInteger(to) ||
			from < 0 ||
			from >= to ||
			to - from > 30 * 86400
		)
			throw new ConnectFault(
				400,
				"invalid_range",
				"from/to must be Unix seconds with a positive window of at most 30 days.",
			);
		return hostMetricsRoute(c);
	},
	"metrics.ingest": ingestRoute,
	"identity.update": identityRoute,
	"tier2.get": hostTier2Route,
	"tier2.ingest": tier2IngestRoute,
	"maintenance.get": maintenanceGetRoute,
	"maintenance.set": maintenanceSetRoute,
	"maintenance.delete": maintenanceDeleteRoute,
	"alerts.list": alertsListRoute,
	"events.list": async (c) => {
		const input = await pageInput(c, "events.list");
		if (input.after && !/^\d{20}$/.test(input.after))
			throw new ConnectFault(400, "invalid_cursor", "Invalid event cursor.");
		const rows = await c.var.repos.connectProducts.eventsPage(
			c.var.connectServerId ?? "",
			Number(input.after || 0),
			input.limit + 1,
		);
		return c.json(rows.map((row) => ({ ...row, tags: parseTags(row.tags) })));
	},
	"events.create": async (c) => {
		const result = validateEventPayload(await connectBody(c));
		if (!result.ok) throw new ConnectFault(400, "invalid_event", result.error);
		await c.var.repos.connectProducts.appendEvent(
			c.var.connectServerId ?? "",
			result.title,
			result.bodyStr,
			result.tags,
			nowSeconds(),
		);
		return c.body(null, 204);
	},
	"status.get": fleetStatusRoute,
	"monitoring.get": monitoringHostDetailRoute,
	"monitoring.groups": monitoringGroupsRoute,
	"monitoring.alerts": monitoringAlertsRoute,
	"tags.list": tagsListRoute,
	"tags.create": tagsCreateRoute,
	"tags.update": tagsUpdateRoute,
	"tags.delete": tagsDeleteRoute,
	"hostTags.list": hostTagsListRoute,
	"hostTags.add": hostTagsAddRoute,
	"hostTags.replace": hostTagsReplaceRoute,
	"hostTags.delete": hostTagsRemoveRoute,
	"ports.list": hostAllowedPortsListRoute,
	"ports.add": hostAllowedPortsAddRoute,
	"ports.delete": hostAllowedPortsRemoveRoute,
	"webhooks.list": webhooksListRoute,
	"webhooks.create": webhooksCreateRoute,
	"webhooks.rotate": webhooksRegenerateRoute,
	"webhooks.delete": webhooksDeleteRoute,
	"agents.list": agentsListRoute,
	"agents.create": agentsCreateRoute,
	"agents.heartbeat": agentsHeartbeatRoute,
	"agents.get": agentsGetRoute,
	"agents.update": agentsUpdateRoute,
	"agents.delete": agentsDeleteRoute,
	"agents.tags": agentsTagsReplaceRoute,
	"assets.map": assetsMapRoute,
	"assets.overview": assetsOverviewRoute,
	"assets.list": assetsListRoute,
	"assets.create": assetsCreateRoute,
	"assets.get": assetsGetRoute,
	"assets.update": assetsUpdateRoute,
	"assets.delete": assetsDeleteRoute,
	"assets.tags": assetsTagsReplaceRoute,
	"bindings.list": bindingsListRoute,
	"bindings.create": bindingsCreateRoute,
	"bindings.delete": bindingsDeleteRoute,
	"settings.get": settingsGetRoute,
	"setup.get": setupRoute,
	"audit.list": async (c) => {
		const input = await pageInput(c, "audit.list");
		let before = Number.MAX_SAFE_INTEGER,
			beforeId = "";
		if (input.after) {
			const split = input.after.indexOf(":");
			before = Number(input.after.slice(0, split));
			beforeId = input.after.slice(split + 1);
			if (split < 1 || !Number.isSafeInteger(before) || !beforeId)
				throw new ConnectFault(400, "invalid_cursor", "Invalid audit cursor.");
		}
		const rows = await c.var.repos.connect.audits(
			c.var.connectServerId ?? "",
			before,
			beforeId,
			input.limit + 1,
		);
		const data = rows.slice(0, input.limit),
			last = data.at(-1);
		return c.json({
			data,
			page: {
				limit: input.limit,
				nextCursor:
					rows.length > input.limit && last
						? await cursor(c, "audit.list", `${last.created_at}:${last.id}`, input.filter)
						: null,
			},
			requestId: c.var.connectRequestId,
			serverId: c.var.connectServerId,
		});
	},
	"requests.get": async (c) => {
		const row = await c.var.repos.connect.request(
			c.var.connectToken?.id ?? "",
			await fingerprint(c.req.param("key") ?? ""),
		);
		if (!row || !c.var.connectServerIds?.includes(row.server_id))
			throw new ConnectFault(
				404,
				"not_found",
				"Request not found within this token's current server authorization.",
			);
		c.set("connectServerId", row.server_id);
		return c.json({
			state: row.state,
			status: row.status,
			originalRequestId: row.request_id,
			responseAvailable: row.response !== null,
			createdAt: new Date(row.created_at * 1000).toISOString(),
		});
	},
};

async function invoke(c: Context<AppEnv>, operation: ConnectOperation): Promise<Response> {
	const handler = productHandlers[operation.id];
	if (!handler)
		throw new ConnectFault(
			501,
			"not_supported",
			operation.unsupported ?? "This operation is not supported.",
		);
	let response: Response;
	try {
		response = await handler(c);
	} catch (error) {
		response = connectError(c, error);
	}
	if (response.status === 204) return response;
	const text = await response.text();
	if (new TextEncoder().encode(text).length > CONNECT_LIMITS.responseBytes)
		throw new ConnectFault(
			413,
			"response_too_large",
			"Response exceeds 2 MiB; narrow the time range or query.",
		);
	const value = JSON.parse(text);
	if (response.status >= 400) {
		if (typeof value.error === "object" && value.error?.code) {
			c.set("connectErrorCode", value.error.code);
			return c.json(value, response.status as 400);
		}
		const code =
			response.status === 404
				? "not_found"
				: response.status === 409
					? "conflict"
					: "invalid_request";
		c.set("connectErrorCode", code);
		return c.json(
			{
				error: {
					code,
					message: String(value.error ?? "Request failed.").replace(
						/batc_[A-Za-z0-9_-]+/g,
						"[redacted]",
					),
					requestId: c.var.connectRequestId,
				},
			},
			response.status as 400,
		);
	}
	if (["capabilities.get", "contract.get", "audit.list"].includes(operation.id))
		return c.json(value);
	if (operation.list) {
		const items = Array.isArray(value)
			? value
			: (value.items ?? value.groups ?? value.alerts ?? []);
		return c.json(await page(c, operation.id, items), response.status as 200);
	}
	return c.json(
		{ data: value, requestId: c.var.connectRequestId, serverId: c.var.connectServerId },
		response.status as 200,
	);
}

async function runOperation(c: Context<AppEnv>, operation: ConnectOperation): Promise<Response> {
	c.set("connectOperation", operation.id);
	const token = c.var.connectToken;
	if (!token) throw new ConnectFault(401, "invalid_token", "A Connect token is required.");
	const serverId = c.req.param("serverId");
	if (serverId && !c.var.connectServerIds?.includes(serverId))
		throw new ConnectFault(403, "server_mismatch", "This token does not authorize this server.");
	for (const name of [
		"tagId",
		"port",
		...(/^(tags|webhooks)\./.test(operation.id) ? ["id"] : []),
	]) {
		const value = c.req.param(name);
		if (value !== undefined && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))))
			throw new ConnectFault(400, "invalid_id", "Resource IDs must be positive integers.");
	}
	if (operation.unsupported) throw new ConnectFault(501, "not_supported", operation.unsupported);
	if (operation.method === "GET") {
		c.header("ETag", await etag(c));
		return invoke(c, operation);
	}
	if (token.scope !== "write")
		throw new ConnectFault(403, "insufficient_scope", "A write token is required.");
	const key = c.req.header("Idempotency-Key") ?? "";
	if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
		throw new ConnectFault(
			428,
			"idempotency_required",
			"Provide an Idempotency-Key (8–128 letters, digits, underscores or hyphens).",
		);
	if (operation.dangerous && c.req.header("X-Bat-Confirm") !== serverId)
		throw new ConnectFault(
			428,
			"confirmation_required",
			"Acknowledge this action with X-Bat-Confirm equal to the canonical serverId.",
		);
	const body = await connectBody(c);
	if (operation.body) validateConnectInput(operation.body, body);
	const keyHash = await fingerprint(key);
	const digest = await fingerprint(
		JSON.stringify([operation.id, c.req.path, new URL(c.req.url).search, body]),
	);
	const context = JSON.stringify(["request", deploymentId(c), serverId, token.id, keyHash]);
	const prior = await c.var.repos.connect.request(token.id, keyHash);
	if (prior) {
		if (prior.fingerprint !== digest)
			throw new ConnectFault(
				409,
				"idempotency_conflict",
				"This key was already used for a different request.",
			);
		if (prior.state !== "complete" || !prior.response)
			throw new ConnectFault(
				409,
				"outcome_unknown",
				"The original outcome is pending or its response has expired. Inspect /requests/{key}; do not retry with a new key.",
			);
		const saved = await unseal(c.env.CONNECT_TOKEN_KEYS, context, prior.response);
		c.header("Idempotency-Replayed", "true");
		c.header("X-Original-Request-Id", prior.request_id);
		if (prior.etag) c.header("ETag", prior.etag);
		return c.newResponse(prior.status === 204 ? null : saved, {
			status: (prior.status ?? 200) as StatusCode,
			headers: new Headers({ "Content-Type": "application/json" }),
		});
	}
	const expected = c.req.header("If-Match");
	if (!expected)
		throw new ConnectFault(
			428,
			"precondition_required",
			"GET the server configuration ETag and send it in If-Match.",
		);
	if (expected !== (await etag(c)))
		throw new ConnectFault(
			412,
			"version_conflict",
			"Server configuration changed. Read it again before applying this intent.",
		);
	// Verify encryption before any product side effects or pending record.
	await seal(c.env.CONNECT_TOKEN_KEYS, context, "");
	const record: ConnectRequest = {
		token_id: token.id,
		server_id: serverId ?? "",
		key_hash: keyHash,
		fingerprint: digest,
		request_id: c.var.connectRequestId as string,
		state: "pending",
		status: null,
		response: null,
		etag: null,
		created_at: nowSeconds(),
	};
	if (!(await c.var.repos.connect.beginRequest(record)))
		throw new ConnectFault(
			409,
			"request_in_progress",
			"This request is already running. Retry with the same key.",
		);
	const response = await invoke(c, operation);
	record.status = response.status;
	record.etag = await etag(c);
	record.response = await seal(c.env.CONNECT_TOKEN_KEYS, context, await response.clone().text());
	record.state = "complete";
	await c.var.repos.connect.finishRequest(record, auditEntry(c, operation.id, response.status));
	c.set("connectAudited", true);
	response.headers.set("ETag", record.etag);
	return response;
}

async function timedOperation(c: Context<AppEnv>, operation: ConnectOperation): Promise<Response> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const work = runOperation(c, operation);
	const timeout = new Promise<Response>((resolve) => {
		timer = setTimeout(
			() =>
				resolve(
					connectError(
						c,
						new ConnectFault(
							504,
							"request_timeout",
							"Request timed out. A mutation may still complete; inspect its Idempotency-Key and never retry with a new key.",
						),
					),
				),
			CONNECT_LIMITS.requestTimeoutMs,
		);
	});
	// The coordinator holds serialization until this work settles, including after a 504.
	try {
		c.executionCtx.waitUntil(
			work.then(
				() => undefined,
				() => undefined,
			),
		);
	} catch {
		/* Unit-test contexts have no execution context. */
	}
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export function registerConnectApi(app: Hono<AppEnv>): void {
	for (const operation of CONNECT_OPERATIONS)
		app.on(operation.method, operation.path, (c) => timedOperation(c, operation));
	app.get("/api/v1", (c) => timedOperation(c, CONNECT_OPERATIONS[0] as ConnectOperation));
	app.all("/api/v1/*", (c) => {
		const path = c.req.path;
		const serverId = /\/servers\/([^/]+)/.exec(path)?.[1];
		if (serverId && !c.var.connectServerIds?.includes(decodeURIComponent(serverId)))
			throw new ConnectFault(403, "server_mismatch", "This token does not authorize this server.");
		if (
			/^\/api\/v1\/(?:tokens|cli-tokens)(?:\/|$)/.test(path) ||
			/\/execute$/.test(path) ||
			(c.req.method === "DELETE" && /^\/api\/v1\/servers\/[^/]+$/.test(path))
		)
			throw new ConnectFault(
				501,
				"not_supported",
				"This operation is not available to Connect tokens. See capabilities.unsupported.",
			);
		throw new ConnectFault(404, "not_found", "Unknown Connect API resource or method.");
	});
}
