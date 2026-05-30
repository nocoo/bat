import type { IdentityPayload } from "@bat/shared";
// POST /api/identity — upsert host identity
import type { Context } from "hono";
import type { HostInventoryUpdate } from "../repos/types.js";
import type { AppEnv } from "../types.js";

/** Lightweight validation — checks required fields exist and are correct types */
export function validateIdentityPayload(body: unknown): body is IdentityPayload {
	if (!body || typeof body !== "object") {
		return false;
	}
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
 * Pick the inventory fields actually present on the wire (2-state semantics:
 * present = update, absent = no-op). Pure — exported for unit tests.
 */
export function pickInventoryFields(body: Record<string, unknown>): HostInventoryUpdate {
	const fields: HostInventoryUpdate = {};
	if ("cpu_logical" in body) {
		fields.cpu_logical = body.cpu_logical as number | null;
	}
	if ("cpu_physical" in body) {
		fields.cpu_physical = body.cpu_physical as number | null;
	}
	if ("mem_total_bytes" in body) {
		fields.mem_total_bytes = body.mem_total_bytes as number | null;
	}
	if ("swap_total_bytes" in body) {
		fields.swap_total_bytes = body.swap_total_bytes as number | null;
	}
	if ("virtualization" in body) {
		fields.virtualization = body.virtualization as string | null;
	}
	if ("net_interfaces" in body) {
		fields.net_interfaces = body.net_interfaces;
	}
	if ("disks" in body) {
		fields.disks = body.disks;
	}
	if ("boot_mode" in body) {
		fields.boot_mode = body.boot_mode as string | null;
	}
	if ("public_ip" in body) {
		fields.public_ip = body.public_ip as string | null;
	}
	return fields;
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

	const repos = c.var.repos;

	// Check if host is retired
	const existing = await repos.hosts.getActiveFlag(body.host_id);
	if (existing && existing.is_active === 0) {
		return c.json({ error: "host is retired" }, 403);
	}

	// Worker time, not Probe time
	const now = Math.floor(Date.now() / 1000);

	await repos.hosts.upsertIdentity({
		hostId: body.host_id,
		hostname: body.hostname,
		os: body.os,
		kernel: body.kernel,
		arch: body.arch,
		cpuModel: body.cpu_model,
		bootTime: body.boot_time,
		probeVersion: body.probe_version ?? null,
		nowSeconds: now,
	});

	// Conditionally merge inventory fields (2-state wire semantics)
	const inventory = pickInventoryFields(body as unknown as Record<string, unknown>);
	await repos.hosts.updateInventory(body.host_id, inventory);

	return c.body(null, 204);
}
