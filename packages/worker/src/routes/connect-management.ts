import { CONNECT_LIMITS, type ConnectSensitiveAction } from "@bat/shared";
import type { Context } from "hono";
import {
	ConnectFault,
	type ConnectTokenRow,
	configuredManager,
	fingerprint,
	randomSecret,
	seal,
	tokenContext,
	tokenMetadata,
	unseal,
	validateServerIds,
	validateTokenInput,
	validateWorkstationIds,
} from "../domain/connect.js";
import { connectManagementOpenApi } from "../domain/connect-contract.js";
import {
	auditEntry,
	connectApiBaseUrl,
	connectBody,
	deploymentId,
	nowSeconds,
} from "../middleware/connect.js";
import type { AppEnv } from "../types.js";

async function server(c: Context<AppEnv>): Promise<string> {
	const id = c.req.param("serverId") ?? "";
	const principal = c.var.accessPrincipal ?? "";
	if (
		!(await c.var.repos.connect.authorized(
			id,
			principal,
			configuredManager(c.env.CONNECT_MANAGERS, principal),
		))
	)
		throw new ConnectFault(403, "server_forbidden", "You cannot manage this server.");
	return id;
}

async function token(c: Context<AppEnv>): Promise<ConnectTokenRow> {
	if (c.req.param("serverId")) await server(c);
	const row = await c.var.repos.connect.token(
		c.req.param("tokenId") ?? "",
		c.req.param("serverId"),
	);
	if (!row) throw new ConnectFault(404, "not_found", "Token not found.");
	const authority = await managementAuthority(c);
	if (!canManage(row, authority))
		throw new ConnectFault(
			403,
			"token_forbidden",
			"Managing a key requires authority over its entire server set.",
		);
	return row;
}

async function managementAuthority(c: Context<AppEnv>) {
	const principal = c.var.accessPrincipal ?? "";
	const global = configuredManager(c.env.CONNECT_MANAGERS, principal);
	const ids = new Set((await c.var.repos.connect.servers(principal, global)).map((row) => row.id));
	// Ownership or configured global manager, never a tenant-wide read for a
	// regular principal. Recomputed per request so revocation is immediate.
	// Managing an existing credential also covers disabled workstations: a key
	// must stay revocable after one of its targets is disabled. New grants use
	// the active set below.
	const workstationIds = new Set(
		(await c.var.repos.workstations.listManageableFor(principal, global)).map((row) => row.id),
	);
	const activeWorkstationIds = new Set(
		(await c.var.repos.workstations.listAuthorizedFor(principal, global)).map((row) => row.id),
	);
	return { principal, global, ids, workstationIds, activeWorkstationIds };
}

/** A manager must cover the entire configured server and workstation set. */
function canManage(
	row: ConnectTokenRow,
	authority: Awaited<ReturnType<typeof managementAuthority>>,
): boolean {
	const configured = row.server_ids.length > 0 || row.workstation_ids.length > 0;
	if (!configured) return row.owner === authority.principal;
	return (
		row.server_ids.every((id) => authority.ids.has(id)) &&
		row.workstation_ids.every((id) => authority.workstationIds.has(id))
	);
}

/**
 * Existing grants may keep a now-disabled workstation; only *new* grants must
 * resolve to an active workstation the actor can authorize.
 */
async function selectedWorkstations(
	c: Context<AppEnv>,
	value: unknown,
	existing: readonly string[] = [],
): Promise<string[]> {
	const ids = validateWorkstationIds(value);
	const authority = await managementAuthority(c);
	for (const id of ids) {
		const allowed = existing.includes(id)
			? authority.workstationIds.has(id)
			: authority.activeWorkstationIds.has(id);
		if (!allowed)
			throw new ConnectFault(
				403,
				"workstation_forbidden",
				existing.includes(id)
					? "A retained workstation must still be owned by you or managed globally."
					: "Every newly added workstation must exist, be active, and be owned by you or managed globally.",
			);
	}
	return ids;
}

