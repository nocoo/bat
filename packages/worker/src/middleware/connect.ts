import { CONNECT_API_ORIGIN, CONNECT_LIMITS } from "@bat/shared";
import type { Context, Next } from "hono";
import {
	ConnectFault,
	configuredManager,
	fingerprint,
	isConnectPath,
	isVersionedPath,
} from "../domain/connect.js";
import { readBody } from "../lib/read-body.js";
import type { ConnectAudit } from "../repos/connect.js";
import type { AppEnv } from "../types.js";
import { isLocalhost } from "./entry-control.js";

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function connectApiBaseUrl(c: Context<AppEnv>): string {
	const origin =
		c.env.ENVIRONMENT === "production" ? CONNECT_API_ORIGIN : new URL(c.req.url).origin;
	return `${origin}/api/v1`;
}

export function auditEntry(
	c: Context<AppEnv>,
	operation: string,
	status: number,
	code: string | null = null,
): ConnectAudit {
	const redact = (value: string | null): string | null =>
		value?.replace(/batc_[A-Za-z0-9_-]+/g, "[redacted]") ?? null;
	return {
		id: crypto.randomUUID(),
		request_id: c.var.connectRequestId ?? crypto.randomUUID(),
		server_id: redact(c.var.connectToken?.server_id ?? c.req.param("serverId") ?? null),
		token_id: redact(c.var.connectToken?.id ?? c.req.param("tokenId") ?? null),
		actor: c.var.connectToken
			? `token:${c.var.connectToken.id}`
			: (c.var.accessPrincipal ?? "anonymous"),
		operation,
		status,
		code: code ?? c.var.connectErrorCode ?? null,
		created_at: nowSeconds(),
	};
}

export function connectError(c: Context<AppEnv>, error: unknown): Response {
	const fault =
		error instanceof ConnectFault
			? error
			: new ConnectFault(
					500,
					"internal_error",
					"The request could not be completed. Use the request ID when contacting the administrator.",
				);
	c.set("connectErrorCode", fault.code);
	if (fault.status === 401) c.header("WWW-Authenticate", 'Bearer realm="bat-connect"');
	if (fault.status === 429) c.header("Retry-After", "60");
	return c.json(
		{
			error: {
				code: fault.code,
				message: fault.message,
				requestId: c.var.connectRequestId ?? crypto.randomUUID(),
			},
		},
		fault.status,
	);
}

export function sensitiveHeaders(c: Context<AppEnv>): void {
	c.header("Cache-Control", "no-store, private, max-age=0");
	c.header("Pragma", "no-cache");
	c.header("Referrer-Policy", "no-referrer");
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Cross-Origin-Resource-Policy", "same-origin");
	c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
	c.header("X-Request-Id", c.var.connectRequestId ?? "");
}

export async function connectEnvelope(c: Context<AppEnv>, next: Next) {
	if (!isConnectPath(c.req.path)) return next();
	c.set("connectRequestId", crypto.randomUUID());
	c.set("connectStarted", Date.now());
	sensitiveHeaders(c);
	try {
		const limiter = c.env.CONNECT_EDGE_LIMITER;
		if (!limiter && c.env.ENVIRONMENT === "production")
			throw new ConnectFault(503, "rate_limit_unavailable", "Connect is temporarily unavailable.");
		if (
			limiter &&
			!(
				await limiter.limit({
					key: `connect:${await fingerprint(c.req.header("CF-Connecting-IP") ?? "local")}`,
				})
			).success
		)
			throw new ConnectFault(429, "rate_limited", "Too many requests. Retry after one minute.");
		const origin = c.req.header("Origin");
		if (
			c.req.method === "OPTIONS" ||
			(origin && origin !== new URL(c.req.url).origin) ||
			c.req.header("Sec-Fetch-Site") === "cross-site"
		)
			throw new ConnectFault(
				403,
				"cross_origin_denied",
				"Connect does not allow cross-origin browser requests.",
			);
		if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(c.req.method))
			throw new ConnectFault(400, "method_not_supported", "Unsupported HTTP method.");
		await next();
	} catch (error) {
		c.res = connectError(c, error);
	}
	// Legacy product validators are reused, but every Connect error has one schema.
	if (c.res.status >= 400) {
		const body = (await c.res
			.clone()
			.json()
			.catch(() => null)) as { error?: unknown } | null;
		if (!body || typeof body.error === "string") {
			const message =
				typeof body?.error === "string"
					? body.error.replace(/batc_[A-Za-z0-9_-]+/g, "[redacted]")
					: "The requested resource is unavailable.";
			const code = c.res.status === 404 ? "not_found" : "invalid_request";
			c.set("connectErrorCode", code);
			c.res = c.json(
				{
					error: {
						code,
						message,
						requestId: c.var.connectRequestId,
					},
				},
				c.res.status as 400,
			);
		}
	}
	if (!c.var.connectAudited) {
		try {
			await c.var.repos.connect.audit(
				auditEntry(
					c,
					c.var.connectOperation ??
						(isVersionedPath(c.req.path) ? "api.request" : "management.request"),
					c.res.status,
				),
			);
		} catch {
			c.res = connectError(
				c,
				new ConnectFault(
					503,
					"audit_unavailable",
					"The audit record could not be saved. The request outcome may be unknown; do not retry a mutation with a new key.",
				),
			);
		}
	}
	sensitiveHeaders(c);
}

