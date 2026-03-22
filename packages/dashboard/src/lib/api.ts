// API client — fetch wrapper for Dashboard proxy routes
// Calls Dashboard's own /api/* routes (NOT Worker directly)

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export async function fetchAPI<T>(path: string, params?: Record<string, string>): Promise<T> {
	const url = new URL(path, window.location.origin);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
	return res.json() as Promise<T>;
}
