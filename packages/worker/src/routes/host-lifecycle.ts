import type { Context } from "hono";
import { invalidateHostMeta } from "../lib/host-meta-cache.js";
import { resolveHostRecord } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

function isBrowserConfirmation(c: Context<AppEnv>): boolean {
	return (
		c.var.accessAuthenticated === true &&
		!c.var.connectToken &&
		c.req.header("Origin") === new URL(c.req.url).origin &&
		c.req.header("X-Bat-Management") === "1"
	);
}

export async function hostDeleteRoute(c: Context<AppEnv, "/api/hosts/:id">) {
	if (!isBrowserConfirmation(c))
		return c.json({ error: "A same-origin browser confirmation is required" }, 403);
	const host = await resolveHostRecord(c.var.repos.hosts, c.req.param("id"));
	if (!host) return c.json({ error: "Host not found" }, 404);
	const body = await c.req.json<{ confirm_host_id?: unknown }>().catch(() => null);
	if (body?.confirm_host_id !== host.host_id)
		return c.json({ error: "Type the exact host ID to confirm deletion" }, 400);
	await c.var.repos.hosts.deleteHost(host.host_id, Math.floor(Date.now() / 1000));
	await invalidateHostMeta(c.env.BAT_KV, host.host_id);
	return c.json({ ok: true });
}

export async function hostRegisterRoute(c: Context<AppEnv, "/api/hosts/:id/register">) {
	if (!isBrowserConfirmation(c))
		return c.json({ error: "A same-origin browser confirmation is required" }, 403);
	const hostId = c.req.param("id");
	const body = await c.req.json<{ confirm_host_id?: unknown }>().catch(() => null);
	if (body?.confirm_host_id !== hostId)
		return c.json({ error: "Type the exact host ID to confirm registration" }, 400);
	if (!(await c.var.repos.hosts.registerHost(hostId)))
		return c.json({ error: "Deleted host not found" }, 404);
	await invalidateHostMeta(c.env.BAT_KV, hostId);
	return c.json({ ok: true });
}
