// Setup route for UI configuration
// Returns worker URL for probe installation and webhook commands
// Does NOT return API keys — those must be manually obtained from CF console

import type { Context } from "hono";
import type { AppEnv } from "../types.js";

interface SetupResponse {
	worker_url: string;
}

export function setupRoute(c: Context<AppEnv>): Response {
	// Determine worker URL from request
	// In production: use bat-ingest.worker.hexly.ai (machine endpoint)
	// In dev: use current origin
	const host = c.req.header("host") || "localhost:8787";
	const protocol = host.startsWith("localhost") ? "http" : "https";

	// For browser endpoint (bat.hexly.ai), point to machine endpoint
	let workerUrl: string;
	if (host === "bat.hexly.ai") {
		workerUrl = "https://bat-ingest.worker.hexly.ai";
	} else if (host.includes("bat-ingest")) {
		workerUrl = `${protocol}://${host}`;
	} else {
		// localhost or other dev environments
		workerUrl = `${protocol}://${host}`;
	}

	const response: SetupResponse = {
		worker_url: workerUrl,
	};

	return c.json(response);
}
