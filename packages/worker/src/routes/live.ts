// GET /api/live — public liveness check (no auth required)
import { BAT_VERSION, type LiveResponse } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function liveRoute(c: Context<AppEnv>) {
	const response: LiveResponse = {
		status: "ok",
		version: BAT_VERSION,
		component: "worker",
	};
	return c.json(response, 200, { "Cache-Control": "no-store" });
}
