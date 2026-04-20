// API client — fetch wrapper for Worker API routes
// In SPA mode, calls /api/* directly (no proxy needed, same origin)

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export async function fetchAPI<T>(
	path: string,
	paramsOrOptions?: Record<string, string> | RequestInit,
): Promise<T> {
	// If it looks like RequestInit (has method, body, headers, etc.), treat it as options
	const isRequestInit =
		paramsOrOptions &&
		("method" in paramsOrOptions ||
			"body" in paramsOrOptions ||
			"headers" in paramsOrOptions ||
			"credentials" in paramsOrOptions);

	if (isRequestInit) {
		const res = await fetch(path, {
			headers: { "Content-Type": "application/json" },
			...paramsOrOptions,
		});
		if (!res.ok) {
			throw new ApiError(res.status, `API error: ${res.status}`);
		}
		if (res.status === 204) {
			return null as T;
		}
		return res.json() as Promise<T>;
	}

	// Otherwise treat as query params
	const url = new URL(path, window.location.origin);
	if (paramsOrOptions) {
		for (const [k, v] of Object.entries(paramsOrOptions)) {
			url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
	return res.json() as Promise<T>;
}

/** POST JSON to API */
export async function postAPI<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
	return res.json() as Promise<T>;
}

/** DELETE to API */
export async function deleteAPI(path: string): Promise<void> {
	const res = await fetch(path, { method: "DELETE" });
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
}

/** PUT JSON to API */
export async function putAPI<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
	return res.json() as Promise<T>;
}