async function selectedServers(c: Context<AppEnv>, value: unknown): Promise<string[]> {
	const ids = validateServerIds(value);
	const authority = await managementAuthority(c);
	if (ids.some((id) => !authority.ids.has(id)))
		throw new ConnectFault(
			403,
			"server_forbidden",
			"Every selected server must exist, be active, and be authorized for you.",
		);
	return ids;
}

function tokenAudit(
	c: Context<AppEnv>,
	row: ConnectTokenRow,
	operation: string,
	status: number,
	previous: string[] | null = null,
) {
	return {
		...auditEntry(c, operation, status),
		server_id: null,
		token_id: row.id,
		server_ids: [...row.server_ids],
		previous_server_ids: previous,
	};
}

function expectVersion(c: Context<AppEnv>, row: ConnectTokenRow): void {
	const expected = c.req.header("If-Match");
	if (!expected)
		throw new ConnectFault(428, "precondition_required", "Provide the token version in If-Match.");
	if (expected !== `"${row.id}:${row.version}"`)
		throw new ConnectFault(
			412,
			"version_conflict",
			"The token changed. Refresh the list and confirm again.",
		);
	if (row.revoked_at !== null)
		throw new ConnectFault(409, "token_revoked", "The token has been revoked.");
}

async function replaceSecret(c: Context<AppEnv>, row: ConnectTokenRow): Promise<void> {
	const plaintext = `batc_${randomSecret()}`;
	row.token_hash = await fingerprint(`${deploymentId(c)}:${plaintext}`);
	row.ciphertext = await seal(
		c.env.CONNECT_TOKEN_KEYS,
		tokenContext(deploymentId(c), row),
		plaintext,
	);
	row.prefix = `${plaintext.slice(0, 12)}…`;
	row.last_used_at = null;
}

export async function connectServersRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.servers.list");
	const principal = c.var.accessPrincipal ?? "";
	const data = await c.var.repos.connect.servers(
		principal,
		configuredManager(c.env.CONNECT_MANAGERS, principal),
	);
	return c.json({
		data,
		apiBaseUrl: connectApiBaseUrl(c),
		requestId: c.var.connectRequestId,
	});
}

export async function connectTokensListRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.list");
	if (c.req.param("serverId")) await server(c);
	const authority = await managementAuthority(c);
	return c.json({
		data: (await c.var.repos.connect.tokens(c.req.param("serverId")))
			.filter((row) => canManage(row, authority))
			.map(tokenMetadata),
		requestId: c.var.connectRequestId,
	});
}

export async function connectTokensCreateRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.create");
	const body = await connectBody(c);
	if (
		Object.keys(body).some(
			(key) => !["name", "scope", "expiresAt", "serverIds", "workstationIds"].includes(key),
		)
	)
		throw new ConnectFault(
			400,
			"invalid_field",
			"Use name, scope, expiresAt, serverIds and workstationIds.",
		);
	const authority = await managementAuthority(c);
	if (!authority.global && !authority.ids.size && !authority.workstationIds.size)
		throw new ConnectFault(
			403,
			"server_forbidden",
			"A server or workstation grant is required to create keys.",
		);
	const legacyServer = c.req.param("serverId");
	if (legacyServer && Object.hasOwn(body, "workstationIds"))
		throw new ConnectFault(
			400,
			"invalid_field",
			"Use /api/connect/tokens to grant workstations; the legacy server path is server-only.",
		);
	const serverIds = await selectedServers(
		c,
		Object.hasOwn(body, "serverIds") ? body.serverIds : legacyServer ? [legacyServer] : undefined,
	);
	const workstationIds = Object.hasOwn(body, "workstationIds")
		? await selectedWorkstations(c, body.workstationIds)
		: [];
	if (legacyServer && !serverIds.includes(legacyServer))
		throw new ConnectFault(
			400,
			"invalid_servers",
			"The legacy server path must be included in serverIds.",
		);
	const now = nowSeconds();
	const input = validateTokenInput(body, now);
	const row: ConnectTokenRow = {
		id: crypto.randomUUID(),
		server_id: "",
		server_ids: serverIds,
		workstation_ids: workstationIds,
		name: input.name,
		scope: input.scope,
		prefix: "",
		token_hash: "",
		ciphertext: "",
		owner: c.var.accessPrincipal as string,
		created_at: now,
		last_used_at: null,
		expires_at: input.expiresAt,
		revoked_at: null,
		version: 1,
	};
	await replaceSecret(c, row);
	const audit = tokenAudit(c, row, "management.tokens.create", 201);
	if (!(await c.var.repos.connect.createToken(row, audit)))
		throw new ConnectFault(
			422,
			"token_limit",
			"Revoke an existing token before creating another (50 active tokens per server, 200 per issuer).",
		);
	c.set("connectAudited", true);
	c.header("ETag", `"${row.id}:1"`);
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId }, 201);
}

