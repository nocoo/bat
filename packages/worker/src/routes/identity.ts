import type { IdentityPayload } from "@bat/shared";
// POST /api/identity — upsert host identity
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/** Lightweight validation — checks required fields exist and are correct types */
function validateIdentityPayload(body: unknown): body is IdentityPayload {
	if (!body || typeof body !== "object") return false;
	const b = body as Record<string, unknown>;
	return (
		typeof b.host_id === "string" &&
		b.host_id.length > 0 &&
		typeof b.hostname === "string" &&
		b.hostname.length > 0 &&
		typeof b.os === "string" &&
		typeof b.kernel === "string" &&
		typeof b.arch === "string" &&
		typeof b.cpu_model === "string" &&
		typeof b.uptime_seconds === "number" &&
		typeof b.boot_time === "number"
	);
}

export async function identityRoute(c: Context<AppEnv>) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!validateIdentityPayload(body)) {
		return c.json({ error: "Invalid identity payload" }, 400);
	}

	const db = c.env.DB;

	// Check if host is retired
	const existing = await db
		.prepare("SELECT is_active FROM hosts WHERE host_id = ?")
		.bind(body.host_id)
		.first<{ is_active: number }>();

	if (existing && existing.is_active === 0) {
		return c.json({ error: "host is retired" }, 403);
	}

	// Worker time, not Probe time
	const now = Math.floor(Date.now() / 1000);

	await db
		.prepare(
			`INSERT INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id) DO UPDATE SET
  hostname = excluded.hostname,
  os = excluded.os,
  kernel = excluded.kernel,
  arch = excluded.arch,
  cpu_model = excluded.cpu_model,
  boot_time = excluded.boot_time,
  last_seen = excluded.last_seen,
  identity_updated_at = excluded.identity_updated_at`,
		)
		.bind(
			body.host_id,
			body.hostname,
			body.os,
			body.kernel,
			body.arch,
			body.cpu_model,
			body.boot_time,
			now,
			now,
		)
		.run();

	return c.body(null, 204);
}
