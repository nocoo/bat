// L2 — GET /api/alerts, GET /api/hosts/:id, host inventory merge

import type { AlertItem, HostDetailItem, HostOverviewItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-hosts-inv";

describe("L2: hosts detail + alerts", () => {
	test("GET /api/alerts → AlertItem[]", async () => {
		const res = await fetch(`${BASE}/api/alerts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const alerts = (await res.json()) as AlertItem[];
		expect(Array.isArray(alerts)).toBe(true);
	});

	test("POST /api/identity with inventory fields → merged into hosts table", async () => {
		const payload = {
			...makeIdentityPayload(HID),
			cpu_logical: 8,
			cpu_physical: 4,
			mem_total_bytes: 8589934592,
			swap_total_bytes: 2147483648,
			virtualization: "kvm",
			boot_mode: "uefi",
			public_ip: "203.0.113.42",
			net_interfaces: [
				{ iface: "eth0", mac: "aa:bb:cc:dd:ee:ff", ipv4: ["10.0.1.5"], ipv6: [], speed_mbps: 1000 },
			],
			disks: [{ device: "sda", size_bytes: 500107862016, rotational: false }],
		};
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(204);

		const hostsRes = await fetch(`${BASE}/api/hosts`, { headers: readHeaders() });
		const hosts = (await hostsRes.json()) as HostOverviewItem[];
		const host = hosts.find((h) => h.host_id === HID);
		expect(host).toBeDefined();
		expect(host?.cpu_logical).toBe(8);
		expect(host?.cpu_physical).toBe(4);
		expect(host?.mem_total_bytes).toBe(8589934592);
		expect(host?.virtualization).toBe("kvm");
		expect(host?.public_ip).toBe("203.0.113.42");
	});

	test("GET /api/hosts/:id → HostDetailItem with full inventory", async () => {
		const hid = hashHostId(HID);
		const res = await fetch(`${BASE}/api/hosts/${hid}`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const detail = (await res.json()) as HostDetailItem;
		expect(detail.host_id).toBe(HID);
		expect(detail.hid).toBe(hid);
		expect(detail.cpu_logical).toBe(8);
		expect(detail.cpu_physical).toBe(4);
		expect(detail.mem_total_bytes).toBe(8589934592);
		expect(detail.swap_total_bytes).toBe(2147483648);
		expect(detail.virtualization).toBe("kvm");
		expect(detail.boot_mode).toBe("uefi");
		expect(detail.public_ip).toBe("203.0.113.42");
		expect(detail.net_interfaces).toHaveLength(1);
		expect(detail.net_interfaces?.[0].iface).toBe("eth0");
		expect(detail.disks).toHaveLength(1);
		expect(detail.disks?.[0].device).toBe("sda");
	});

	test("GET /api/hosts/:id → 404 for unknown host", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-host-xyz`, { headers: readHeaders() });
		expect(res.status).toBe(404);
	});
});
