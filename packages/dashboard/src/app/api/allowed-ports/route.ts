// GET /api/allowed-ports — All allowed ports grouped by host_id
// D1 direct. Used by alerts page to annotate public_port alerts.

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";

interface AllowedPortRow {
	host_id: string;
	port: number;
}

export async function GET() {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const result = await d1Query<AllowedPortRow>(
		"SELECT host_id, port FROM port_allowlist ORDER BY host_id, port",
	);

	// Group into { [host_id]: number[] }
	const map: Record<string, number[]> = {};
	for (const row of result.results) {
		const list = map[row.host_id];
		if (list) {
			list.push(row.port);
		} else {
			map[row.host_id] = [row.port];
		}
	}

	return Response.json(map);
}
