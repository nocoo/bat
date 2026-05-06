// HTTP client for bat Worker API communication.
// Wraps fetch with Bearer token auth, timeout, and typed error classes.

/** Network-level error (connection failed, timeout, DNS, etc.) */
export class NetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NetworkError";
	}
}

/** API error (non-2xx response from the Worker) */
export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

/** Authentication error (401 — invalid or expired token) */
export class AuthError extends ApiError {
	constructor(message: string) {
		super(401, message);
		this.name = "AuthError";
	}
}

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Minimal HTTP client for the bat Worker API.
 *
 * All requests include `Authorization: Bearer <token>` when a token is set.
 * Non-2xx responses throw ApiError/AuthError; network failures throw NetworkError.
 */
export class HttpClient {
	private readonly baseUrl: string;
	private readonly token: string | undefined;
	private readonly timeoutMs: number;

	constructor(baseUrl: string, token?: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
		// Strip trailing slash for clean path joining
		this.baseUrl = baseUrl.replace(/\/$/, "");
		this.token = token;
		this.timeoutMs = timeoutMs;
	}

	/** GET request */
	async get<T>(path: string): Promise<T> {
		return this.request<T>("GET", path);
	}

	/** POST request */
	async post<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("POST", path, body);
	}

	/** PATCH request */
	async patch<T>(path: string, body?: unknown): Promise<T> {
		return this.request<T>("PATCH", path, body);
	}

	/** DELETE request — returns void for 204, otherwise parses JSON */
	async delete<T = void>(path: string): Promise<T> {
		return this.request<T>("DELETE", path);
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}
		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const init: RequestInit = {
				method,
				headers,
				signal: controller.signal,
			};
			if (body !== undefined) {
				init.body = JSON.stringify(body);
			}

			const res = await fetch(url, init);

			clearTimeout(timer);

			if (!res.ok) {
				// Try to extract error message from JSON body
				let message = `HTTP ${res.status}`;
				try {
					const errBody = (await res.json()) as { error?: string };
					if (errBody.error) {
						message = errBody.error;
					}
				} catch {
					// Ignore JSON parse failure — use status text
				}

				if (res.status === 401) {
					throw new AuthError(message);
				}
				throw new ApiError(res.status, message);
			}

			// 204 No Content — return void
			if (res.status === 204) {
				return undefined as T;
			}

			return (await res.json()) as T;
		} catch (err) {
			clearTimeout(timer);

			// Re-throw our own errors
			if (err instanceof ApiError) {
				throw err;
			}

			if (err instanceof Error) {
				if (err.name === "AbortError") {
					throw new NetworkError(`Request timeout after ${this.timeoutMs}ms`);
				}
				throw new NetworkError(err.message);
			}

			throw new NetworkError("Unknown network error");
		}
	}
}
