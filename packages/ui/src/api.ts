// MVVM "Model" layer — thin fetch wrapper around the Worker /api/* routes.
//
// All HTTP verbs share a single `request` helper so error handling and
// JSON encoding live in exactly one place. Splitting GET params into a
// dedicated argument keeps callers honest about query strings vs. bodies
// and makes URL construction trivially testable.

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/** Append `params` to `path` as a query string. Pure / testable. */
export function buildUrl(path: string, params?: Record<string, string>): string {
	if (!params) {
		return path;
	}
	const qs = new URLSearchParams(params).toString();
	return qs ? `${path}?${qs}` : path;
}

interface RequestOptions {
	body?: unknown;
	params?: Record<string, string>;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
	const hasBody = opts.body !== undefined;
	const res = await fetch(buildUrl(path, opts.params), {
		method,
		headers: hasBody ? { "Content-Type": "application/json" } : undefined,
		body: hasBody ? JSON.stringify(opts.body) : undefined,
	});
	if (!res.ok) {
		throw new ApiError(res.status, `API error: ${res.status}`);
	}
	if (res.status === 204) {
		return null as T;
	}
	return res.json() as Promise<T>;
}

export const getAPI = <T>(path: string, params?: Record<string, string>): Promise<T> =>
	request<T>("GET", path, { params });

export const postAPI = <T>(path: string, body?: unknown): Promise<T> =>
	request<T>("POST", path, { body });

export const putAPI = <T>(path: string, body?: unknown): Promise<T> =>
	request<T>("PUT", path, { body });

export const deleteAPI = (path: string): Promise<void> => request<void>("DELETE", path);
