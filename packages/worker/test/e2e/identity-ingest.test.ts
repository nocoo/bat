// L2 — POST /api/identity, POST /api/ingest, GET /api/hosts, GET /api/hosts/:id/metrics

import type { HostOverviewItem, MetricsQueryResponse } from "@bat/shared";
import { describe, expect, test } from "vitest";
import {
	BASE,
	makeIdentityPayload,
	makeMetricsPayload,
	readHeaders,
	writeHeaders,
} from "./helpers";

const HID = "e2e-ingest-001";

describe("L2: identity + ingest + hosts list/metrics", () => {
	test("POST /api/identity → 204", async () => {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		expect(res.status).toBe(204);
	});

	test("POST /api/ingest → 204", async () => {
		const res = await fetch(`${BASE}/api/ingest`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeMetricsPayload(HID)),
		});
		expect(res.status).toBe(204);
	});

	test("GET /api/hosts → HostOverviewItem[]", async () => {
		const res = await fetch(`${BASE}/api/hosts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const hosts = (await res.json()) as HostOverviewItem[];
		const host = hosts.find((h) => h.host_id === HID);
		expect(host).toBeDefined();
		expect(host?.hostname).toBe(`${HID}.example.com`);
	});

	test("GET /api/hosts/:id/metrics → MetricsQueryResponse", async () => {
		const now = Math.floor(Date.now() / 1000);
		const res = await fetch(`${BASE}/api/hosts/${HID}/metrics?from=${now - 3600}&to=${now + 60}`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const metrics = (await res.json()) as MetricsQueryResponse;
		expect(metrics.host_id).toBe(HID);
		expect(metrics.resolution).toBe("raw");
		expect(metrics.data.length).toBeGreaterThanOrEqual(1);
	});
});
