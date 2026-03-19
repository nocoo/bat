// Proxy logic: server-side forwarding from Dashboard to Worker
// Dashboard API routes act as an authenticated proxy so the browser
// never sees Worker URLs or API keys.

/**
 * Forward a request to the Worker API, injecting the read API key.
 * Returns the Worker's response (status + JSON body) to pass through to the client.
 */
export async function proxyToWorker(
	workerPath: string,
	searchParams?: URLSearchParams,
): Promise<Response> {
	const apiUrl = process.env.BAT_API_URL;
	const readKey = process.env.BAT_READ_KEY;

	if (!apiUrl || !readKey) {
		return Response.json(
			{ error: "Server misconfigured: missing BAT_API_URL or BAT_READ_KEY" },
			{ status: 502 },
		);
	}

	const url = new URL(workerPath, apiUrl);
	if (searchParams) {
		for (const [key, value] of searchParams) {
			url.searchParams.set(key, value);
		}
	}

	try {
		const workerRes = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${readKey}`,
			},
		});

		// Pass through Worker response status and body
		const body = await workerRes.text();
		return new Response(body, {
			status: workerRes.status,
			headers: {
				"Content-Type": workerRes.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch {
		return Response.json({ error: "Failed to reach Worker API" }, { status: 502 });
	}
}

/**
 * Forward a request with a body (POST, PUT, DELETE) to the Worker API.
 * Injects the read API key and passes through the request body.
 */
export async function proxyToWorkerWithBody(
	workerPath: string,
	method: string,
	body?: string | null,
): Promise<Response> {
	const apiUrl = process.env.BAT_API_URL;
	const readKey = process.env.BAT_READ_KEY;

	if (!apiUrl || !readKey) {
		return Response.json(
			{ error: "Server misconfigured: missing BAT_API_URL or BAT_READ_KEY" },
			{ status: 502 },
		);
	}

	const url = new URL(workerPath, apiUrl);

	try {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${readKey}`,
		};
		if (body) {
			headers["Content-Type"] = "application/json";
		}

		const workerRes = await fetch(url.toString(), {
			method,
			headers,
			body: body ?? null,
		});

		const responseBody = await workerRes.text();
		return new Response(responseBody, {
			status: workerRes.status,
			headers: {
				"Content-Type": workerRes.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch {
		return Response.json({ error: "Failed to reach Worker API" }, { status: 502 });
	}
}
