// L2 — PATCH /api/hosts/:id/billing → manual per-host billing inputs

import type { HostDetailItem, HostOverviewItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-host-billing";

async function registerHost() {
	const res = await fetch(`${BASE}/api/identity`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify(makeIdentityPayload(HID)),
	});
	expect(res.status).toBe(204);
}

async function patchBilling(body: unknown, key?: "read" | "write") {
	return fetch(`${BASE}/api/hosts/${hashHostId(HID)}/billing`, {
		method: "PATCH",
		headers: key === "read" ? readHeaders() : writeHeaders(),
		body: JSON.stringify(body),
	});
}

describe("L2: host billing", () => {
	test("PATCH /api/hosts/:id/billing → stores the triple and serves it", async () => {
		await registerHost();

		const res = await patchBilling({
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(204);

		const detailRes = await fetch(`${BASE}/api/hosts/${hashHostId(HID)}`, {
			headers: readHeaders(),
		});
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as HostDetailItem;
		expect(detail.cost_amount_cny).toBe(365);
		expect(detail.paid_at).toBe("2026-01-01");
		expect(detail.renews_at).toBe("2027-01-01");

		const hostsRes = await fetch(`${BASE}/api/hosts`, { headers: readHeaders() });
		const hosts = (await hostsRes.json()) as HostOverviewItem[];
		expect(hosts.find((host) => host.host_id === HID)?.renews_at).toBe("2027-01-01");
	});

	test("PATCH /api/hosts/:id/billing → clears the triple when every field is null", async () => {
		await registerHost();
		await patchBilling({
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});

		const res = await patchBilling({
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
		});
		expect(res.status).toBe(204);

		const detail = (await (
			await fetch(`${BASE}/api/hosts/${hashHostId(HID)}`, { headers: readHeaders() })
		).json()) as HostDetailItem;
		expect(detail.cost_amount_cny).toBeNull();
		expect(detail.paid_at).toBeNull();
		expect(detail.renews_at).toBeNull();
	});

	test("PATCH /api/hosts/:id/billing → 400 on an invalid triple", async () => {
		await registerHost();

		const mixed = await patchBilling({
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: null,
		});
		expect(mixed.status).toBe(400);
		expect(((await mixed.json()) as { error: string }).error).toContain(
			"all be set or all be null",
		);

		const negative = await patchBilling({
			cost_amount_cny: -1,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(negative.status).toBe(400);

		const badDate = await patchBilling({
			cost_amount_cny: 365,
			paid_at: "2026-02-30",
			renews_at: "2027-01-01",
		});
		expect(badDate.status).toBe(400);

		const reversed = await patchBilling({
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2025-12-31",
		});
		expect(reversed.status).toBe(400);
		expect(((await reversed.json()) as { error: string }).error).toContain(
			"renews_at must be after paid_at",
		);
	});

	test("PATCH /api/hosts/:id/billing → 404 on an unknown host", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-billing-host/billing`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({
				cost_amount_cny: 365,
				paid_at: "2026-01-01",
				renews_at: "2027-01-01",
			}),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /api/hosts/:id/billing → the read key cannot write", async () => {
		await registerHost();
		const res = await patchBilling(
			{
				cost_amount_cny: 365,
				paid_at: "2026-01-01",
				renews_at: "2027-01-01",
			},
			"read",
		);
		expect(res.status).toBe(403);
	});
});