export async function connectTokenRenameRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.update");
	const row = await token(c);
	expectVersion(c, row);
	const body = await connectBody(c);
	const allowed = c.req.param("serverId")
		? ["name", "serverIds"]
		: ["name", "serverIds", "workstationIds", "scope", "expiresAt"];
	if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.includes(key)))
		throw new ConnectFault(
			400,
			"invalid_field",
			"Use name, serverIds, workstationIds, scope or expiresAt; scope and expiry changes require the canonical /api/connect/tokens endpoint.",
		);
	const previous = [...row.server_ids];
	const previousWorkstations = [...row.workstation_ids];
	if (Object.hasOwn(body, "serverIds")) row.server_ids = await selectedServers(c, body.serverIds);
	if (Object.hasOwn(body, "workstationIds"))
		row.workstation_ids = await selectedWorkstations(c, body.workstationIds, previousWorkstations);
	// A co-manager must not grant servers outside the issuer's current authority.
	const issuerGlobal = configuredManager(c.env.CONNECT_MANAGERS, row.owner);
	const issuerServers = new Set(
		(await c.var.repos.connect.servers(row.owner, issuerGlobal)).map((entry) => entry.id),
	);
	if (row.server_ids.some((id) => !previous.includes(id) && !issuerServers.has(id)))
		throw new ConnectFault(
			403,
			"server_forbidden",
			"The key issuer must also be authorized for every added server.",
		);
	const issuerWorkstations = new Set(
		(await c.var.repos.workstations.listAuthorizedFor(row.owner, issuerGlobal)).map(
			(entry) => entry.id,
		),
	);
	if (
		row.workstation_ids.some(
			(id) => !previousWorkstations.includes(id) && !issuerWorkstations.has(id),
		)
	)
		throw new ConnectFault(
			403,
			"workstation_forbidden",
			"The key issuer must also be authorized for every added workstation.",
		);
	const input = validateTokenInput(
		{
			name: Object.hasOwn(body, "name") ? body.name : row.name,
			scope: Object.hasOwn(body, "scope") ? body.scope : row.scope,
			expiresAt: body.expiresAt,
		},
		nowSeconds(),
	);
	const expiry = Object.hasOwn(body, "expiresAt") ? input.expiresAt : row.expires_at;
	if (input.scope !== row.scope || expiry !== row.expires_at) {
		const plaintext = await unseal(
			c.env.CONNECT_TOKEN_KEYS,
			tokenContext(deploymentId(c), row),
			row.ciphertext,
		);
		row.scope = input.scope;
		row.expires_at = expiry;
		row.ciphertext = await seal(
			c.env.CONNECT_TOKEN_KEYS,
			tokenContext(deploymentId(c), row),
			plaintext,
		);
	}
	row.name = input.name;
	if (
		!(await c.var.repos.connect.changeToken(
			row,
			row.version,
			tokenAudit(c, row, "management.tokens.update", 200, previous),
		))
	)
		throw new ConnectFault(412, "version_conflict", "The token changed. Refresh the list.");
	c.set("connectAudited", true);
	row.version++;
	c.header("ETag", `"${row.id}:${row.version}"`);
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId });
}

function actionValue(value: unknown): ConnectSensitiveAction {
	if (value !== "reveal" && value !== "rotate" && value !== "revoke")
		throw new ConnectFault(400, "invalid_action", "Choose reveal, rotate, or revoke.");
	return value;
}

