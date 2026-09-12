import { expect, test } from "vitest";
import { app } from "../index.js";
import { errorCategory } from "./error-category.js";

test.each([
	["D1_ERROR: SQLITE_BUSY database is locked", "database_busy"],
	["Cannot perform I/O on behalf of a different request", "request_context"],
	["The script will never generate a response", "request_stalled"],
	["Body has already been consumed", "body_unavailable"],
	["Network connection lost", "connection"],
	["D1_ERROR: secret SQL bindings", "database"],
	["Durable Object reset", "coordinator_reset"],
	["CPU time limit exceeded", "cpu_limit"],
])("classifies a failure without returning its contents", (message, expected) => {
	expect(errorCategory(message)).toBe(expected);
	expect(errorCategory(new Error(message))).toBe(expected);
});

test("arbitrary exception data, credentials and user-controlled names stay private", () => {
	const secret = "batc_sensitive_diagnostic_fixture";
	const error = new Error(secret);
	error.name = secret;
	expect(errorCategory(error)).toBe("unexpected");
	expect(errorCategory({ message: secret })).toBe("unexpected");
	expect(errorCategory(new TypeError(secret))).toBe("type");
	expect(errorCategory(new RangeError(secret))).toBe("range");
});

test("HTTP diagnostics expose only a fixed category in development and nothing in production", async () => {
	const DB = {
		prepare() {
			throw new Error("D1_ERROR: batc_sensitive_diagnostic_fixture");
		},
	} as unknown as D1Database;
	for (const ENVIRONMENT of ["development", "production"]) {
		const response = await app.request(
			"https://bat-ingest.worker.hexly.ai/api/monitoring/hosts",
			{ headers: { Host: "bat-ingest.worker.hexly.ai", Authorization: "Bearer read-fixture" } },
			{ DB, ENVIRONMENT, BAT_READ_KEY: "read-fixture", BAT_WRITE_KEY: "write-fixture" },
		);
		expect(response.status).toBe(500);
		expect(response.headers.get("X-Bat-Diagnostic")).toBe(
			ENVIRONMENT === "development" ? "database" : null,
		);
		expect(await response.json()).toEqual({ error: "Internal server error" });
	}
});
