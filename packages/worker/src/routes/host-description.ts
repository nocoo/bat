import type { Context } from "hono";
import { resolveHostRecord } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

export async function hostDescriptionPatchRoute(
	c: Context<AppEnv, "/api/hosts/:id/description">,
) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(db, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	const body = await c.req.json<{ description?: unknown }>().catch(() => null);
	if (!body || !("description" in body)) {
		return c.json({ error: "description field is required" }, 400);
	}

	const { description } = body;
	if (description !== null && typeof description !== "string") {
		return c.json({ error: "description must be a string or null" }, 400);
	}
	if (typeof description === "string" && description.length > 200) {
		return c.json({ error: "description must be 200 characters or fewer" }, 400);
	}

	await db
		.prepare("UPDATE hosts SET description = ? WHERE host_id = ?")
		.bind(description, host.host_id)
		.run();

	return c.body(null, 204);
}