export async function connectBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
	if (c.var.connectBody) return c.var.connectBody;
	if (c.req.raw.body && !/^application\/json(?:;|$)/i.test(c.req.header("Content-Type") ?? ""))
		throw new ConnectFault(415, "unsupported_media_type", "Use Content-Type: application/json.");
	const bytes = await readBody(c.req.raw);
	let raw: string;
	try {
		raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes ?? new ArrayBuffer(0));
	} catch {
		throw new ConnectFault(400, "invalid_json", "Request body must be valid UTF-8 JSON.");
	}
	let body: unknown;
	try {
		body = raw.trim() ? JSON.parse(raw) : {};
	} catch {
		throw new ConnectFault(400, "invalid_json", "Request body must be valid JSON.");
	}
	if (!body || typeof body !== "object" || Array.isArray(body))
		throw new ConnectFault(400, "invalid_json", "Request body must be a JSON object.");
	c.req.bodyCache.json = Promise.resolve(body);
	c.set("connectBody", body as Record<string, unknown>);
	return body as Record<string, unknown>;
}

export function deploymentId(c: Context<AppEnv>): string {
	if (!c.env.CONNECT_DEPLOYMENT_ID)
		throw new ConnectFault(
			503,
			"deployment_unconfigured",
			"Connect deployment identity is not configured.",
		);
	return c.env.CONNECT_DEPLOYMENT_ID;
}

export function isDevelopmentManager(c: Context<AppEnv>): boolean {
	return c.env.ENVIRONMENT === "development" && isLocalhost(new URL(c.req.url).hostname);
}

export async function connectManager(c: Context<AppEnv>, next: Next) {
	const local = isDevelopmentManager(c);
	if (local) c.set("accessPrincipal", "local:developer");
	if (
		!local &&
		(!c.var.accessAuthenticated ||
			!c.var.accessPrincipal ||
			new URL(c.req.url).hostname !== "bat.hexly.ai")
	)
		throw new ConnectFault(
			403,
			"management_auth_required",
			"Token management requires an authorized Access session on the browser hostname.",
		);
	if (!["GET", "HEAD"].includes(c.req.method)) {
		if (
			c.req.header("Origin") !== new URL(c.req.url).origin ||
			c.req.header("X-Bat-Management") !== "1"
		)
			throw new ConnectFault(
				403,
				"csrf_denied",
				"A same-origin management confirmation is required.",
			);
		await connectBody(c);
	}
	const principal = c.var.accessPrincipal as string;
	const serverId = c.req.param("serverId");
	if (
		serverId &&
		!(await c.var.repos.connect.authorized(
			serverId,
			principal,
			local || configuredManager(c.env.CONNECT_MANAGERS, principal),
		))
	)
		throw new ConnectFault(403, "server_forbidden", "You cannot manage this server.");
	if (
		!(await c.var.repos.connect.rate(`manager:${await fingerprint(principal)}`, 60, nowSeconds()))
	)
		throw new ConnectFault(
			429,
			"rate_limited",
			"Too many management requests. Retry after one minute.",
		);
	return next();
}

export async function connectBearer(c: Context<AppEnv>, next: Next) {
	const header = c.req.header("Authorization") ?? "";
	const token = /^Bearer (batc_[A-Za-z0-9_-]{43})$/i.exec(header)?.[1];
	if (!token)
		throw new ConnectFault(401, "invalid_token", "A valid Connect Bearer token is required.");
	const row = await c.var.repos.connect.findToken(await fingerprint(`${deploymentId(c)}:${token}`));
	const now = nowSeconds();
	if (!row || row.revoked_at !== null || (row.expires_at !== null && row.expires_at <= now))
		throw new ConnectFault(401, "invalid_token", "The token is invalid, revoked, or expired.");
	c.set("connectToken", row);
	const globalManager =
		configuredManager(c.env.CONNECT_MANAGERS, row.owner) ||
		(isDevelopmentManager(c) && row.owner === "local:developer");
	if (!(await c.var.repos.connect.authorized(row.server_id, row.owner, globalManager)))
		throw new ConnectFault(
			403,
			"authorization_revoked",
			"The token's server authorization is no longer active.",
		);
	const requestedServer = c.req.param("serverId");
	if (requestedServer && requestedServer !== row.server_id)
		throw new ConnectFault(
			403,
			"server_mismatch",
			"This token is bound to a different server. Use its canonical server ID.",
		);
	const writing = !["GET", "HEAD"].includes(c.req.method);
	if (writing && row.scope !== "write")
		throw new ConnectFault(
			403,
			"insufficient_scope",
			"A write token is required for this operation.",
		);
	if (
		!(await c.var.repos.connect.rate(
			`token:${row.id}:${writing ? "write" : "read"}`,
			writing ? CONNECT_LIMITS.writePerMinute : CONNECT_LIMITS.readPerMinute,
			now,
		))
	)
		throw new ConnectFault(
			429,
			"rate_limited",
			"Token rate limit exceeded. Retry after one minute.",
		);
	await c.var.repos.connect.touchToken(row.id, now);
	if (writing) {
		const body = await connectBody(c);
		if (Object.hasOwn(body, "host_id") && body.host_id !== row.server_id)
			throw new ConnectFault(403, "server_mismatch", "host_id must match the token's server.");
	}
	for (const key of ["host_id", "server_id", "serverId"]) {
		if (c.req.query(key) !== undefined && c.req.query(key) !== row.server_id)
			throw new ConnectFault(403, "server_mismatch", "Query filters cannot select another server.");
	}
	c.set("repos", c.var.repos.connectProducts.forServer(c.var.repos, row.server_id));
	return next();
}
