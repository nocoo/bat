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
		typeof b.boot_time === "number" &&
		// probe_version is optional for backward compatibility
		(b.probe_version === undefined || typeof b.probe_version === "string")
	);
}

/**
 * Build a conditional UPDATE that only sets inventory fields actually present
 * in the payload (2-state wire semantics: present = update, absent = no-op).
 */
function buildInventoryUpdate(body: Record<string, unknown>): {
	clauses: string[];
	values: unknown[];
} {
	const clauses: string[] = [];
	const values: unknown[] = [];

	if ("cpu_logical" in body) {
		clauses.push("cpu_logical = ?");
		values.push(body.cpu_logical);
	}
	if ("cpu_physical" in body) {
		clauses.push("cpu_physical = ?");
		values.push(body.cpu_physical);
	}
	if ("mem_total_bytes" in body) {
		clauses.push("mem_total_bytes = ?");
		values.push(body.mem_total_bytes);
	}
	if ("swap_total_bytes" in body) {
		clauses.push("swap_total_bytes = ?");
		values.push(body.swap_total_bytes);
	}
	if ("virtualization" in body) {
		clauses.push("virtualization = ?");
		values.push(body.virtualization);
	}
	if ("net_interfaces" in body) {
		clauses.push("net_interfaces = ?");
		values.push(JSON.stringify(body.net_interfaces));
	}
	if ("disks" in body) {
		clauses.push("disks = ?");
		values.push(JSON.stringify(body.disks));
	}
	if ("boot_mode" in body) {
		clauses.push("boot_mode = ?");
		values.push(body.boot_mode);
	}
	if ("public_ip" in body) {
		clauses.push("public_ip = ?");
		values.push(body.public_ip);
	}

	return { clauses, values };
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
			`INSERT INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at, probe_version)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id) DO UPDATE SET
  hostname = excluded.hostname,
  os = excluded.os,
  kernel = excluded.kernel,
  arch = excluded.arch,
  cpu_model = excluded.cpu_model,
  boot_time = excluded.boot_time,
  last_seen = excluded.last_seen,
  identity_updated_at = excluded.identity_updated_at,
  probe_version = excluded.probe_version`,
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
			body.probe_version ?? null,
		)
		.run();

	// Conditionally merge inventory fields (2-state wire semantics)
	const raw = body as unknown as Record<string, unknown>;
	const { clauses, values } = buildInventoryUpdate(raw);
	if (clauses.length > 0) {
		await db
			.prepare(`UPDATE hosts SET ${clauses.join(", ")} WHERE host_id = ?`)
			.bind(...values, body.host_id)
			.run();
	}

	return c.body(null, 204);
}
