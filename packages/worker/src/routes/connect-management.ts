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
	validateTokenInput,
} from "../domain/connect.js";
import {
	auditEntry,
	connectApiBaseUrl,
	connectBody,
	deploymentId,
	isDevelopmentManager,
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
			isDevelopmentManager(c) || configuredManager(c.env.CONNECT_MANAGERS, principal),
		))
	)
		throw new ConnectFault(403, "server_forbidden", "You cannot manage this server.");
	return id;
}

async function token(c: Context<AppEnv>): Promise<ConnectTokenRow> {
	const row = await c.var.repos.connect.token(c.req.param("tokenId") ?? "", await server(c));
	if (!row) throw new ConnectFault(404, "not_found", "Token not found on this server.");
	return row;
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
		isDevelopmentManager(c) || configuredManager(c.env.CONNECT_MANAGERS, principal),
	);
	return c.json({
		data,
		apiBaseUrl: connectApiBaseUrl(c),
		requestId: c.var.connectRequestId,
	});
}

export async function connectTokensListRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.list");
	return c.json({
		data: (await c.var.repos.connect.tokens(await server(c))).map(tokenMetadata),
		requestId: c.var.connectRequestId,
	});
}

export async function connectTokensCreateRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.create");
	const serverId = await server(c);
	const now = nowSeconds();
	const input = validateTokenInput(await connectBody(c), now);
	const row: ConnectTokenRow = {
		id: crypto.randomUUID(),
		server_id: serverId,
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
	const audit = auditEntry(c, "management.tokens.create", 201);
	audit.token_id = row.id;
	if (!(await c.var.repos.connect.createToken(row, audit)))
		throw new ConnectFault(
			422,
			"token_limit",
			"Revoke an existing token before creating another (50 active tokens per server).",
		);
	c.set("connectAudited", true);
	c.header("ETag", `"${row.id}:1"`);
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId }, 201);
}

export async function connectTokenRenameRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.tokens.rename");
	const row = await token(c);
	expectVersion(c, row);
	const body = await connectBody(c);
	if (Object.keys(body).some((key) => key !== "name"))
		throw new ConnectFault(
			400,
			"invalid_field",
			"Only name can be changed; create a new token to change scope or expiry.",
		);
	row.name = validateTokenInput({ name: body.name, scope: row.scope }, nowSeconds()).name;
	if (
		!(await c.var.repos.connect.changeToken(
			row,
			row.version,
			auditEntry(c, "management.tokens.rename", 200),
		))
	)
		throw new ConnectFault(412, "version_conflict", "The token changed. Refresh the list.");
	c.set("connectAudited", true);
	row.version++;
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
		await c.var.repos.connect.audit(auditEntry(c, "management.tokens.reveal", 200));
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
			auditEntry(c, `management.tokens.${action}`, 200),
		))
	)
		throw new ConnectFault(412, "version_conflict", "The token changed. Refresh the list.");
	c.set("connectAudited", true);
	row.version++;
	return c.json({ data: tokenMetadata(row), requestId: c.var.connectRequestId });
}

export const connectTokenRevealRoute = (c: Context<AppEnv>) => sensitiveAction(c, "reveal");
export const connectTokenRotateRoute = (c: Context<AppEnv>) => sensitiveAction(c, "rotate");
export const connectTokenRevokeRoute = (c: Context<AppEnv>) => sensitiveAction(c, "revoke");

export async function connectAuditRoute(c: Context<AppEnv>) {
	c.set("connectOperation", "management.audit.list");
	const data = await c.var.repos.connect.audits(await server(c), Number.MAX_SAFE_INTEGER, "", 100);
	return c.json({ data, requestId: c.var.connectRequestId });
}
