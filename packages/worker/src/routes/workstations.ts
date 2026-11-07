// Browser workstation reads and revocation. All routes require a verified
// Access session through the normal chain; DELETE additionally requires the
// same-origin management confirmation and owner or global-manager authority.
// These routes are never registered on the machine endpoint.

import type { SparklinePoint, WorkstationListItem } from "@bat/shared";
import { validateWorkstationPairApprove, validateWorkstationRename } from "@bat/shared";
import type { Context } from "hono";
import { configuredManager } from "../domain/connect.js";
import { parseHistoryQuery } from "../domain/workstation-history.js";
import { hashSecret } from "../domain/workstation-token.js";
import type { AppEnv } from "../types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * The list projection adds the last 24 hourly samples so the table can draw a
 * trend without one request per workstation. A workstation without samples
 * keeps null instead of a fabricated flat line.
 */
export async function workstationsListRoute(c: Context<AppEnv>) {
	const records = await c.var.repos.workstations.list();
	if (records.length === 0) {
		return c.json([]);
	}
	const now = nowSeconds();
	const rows = await c.var.repos.workstations.listSparklineRowsSince(
		records.map((record) => record.id),
		now - 86_400,
	);
	const byId = new Map<string, { cpu: SparklinePoint[]; mem: SparklinePoint[] }>();
	for (const row of rows) {
		let entry = byId.get(row.workstation_id);
		if (!entry) {
			entry = { cpu: [], mem: [] };
			byId.set(row.workstation_id, entry);
		}
		if (row.cpu !== null) {
			entry.cpu.push({ ts: row.ts, v: row.cpu });
		}
		if (row.mem !== null) {
			entry.mem.push({ ts: row.ts, v: row.mem });
		}
	}
	const items: WorkstationListItem[] = records.map((record) => {
		const sparklines = byId.get(record.id);
		return {
			...record,
			cpu_sparkline: sparklines && sparklines.cpu.length > 0 ? sparklines.cpu : null,
			mem_sparkline: sparklines && sparklines.mem.length > 0 ? sparklines.mem : null,
		};
	});
	return c.json(items);
}

export async function workstationDetailRoute(c: Context<AppEnv, "/api/workstations/:id">) {
	const record = await c.var.repos.workstations.get(c.req.param("id"));
	if (!record) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	return c.json(record);
}

async function historyQuery(c: Context<AppEnv>, id: string) {
	const query = parseHistoryQuery(c.req.query(), nowSeconds());
	if (!query) {
		return {
			error: c.json(
				{
					error:
						"from/to must be Unix seconds within a 30 day window, limit 1-100, offset a non-negative integer",
				},
				400,
			),
		} as const;
	}
	const record = await c.var.repos.workstations.get(id);
	if (!record) {
		return { error: c.json({ error: "Workstation not found" }, 404) } as const;
	}
	return { query } as const;
}

export async function workstationMetricsRoute(c: Context<AppEnv, "/api/workstations/:id/metrics">) {
	const id = c.req.param("id");
	const history = await historyQuery(c, id);
	if ("error" in history) {
		return history.error;
	}
	const { from, to, limit, offset } = history.query;
	const data = await c.var.repos.workstations.metrics(id, from, to, limit, offset);
	return c.json({
		data,
		page: {
			limit,
			offset,
			next_offset: data.length === limit ? offset + data.length : null,
		},
	});
}

export async function workstationConnectivityRoute(
	c: Context<AppEnv, "/api/workstations/:id/connectivity">,
) {
	const id = c.req.param("id");
	const history = await historyQuery(c, id);
	if ("error" in history) {
		return history.error;
	}
	const { from, to, limit } = history.query;
	const targets = await c.var.repos.workstations.connectivity(id, from, to, limit);
	return c.json({ targets, limit });
}

export async function workstationDeleteRoute(c: Context<AppEnv, "/api/workstations/:id">) {
	if (
		c.get("accessAuthenticated") !== true ||
		c.req.header("Origin") !== new URL(c.req.url).origin ||
		c.req.header("X-Bat-Management") !== "1"
	) {
		return c.json({ error: "A same-origin browser confirmation is required" }, 403);
	}
	const principal = c.var.accessPrincipal;
	if (!principal) {
		return c.json({ error: "A browser Access session is required" }, 403);
	}
	const row = await c.var.repos.workstations.getById(c.req.param("id"));
	if (!row) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	if (row.owner !== principal && !configuredManager(c.env.CONNECT_MANAGERS, principal)) {
		return c.json({ error: "You cannot revoke this workstation" }, 403);
	}
	await c.var.repos.workstations.delete(row.id, row.installation_id);
	return c.json({ ok: true });
}

async function managementPrincipal(c: Context<AppEnv>): Promise<string | null> {
	if (c.get("accessAuthenticated") !== true) {
		return null;
	}
	const principal = c.var.accessPrincipal;
	if (!principal?.startsWith("email:")) {
		return null;
	}
	const sameOrigin =
		c.req.header("Origin") === new URL(c.req.url).origin &&
		c.req.header("X-Bat-Management") === "1";
	return sameOrigin ? principal : null;
}

/**
 * Approve a headless pairing. The machine never sees this response; approval
 * only stamps the owner and the approved marker so its exchange can proceed.
 */
export async function workstationPairApproveRoute(c: Context<AppEnv>) {
	const principal = await managementPrincipal(c);
	if (principal === null) {
		return c.json(
			{ error: "Approval requires a same-origin Access session with an email principal" },
			403,
		);
	}
	const body = await c.req.json().catch(() => null);
	const parsed = validateWorkstationPairApprove(body);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}
	const now = Math.floor(Date.now() / 1000);
	const pairingHash = await hashSecret(parsed.value.pairing_code);
	const row = await c.var.repos.workstations.getCodeByPairing(pairingHash);
	if (!row) {
		return c.json({ error: "Pairing code is unknown" }, 404);
	}
	if (row.consumed_at !== null || row.approved_at !== null) {
		return c.json({ error: "Pairing code was already used" }, 409);
	}
	if (row.expires_at <= now) {
		return c.json({ error: "Pairing code has expired" }, 410);
	}
	const approved = await c.var.repos.workstations.approvePairing(pairingHash, principal, now);
	if (!approved) {
		return c.json({ error: "Pairing code was already used or expired" }, 409);
	}
	return c.json({ ok: true, name: row.name, installation_id: row.installation_id });
}

/** Rename a workstation the caller owns or manages. */
export async function workstationRenameRoute(c: Context<AppEnv, "/api/workstations/:id">) {
	const principal = await managementPrincipal(c);
	if (principal === null) {
		return c.json(
			{ error: "Renaming requires a same-origin Access session with an email principal" },
			403,
		);
	}
	const body = await c.req.json().catch(() => null);
	const parsed = validateWorkstationRename(body);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}
	const id = c.req.param("id");
	const record = await c.var.repos.workstations.get(id);
	if (!record) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	const manager = configuredManager(c.env.CONNECT_MANAGERS, principal);
	if (record.owner !== principal && !manager) {
		return c.json({ error: "Only the owner or a global manager may rename this workstation" }, 403);
	}
	await c.var.repos.workstations.rename(id, parsed.value.name);
	const updated = await c.var.repos.workstations.get(id);
	return c.json(updated);
}
