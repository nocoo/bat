// GET /api/hosts/:id/allowed-ports — List allowed ports for a host
// POST /api/hosts/:id/allowed-ports — Add a port to the allowlist
// D1 direct. Per-host port allowlist for public_port alert suppression.

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";
import { MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
import type { AllowedPort } from "@bat/shared";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId } = await params;

	const result = await d1Query<AllowedPort>(
		"SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? ORDER BY port ASC",
		[hostId],
	);

	return Response.json(result.results);
}

export async function POST(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId } = await params;
	const body = (await request.json()) as { port?: number; reason?: string };

	// Validate port
	if (
		typeof body.port !== "number" ||
		!Number.isInteger(body.port) ||
		body.port < 1 ||
		body.port > 65535
	) {
		return Response.json({ error: "port must be an integer 1-65535" }, { status: 400 });
	}

	// Validate reason
	const reason = typeof body.reason === "string" ? body.reason.trim() : "";
	if (reason.length > 200) {
		return Response.json({ error: "reason must be 200 characters or fewer" }, { status: 400 });
	}

	// Idempotent: if this port is already allowed, return it directly
	const existing = await d1Query<AllowedPort>(
		"SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?",
		[hostId, body.port],
	);
	if (existing.results.length > 0) {
		return Response.json(existing.results[0], { status: 201 });
	}

	// Check entry limit (only for genuinely new ports)
	const countResult = await d1Query<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM port_allowlist WHERE host_id = ?",
		[hostId],
	);
	if ((countResult.results[0]?.cnt ?? 0) >= MAX_ALLOWED_PORTS_PER_HOST) {
		return Response.json(
			{ error: `Maximum ${MAX_ALLOWED_PORTS_PER_HOST} allowed ports per host` },
			{ status: 422 },
		);
	}

	// INSERT OR IGNORE (idempotent if port already allowed)
	await d1Query("INSERT OR IGNORE INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)", [
		hostId,
		body.port,
		reason,
	]);

	// Return the inserted/existing row
	const row = await d1Query<AllowedPort>(
		"SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?",
		[hostId, body.port],
	);

	return Response.json(row.results[0], { status: 201 });
}
