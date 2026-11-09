// PATCH /api/hosts/:id/billing — record the manual billing inputs of a host.
//
// The three inputs (amount paid, last payment date, next payment / expiry
// date) are all-or-nothing and the write path enforces that: either every
// one of them carries a value or every one of them is null. The period
// length, the daily cost and the countdown are derived from them, so nothing
// else is stored.
import { validateBillingInput } from "@bat/shared";
import type { Context } from "hono";
import { resolveHostRecord } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

export async function hostBillingPatchRoute(c: Context<AppEnv, "/api/hosts/:id/billing">) {
	const idParam = c.var.connectServerId ?? c.req.param("id");
	const repos = c.var.repos;

	const host = await resolveHostRecord(repos.hosts, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	const body = await c.req.json().catch(() => null);
	const parsed = validateBillingInput(body);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}

	await repos.hosts.updateBilling(host.host_id, parsed.value);

	return c.body(null, 204);
}
