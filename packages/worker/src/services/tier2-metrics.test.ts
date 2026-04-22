import { describe, expect, test } from "bun:test";
import { rowToTier2Snapshot, type Tier2Row } from "./tier2-metrics";

const emptyRow: Tier2Row = {
	host_id: "web-01",
	ts: 1_700_000_000,
	ports_json: null,
	systemd_json: null,
	security_json: null,
	docker_json: null,
	disk_deep_json: null,
	software_json: null,
	websites_json: null,
	timezone: null,
	dns_resolvers_json: null,
	dns_search_json: null,
};

describe("rowToTier2Snapshot", () => {
	test("returns null for every JSON section when inputs are null", () => {
		const snap = rowToTier2Snapshot(emptyRow);
		expect(snap.ports).toBeNull();
		expect(snap.systemd).toBeNull();
		expect(snap.security).toBeNull();
		expect(snap.docker).toBeNull();
		expect(snap.disk_deep).toBeNull();
		expect(snap.software).toBeNull();
		expect(snap.websites).toBeNull();
		expect(snap.timezone).toBeNull();
		expect(snap.dns_resolvers).toBeNull();
		expect(snap.dns_search).toBeNull();
	});

	test("parses valid JSON columns back into structured values", () => {
		const ports = { listening: [{ port: 22, bind: "0.0.0.0" }] };
		const snap = rowToTier2Snapshot({
			...emptyRow,
			ports_json: JSON.stringify(ports),
			dns_resolvers_json: JSON.stringify(["1.1.1.1", "8.8.8.8"]),
		});
		expect(snap.ports).toEqual(ports);
		expect(snap.dns_resolvers).toEqual(["1.1.1.1", "8.8.8.8"]);
	});

	test("tolerates malformed JSON via safeParse (falls back to null)", () => {
		const snap = rowToTier2Snapshot({
			...emptyRow,
			docker_json: "{not valid",
			software_json: "}]",
		});
		expect(snap.docker).toBeNull();
		expect(snap.software).toBeNull();
	});

	test("preserves host_id + ts verbatim", () => {
		const snap = rowToTier2Snapshot({ ...emptyRow, host_id: "db-1", ts: 42 });
		expect(snap.host_id).toBe("db-1");
		expect(snap.ts).toBe(42);
	});

	test("normalises timezone undefined-ish values to null", () => {
		const snap = rowToTier2Snapshot({ ...emptyRow, timezone: null });
		expect(snap.timezone).toBeNull();
		const withTz = rowToTier2Snapshot({ ...emptyRow, timezone: "UTC" });
		expect(withTz.timezone).toBe("UTC");
	});

	test("dns_search parses array JSON", () => {
		const snap = rowToTier2Snapshot({
			...emptyRow,
			dns_search_json: JSON.stringify(["example.com"]),
		});
		expect(snap.dns_search).toEqual(["example.com"]);
	});
});
