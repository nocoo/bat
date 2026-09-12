import { DurableObject } from "cloudflare:workers";
import { CONNECT_LIMITS } from "@bat/shared";
import { coordinates, fingerprint } from "./domain/connect.js";

export { coordinates } from "./domain/connect.js";

import worker, { app } from "./index.js";
import type { Bindings } from "./types.js";

function failure(code: string, message: string, status: number): Response {
	const requestId = crypto.randomUUID();
	return Response.json(
		{ error: { code, message, requestId } },
		{
			status,
			headers: {
				"Cache-Control": "no-store, private",
				"X-Request-Id": requestId,
				"Retry-After": "5",
				"X-Content-Type-Options": "nosniff",
			},
		},
	);
}

/** One coordination atom per Bat database: tags/bindings/settings are shared.
 * Only configuration mutations enter this object, never reads or probe samples.
 * Idempotency/provenance is persisted in D1 before side effects; a terminated
 * request remains pending and is never automatically executed a second time.
 */
export class ConnectCoordinator extends DurableObject<Bindings> {
	private tail: Promise<void> = Promise.resolve();
	private pending = 0;

	async fetch(request: Request): Promise<Response> {
		if (this.pending >= 32)
			return failure(
				"busy",
				"Too many configuration changes are queued. Retry with the same idempotency key.",
				429,
			);
		this.pending++;
		const queuedAt = Date.now();
		const current = this.tail.then(async () => {
			const tasks: Promise<unknown>[] = [];
			if (Date.now() - queuedAt > CONNECT_LIMITS.requestTimeoutMs)
				return {
					response: failure(
						"queue_timeout",
						"Request expired before execution. Retry with the same idempotency key.",
						504,
					),
					tasks,
				};
			const context = {
				waitUntil: (task: Promise<unknown>) => {
					tasks.push(task);
					this.ctx.waitUntil(task);
				},
				passThroughOnException: () => {
					throw new Error("Pass-through is not supported");
				},
				props: {},
			};
			const response = await app.fetch(
				request,
				{ ...this.env, CONNECT_COORDINATED: true },
				context,
			);
			return { response, tasks };
		});
		this.tail = current
			.then(
				async ({ tasks }) => {
					await Promise.allSettled(tasks);
				},
				() => undefined,
			)
			.finally(() => {
				this.pending--;
			});
		this.ctx.waitUntil(this.tail);
		return (await current).response;
	}
}

export default {
	async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (coordinates(request.method, url.pathname)) {
			if (
				env.ENVIRONMENT === "production" &&
				!["bat.hexly.ai", "bat-ingest.worker.hexly.ai"].includes(url.hostname)
			)
				return failure("hostname_denied", "Unknown production hostname.", 403);
			if (!env.CONNECT_COORDINATOR)
				return failure(
					"coordination_unavailable",
					"Configuration writes are temporarily unavailable.",
					503,
				);
			if (
				env.CONNECT_EDGE_LIMITER &&
				!(
					await env.CONNECT_EDGE_LIMITER.limit({
						key: `control:${await fingerprint(request.headers.get("CF-Connecting-IP") ?? "local")}`,
					})
				).success
			)
				return failure("rate_limited", "Too many configuration changes. Retry later.", 429);
			return env.CONNECT_COORDINATOR.getByName(env.CONNECT_DEPLOYMENT_ID ?? "bat-local").fetch(
				request,
			);
		}
		return app.fetch(request, { ...env, CONNECT_COORDINATED: false }, ctx);
	},
	scheduled: worker.scheduled,
} satisfies ExportedHandler<Bindings>;
