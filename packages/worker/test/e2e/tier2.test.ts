// L2 — POST /api/tier2 (dns/timezone merge)

import type { HostDetailItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-tier2-001";

describe("L2: tier2 ingest", () => {
	test("POST /api/tier2 with dns/timezone → merged into hosts table", async () => {
		const identRes = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		expect(identRes.status).toBe(204);

		const tier2Payload = {
			host_id: HID,
			timestamp: Math.floor(Date.now() / 1000),
			timezone: "America/New_York",
			dns_resolvers: ["1.1.1.1", "8.8.8.8"],
			dns_search: ["example.com"],
		};
		const t2Res = await fetch(`${BASE}/api/tier2`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(tier2Payload),
		});
		expect(t2Res.status).toBe(204);

		const hid = hashHostId(HID);
		const detailRes = await fetch(`${BASE}/api/hosts/${hid}`, { headers: readHeaders() });
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as HostDetailItem;
		expect(detail.timezone).toBe("America/New_York");
		expect(detail.dns_resolvers).toEqual(["1.1.1.1", "8.8.8.8"]);
		expect(detail.dns_search).toEqual(["example.com"]);
	});
});
