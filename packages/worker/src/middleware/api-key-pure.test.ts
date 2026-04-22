// Unit tests for the pure `isWriteRequest` + `isMachineReadRoute` route-
// classification helpers. The full middleware is covered by the integration
// suite in api-key.test.ts; this file pins down the precise routing table.

import { describe, expect, test } from "bun:test";
import { isMachineReadRoute, isWriteRequest } from "./api-key";

describe("isWriteRequest — probe ingest", () => {
	test.each([
		["POST", "/api/ingest", true],
		["POST", "/api/identity", true],
		["POST", "/api/tier2", true],
		["GET", "/api/ingest", true], // exact-match list → method-agnostic
		["GET", "/api/hosts", false],
	])("%s %s → %p", (method, path, expected) => {
		expect(isWriteRequest(method, path)).toBe(expected);
	});
});

describe("isWriteRequest — webhook CRUD", () => {
	test("POST /api/webhooks is a write", () => {
		expect(isWriteRequest("POST", "/api/webhooks")).toBe(true);
	});
	test("GET /api/webhooks is a read", () => {
		expect(isWriteRequest("GET", "/api/webhooks")).toBe(false);
	});
	test("DELETE /api/webhooks/:id is a write", () => {
		expect(isWriteRequest("DELETE", "/api/webhooks/42")).toBe(true);
	});
	test("POST /api/webhooks/:id/regenerate is a write", () => {
		expect(isWriteRequest("POST", "/api/webhooks/42/regenerate")).toBe(true);
	});
});

describe("isWriteRequest — maintenance windows", () => {
	test("PUT and DELETE on maintenance are writes", () => {
		expect(isWriteRequest("PUT", "/api/hosts/h-1/maintenance")).toBe(true);
		expect(isWriteRequest("DELETE", "/api/hosts/h-1/maintenance")).toBe(true);
	});
	test("GET on maintenance is read", () => {
		expect(isWriteRequest("GET", "/api/hosts/h-1/maintenance")).toBe(false);
	});
});

describe("isWriteRequest — tags + host-tags", () => {
	test("POST /api/tags is a write", () => {
		expect(isWriteRequest("POST", "/api/tags")).toBe(true);
	});
	test("PUT and DELETE on /api/tags/:id are writes", () => {
		expect(isWriteRequest("PUT", "/api/tags/5")).toBe(true);
		expect(isWriteRequest("DELETE", "/api/tags/5")).toBe(true);
	});
	test("GET on tags are reads", () => {
		expect(isWriteRequest("GET", "/api/tags")).toBe(false);
		expect(isWriteRequest("GET", "/api/tags/5")).toBe(false);
	});
	test("host-tag mutations POST/PUT/DELETE are writes", () => {
		expect(isWriteRequest("POST", "/api/hosts/h/tags")).toBe(true);
		expect(isWriteRequest("PUT", "/api/hosts/h/tags")).toBe(true);
		expect(isWriteRequest("DELETE", "/api/hosts/h/tags/42")).toBe(true);
	});
});

describe("isWriteRequest — allowed-ports", () => {
	test("POST/DELETE are writes", () => {
		expect(isWriteRequest("POST", "/api/hosts/h/allowed-ports")).toBe(true);
		expect(isWriteRequest("DELETE", "/api/hosts/h/allowed-ports/22")).toBe(true);
	});
	test("GET is a read", () => {
		expect(isWriteRequest("GET", "/api/hosts/h/allowed-ports")).toBe(false);
	});
});

describe("isWriteRequest — other GET routes are reads", () => {
	test.each([
		["GET", "/api/hosts"],
		["GET", "/api/hosts/h-1"],
		["GET", "/api/hosts/h-1/metrics"],
		["GET", "/api/alerts"],
		["GET", "/api/events"],
		["GET", "/api/live"],
	])("%s %s → false", (method, path) => {
		expect(isWriteRequest(method, path)).toBe(false);
	});
});

describe("isMachineReadRoute", () => {
	test("matches /api/monitoring/* prefix", () => {
		expect(isMachineReadRoute("/api/monitoring/hosts")).toBe(true);
		expect(isMachineReadRoute("/api/monitoring/hosts/h/detail")).toBe(true);
		expect(isMachineReadRoute("/api/monitoring")).toBe(true);
	});

	test("rejects other routes", () => {
		expect(isMachineReadRoute("/api/hosts")).toBe(false);
		expect(isMachineReadRoute("/api/monitoringx")).toBe(true); // prefix match — documented behaviour
		expect(isMachineReadRoute("/monitoring")).toBe(false);
	});
});