export async function connectTokenChallengeRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.confirmation");
	const row = await token(c);
	expectVersion(c, row);
	const action = actionValue((await connectBody(c)).action);
	const challenge = randomSecret();
	const expiresAt = nowSeconds() + CONNECT_LIMITS.confirmationSeconds;
	await c.var.repos.connect.confirm(
		await fingerprint(challenge),
		row,
		c.var.accessPrincipal as string,
		action,
		expiresAt,
	);
	await c.var.repos.connect.audit(tokenAudit(c, row, "management.tokens.confirmation", 200));
	c.set("connectAudited", true);
	return c.json({
		challenge,
		expiresAt: new Date(expiresAt * 1000).toISOString(),
		requestId: c.var.connectRequestId,
	});
}

async function sensitiveAction(c: Context<AppEnv>, action: ConnectSensitiveAction) {
	c.set("connectOperation", `management.tokens.${action}`);
	const row = await token(c);
	expectVersion(c, row);
	const body = await connectBody(c);
	if (
		body.confirmation !== row.name ||
		typeof body.challenge !== "string" ||
		!/^[A-Za-z0-9_-]{43}$/.test(body.challenge)
	)
		throw new ConnectFault(
			403,
			"confirmation_required",
			"Type the token name and confirm this action.",
		);
	if (
		!(await c.var.repos.connect.consumeConfirmation(
			await fingerprint(body.challenge),
			row,
			c.var.accessPrincipal as string,
			action,
			nowSeconds(),
		))
	)
		throw new ConnectFault(
			403,
			"confirmation_expired",
			"Confirmation expired or was already used. Confirm again.",
		);
	if (action === "reveal") {
		const plaintext = await unseal(
			c.env.CONNECT_TOKEN_KEYS,
			tokenContext(deploymentId(c), row),
			row.ciphertext,
		);
		await c.var.repos.connect.audit(tokenAudit(c, row, "management.tokens.reveal", 200));
		c.set("connectAudited", true);
		return c.json({ token: plaintext, hideAfterSeconds: 30, requestId: c.var.connectRequestId });
	}
	if (action === "rotate") await replaceSecret(c, row);
	else {
		row.revoked_at = nowSeconds();
		row.ciphertext = "";
	}
	if (
		!(await c.var.repos.connect.changeToken(
			row,
			row.version,
			tokenAudit(c, row, `management.tokens.${action}`, 200, row.server_ids),
		))
	)
		throw new ConnectFault(412, "version_conflict", "The token changed. Refresh the list.");
	c.set("connectAudited", true);
	row.version++;
	c.header("ETag", `"${row.id}:${row.version}"`);
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId });
}

export const connectTokenRevealRoute = (c: Context<AppEnv>) => sensitiveAction(c, "reveal");
export const connectTokenRotateRoute = (c: Context<AppEnv>) => sensitiveAction(c, "rotate");
export const connectTokenRevokeRoute = (c: Context<AppEnv>) => sensitiveAction(c, "revoke");

export async function connectTokenGetRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.get");
	const row = await token(c);
	c.header("ETag", `"${row.id}:${row.version}"`);
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId });
}

export async function connectTokenAuditRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.audit");
	const row = await token(c);
	const authority = await managementAuthority(c);
	const history = await c.var.repos.connect.tokenAudits(row.id);
	const data = authority.global
		? history
		: history
				.filter((entry) => !entry.server_id || authority.ids.has(entry.server_id))
				.map((entry) => ({
					...entry,
					server_ids: entry.server_ids?.filter((id) => authority.ids.has(id)) ?? [],
					previous_server_ids:
						entry.previous_server_ids?.filter((id) => authority.ids.has(id)) ?? null,
				}));
	return c.json({ data, requestId: c.var.connectRequestId });
}

export function connectManagementOpenApiRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.contract.get");
	return c.json(connectManagementOpenApi());
}

export async function connectAuditRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.audit.list");
	const data = await c.var.repos.connect.audits(await server(c), Number.MAX_SAFE_INTEGER, "", 100);
	return c.json({ data, requestId: c.var.connectRequestId });
}
