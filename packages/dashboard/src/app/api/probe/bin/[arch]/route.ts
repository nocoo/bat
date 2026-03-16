// GET /api/probe/bin/:arch — serve precompiled probe binary
// No auth required — public download

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

const VALID_ARCHS = new Set(["x86_64", "aarch64"]);
const BIN_DIR = process.env.PROBE_BIN_DIR || "/app/probe-bin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ arch: string }> }) {
	const { arch } = await params;

	if (!VALID_ARCHS.has(arch)) {
		return Response.json(
			{ error: `Invalid architecture: ${arch}. Must be x86_64 or aarch64` },
			{ status: 400 },
		);
	}

	const filePath = join(BIN_DIR, `bat-probe-linux-${arch}`);

	try {
		const binary = await readFile(filePath);
		return new Response(binary, {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename="bat-probe-linux-${arch}"`,
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return Response.json({ error: `Binary not available for ${arch}` }, { status: 404 });
	}
}
