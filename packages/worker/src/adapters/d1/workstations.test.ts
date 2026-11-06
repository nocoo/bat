import type { WorkstationReportInput } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1WorkstationsRepository } from "./workstations";

const NOW = 1_700_000_000;
const OWNER = "email:operator@example.test";
const INSTALLATION = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function report(reportId: string, finishedAt = NOW - 5): WorkstationReportInput {
	return {
		report_id: reportId,
		started_at: finishedAt - 10,
		finished_at: finishedAt,
		sample_window_ms: 10_000,
		cli_version: "2.5.0",
		hostname: "laptop-01",
		os: "macOS 15.2",
		arch: "arm64",
		uptime_seconds: 86_400,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
		mem: { total_bytes: 36_000_000_000, available_bytes: 12_000_000_000, used_pct: 66.7 },
		disk: [
			{
				mount: "/",
				total_bytes: 994_662_584_320,
				available_bytes: 397_284_917_248,
				used_pct: 60.1,
			},
		],
		network: { interfaces: [{ name: "en0", addresses: [] }] },
		connectivity: [
			{
				server_id: "srv-01",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 2,
				rtts_ms: [8, null, 10],
				status: "partial",
			},
			{
				server_id: "srv-02",
				address: "2001:4860:4860::8888",
				family: 6,
				sent: 3,
				received: 0,
				rtts_ms: [null, null, null],
				status: "timeout",
			},
		],
		collection_errors: [],
		targets_error: null,
	};
}

function uuid(index: number): string {
	return `3f2504e0-4f89-41d3-9a0c-${index.toString(16).padStart(12, "0")}`;
}

describe("D1WorkstationsRepository", () => {
	let db: D1Database;
	let repo: D1WorkstationsRepository;

	beforeEach(() => {
		db = createMockD1();
		repo = new D1WorkstationsRepository(db);
	});

	async function issueCode(
		code: string,
		options: { owner?: string; installationId?: string; name?: string } = {},
	): Promise<void> {
		await repo.createCode({
			code_hash: `hash:${code}`,
			owner: options.owner ?? OWNER,
			installation_id: options.installationId ?? INSTALLATION,
			challenge: "challenge",
			name: options.name ?? "Workstation",
			created_at: NOW,
			expires_at: NOW + 300,
			consumed_at: null,
		});
	}

	async function enroll(tokenHash = "hash:token-1"): Promise<string> {
		await issueCode("code-1");
		const result = await repo.exchange({
			codeHash: "hash:code-1",
			installationId: INSTALLATION,
			owner: OWNER,
			name: "Li MacBook",
			tokenHash,
			tokenPrefix: tokenHash.slice(0, 12),
			now: NOW,
		});
		if (!result.ok) throw new Error(`enrollment failed: ${result.ok}`);
		return result.row.id;
	}

	describe("enrollment", () => {
		test("creates a workstation with a hashed key only", async () => {
			const id = await enroll();
			const row = await repo.getById(id);
			expect(row).toMatchObject({
				id,
				owner: OWNER,
				installation_id: INSTALLATION,
				name: "Li MacBook",
				disabled: 0,
				version: 1,
				last_seen_at: null,
				rotated_at: null,
			});
			expect(row?.token_hash).toBe("hash:token-1");
			expect(await repo.findByTokenHash("hash:token-1")).toMatchObject({ id });
			expect(await repo.findByTokenHash("hash:missing")).toBeNull();
		});

		test("re-enrollment rotates the key and keeps the workstation id", async () => {
			const id = await enroll();
			await issueCode("code-2");
			const rotated = await repo.exchange({
				codeHash: "hash:code-2",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-2",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(rotated.ok).toBe(true);
			if (!rotated.ok) return;
			expect(rotated.row.id).toBe(id);
			expect(rotated.row.version).toBe(2);
			expect(rotated.row.rotated_at).toBe(NOW + 60);
			expect(await repo.findByTokenHash("hash:token-1")).toBeNull();
			expect(await repo.findByTokenHash("hash:token-2")).toMatchObject({ id });
		});

		test("a consumed code cannot be exchanged twice", async () => {
			await enroll();
			const again = await repo.exchange({
				codeHash: "hash:code-1",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-3",
				tokenPrefix: "hash:token",
				now: NOW,
			});
			expect(again).toEqual({ ok: "code_invalid" });
		});

		test("an unknown code is rejected", async () => {
			const result = await repo.exchange({
				codeHash: "hash:missing",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Workstation",
				tokenHash: "hash:token",
				tokenPrefix: "hash:token",
				now: NOW,
			});
			expect(result).toEqual({ ok: "code_invalid" });
			expect(await repo.list()).toEqual([]);
		});

		test("a disabled workstation cannot be re-keyed by a new code", async () => {
			const id = await enroll();
			await db.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?").bind(id).run();
			await issueCode("code-2");
			const result = await repo.exchange({
				codeHash: "hash:code-2",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-9",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(result).toEqual({ ok: "disabled" });
			expect(await repo.findByTokenHash("hash:token-9")).toBeNull();
		});

		test("a consumed code cannot revive a disabled workstation", async () => {
			const id = await enroll();
			await db.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?").bind(id).run();
			const result = await repo.exchange({
				codeHash: "hash:code-1",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-5",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(result).toEqual({ ok: "disabled" });
		});

		test("a consumed code with another owner is rejected", async () => {
			await enroll();
			const result = await repo.exchange({
				codeHash: "hash:code-1",
				installationId: INSTALLATION,
				owner: "email:other@example.test",
				name: "Li MacBook",
				tokenHash: "hash:token-6",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(result).toEqual({ ok: "owner_mismatch" });
		});

		test("an installation enrolled to another owner cannot be taken over", async () => {
			await enroll();
			await issueCode("code-3", { owner: "email:other@example.test" });
			const result = await repo.exchange({
				codeHash: "hash:code-3",
				installationId: INSTALLATION,
				owner: "email:other@example.test",
				name: "Hijack",
				tokenHash: "hash:token-4",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(result).toEqual({ ok: "owner_mismatch" });
		});
	});

	describe("reports", () => {
		test("stores a report, its connectivity rows and the observed address", async () => {
			const id = await enroll();
			const result = await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: "1.1.1.1",
			});
			expect(result).toEqual({ ok: true, duplicate: false, received_at: NOW });
			const row = await repo.getById(id);
			// Liveness follows the newest sample time, not the receipt time.
			expect(row).toMatchObject({
				last_seen_at: report(uuid(1)).finished_at,
				public_ip: "1.1.1.1",
			});
			const history = await repo.connectivity(id, NOW - 60, NOW, 10);
			expect(history.map((target) => target.server_id)).toEqual(["srv-01", "srv-02"]);
			expect(history[0]?.data[0]).toMatchObject({
				received: 2,
				rtt_avg_ms: 9,
				rtt_min_ms: 8,
				rtt_max_ms: 10,
				status: "partial",
			});
			expect(history[1]?.data[0]).toMatchObject({ rtt_avg_ms: null, status: "timeout" });
		});

		test("does not overwrite a recorded public address with null", async () => {
			const id = await enroll();
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: "1.1.1.1",
			});
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(2)),
				bodyHash: "body-2",
				receivedAt: NOW + 600,
				publicIp: null,
			});
			expect(await repo.getById(id)).toMatchObject({ public_ip: "1.1.1.1" });
		});

		test("a repeated report is idempotent and returns the original result", async () => {
			const id = await enroll();
			const first = await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			const second = await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW + 30,
				publicIp: null,
			});
			expect(first).toEqual({ ok: true, duplicate: false, received_at: NOW });
			expect(second).toEqual({ ok: true, duplicate: true, received_at: NOW });
			expect(await repo.metrics(id, NOW - 60, NOW + 60, 10, 0)).toHaveLength(1);
		});

		test("the same report id with different content is a conflict", async () => {
			const id = await enroll();
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			const conflict = await repo.insertReport({
				workstationId: id,
				report: { ...report(uuid(1)), hostname: "other-host" },
				bodyHash: "body-2",
				receivedAt: NOW + 30,
				publicIp: null,
			});
			expect(conflict).toEqual({ ok: "conflict" });
			expect(await repo.get(id)).toMatchObject({ last_seen_at: report(uuid(1)).finished_at });
		});

		test("a duplicate report never refreshes liveness, the public address or the latest snapshot", async () => {
			const id = await enroll();
			const first = report(uuid(1), NOW - 100);
			await repo.insertReport({
				workstationId: id,
				report: first,
				bodyHash: "body-1",
				receivedAt: NOW - 100,
				publicIp: "8.8.8.8",
			});
			const before = await repo.get(id);
			// A retry may arrive from a different observed address and much later.
			const duplicate = await repo.insertReport({
				workstationId: id,
				report: first,
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: "1.1.1.1",
			});
			expect(duplicate).toEqual({ ok: true, duplicate: true, received_at: NOW - 100 });
			const after = await repo.get(id);
			expect(after).toEqual(before);
			expect(after).toMatchObject({
				last_seen_at: first.finished_at,
				public_ip: "8.8.8.8",
				latest_report: { report_id: uuid(1) },
			});
		});

		test("a late older sample stays in history without becoming latest or moving liveness", async () => {
			const id = await enroll();
			const newer = report(uuid(2), NOW - 10);
			await repo.insertReport({
				workstationId: id,
				report: newer,
				bodyHash: "body-new",
				receivedAt: NOW - 10,
				publicIp: "8.8.8.8",
			});
			const before = await repo.get(id);
			const older = report(uuid(1), NOW - 600);
			const late = await repo.insertReport({
				workstationId: id,
				report: older,
				bodyHash: "body-old",
				receivedAt: NOW,
				publicIp: "1.1.1.1",
			});
			expect(late).toEqual({ ok: true, duplicate: false, received_at: NOW });
			const after = await repo.get(id);
			expect(after).toMatchObject({
				last_seen_at: newer.finished_at,
				public_ip: "8.8.8.8",
				latest_report: { report_id: uuid(2) },
			});
			expect(after?.last_seen_at).toBe(before?.last_seen_at);
			expect(after?.public_ip).toBe(before?.public_ip);
			const history = await repo.metrics(id, NOW - 3_600, NOW, 10, 0);
			expect(history.map((point) => point.received_at).sort()).toEqual([NOW - 10, NOW].sort());
			// Latest selection is by sample time, then receipt time, then report id.
			const latestAgain = await repo.get(id);
			expect(latestAgain?.latest_report?.report_id).toBe(uuid(2));
		});

		test("a same-second duplicate and a later sample resolve deterministically", async () => {
			const id = await enroll();
			const sample = report(uuid(1), NOW);
			expect(
				await repo.insertReport({
					workstationId: id,
					report: sample,
					bodyHash: "body-1",
					receivedAt: NOW,
					publicIp: "8.8.8.8",
				}),
			).toEqual({ ok: true, duplicate: false, received_at: NOW });
			expect(
				await repo.insertReport({
					workstationId: id,
					report: sample,
					bodyHash: "body-1",
					receivedAt: NOW,
					publicIp: "1.1.1.1",
				}),
			).toEqual({ ok: true, duplicate: true, received_at: NOW });
			const stored = await repo.get(id);
			expect(stored).toMatchObject({ public_ip: "8.8.8.8", latest_report: { report_id: uuid(1) } });
			expect(stored?.last_seen_at).toBe(sample.finished_at);
		});

		test("a disabled workstation accepts no reports", async () => {
			const id = await enroll();
			await db.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?").bind(id).run();
			const result = await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			expect(result).toEqual({ ok: "disabled" });
			expect(await repo.metrics(id, NOW - 60, NOW + 60, 10, 0)).toEqual([]);
		});

		test("report IDs are scoped per workstation, so two workstations may share one", async () => {
			const first = await enroll();
			await issueCode("code-2", { installationId: uuid(9) });
			const second = await repo.exchange({
				codeHash: "hash:code-2",
				installationId: uuid(9),
				owner: OWNER,
				name: "Second",
				tokenHash: "hash:token-2",
				tokenPrefix: "hash:token",
				now: NOW,
			});
			if (!second.ok) throw new Error("second enrollment failed");
			await repo.insertReport({
				workstationId: first,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			const scoped = await repo.insertReport({
				workstationId: second.row.id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			expect(scoped).toEqual({ ok: true, duplicate: false, received_at: NOW });
			expect(await repo.metrics(first, NOW - 60, NOW + 60, 10, 0)).toHaveLength(1);
			expect(await repo.metrics(second.row.id, NOW - 60, NOW + 60, 10, 0)).toHaveLength(1);
		});
	});

	describe("reads", () => {
		test("list and get include the latest report and disabled state", async () => {
			const id = await enroll();
			expect(await repo.get(id)).toMatchObject({ id, latest_report: null, disabled: false });
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1), NOW - 700),
				bodyHash: "body-1",
				receivedAt: NOW - 700,
				publicIp: null,
			});
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(2), NOW - 100),
				bodyHash: "body-2",
				receivedAt: NOW - 100,
				publicIp: null,
			});
			const latest = await repo.get(id);
			expect(latest?.latest_report?.report_id).toBe(uuid(2));
			expect(latest?.latest_report?.received_at).toBe(NOW - 100);
			expect(await repo.list()).toHaveLength(1);
			expect(await repo.get(uuid(77))).toBeNull();
		});

		test("metrics are windowed, paged and ordered oldest first", async () => {
			const id = await enroll();
			for (let index = 1; index <= 5; index++) {
				await repo.insertReport({
					workstationId: id,
					report: report(uuid(index), NOW - index * 600),
					bodyHash: `body-${index}`,
					receivedAt: NOW - index * 600,
					publicIp: null,
				});
			}
			const page = await repo.metrics(id, NOW - 3_600, NOW, 2, 0);
			expect(page.map((point) => point.received_at)).toEqual([NOW - 1200, NOW - 600]);
			expect(page[1]).toMatchObject({
				cpu_usage_pct: 12.5,
				mem_used_pct: 66.7,
				uptime_seconds: 86_400,
			});
			const next = await repo.metrics(id, NOW - 3_600, NOW, 2, 2);
			expect(next.map((point) => point.received_at)).toEqual([NOW - 2400, NOW - 1800]);
			expect(await repo.metrics(id, NOW - 600, NOW - 600, 10, 0)).toHaveLength(1);
		});

		test("connectivity history keeps only the newest samples per target", async () => {
			const id = await enroll();
			for (let index = 1; index <= 3; index++) {
				await repo.insertReport({
					workstationId: id,
					report: report(uuid(index), NOW - index * 600),
					bodyHash: `body-${index}`,
					receivedAt: NOW - index * 600,
					publicIp: null,
				});
			}
			const limited = await repo.connectivity(id, NOW - 3_600, NOW, 2);
			expect(limited).toHaveLength(2);
			expect(limited[0]?.data.map((point) => point.received_at)).toEqual([NOW - 1200, NOW - 600]);
			expect(limited[0]?.address).toBe("8.8.8.8");
			expect(limited[0]?.family).toBe(4);
		});
	});

	describe("rate, targets and retention", () => {
		test("counts requests inside a sliding window bucket", async () => {
			expect(await repo.rate("reports:one", 2, 60, NOW)).toBe(true);
			expect(await repo.rate("reports:one", 2, 60, NOW + 1)).toBe(true);
			expect(await repo.rate("reports:one", 2, 60, NOW + 2)).toBe(false);
			expect(await repo.rate("reports:one", 2, 60, NOW + 60)).toBe(true);
		});

		test("lists only active servers with public addresses", async () => {
			const insert = (hostId: string, publicIp: string | null, active = 1) =>
				db
					.prepare(
						"INSERT INTO hosts(host_id, hostname, last_seen, public_ip, is_active) VALUES (?,?,?,?,?)",
					)
					.bind(hostId, `${hostId}.example.com`, NOW, publicIp, active)
					.run();
			await insert("srv-public", "8.8.8.8");
			await insert("srv-v6", "2001:4860:4860::8888");
			await insert("srv-private", "10.0.0.5");
			await insert("srv-none", null);
			await insert("srv-retired", "9.9.9.9", 0);
			// Documentation, benchmark and bracket-injection literals must be dropped
			// even though they look plausible, while the good neighbours survive.
			await insert("srv-docs", "203.0.113.10");
			await insert("srv-bench", "198.18.0.1");
			await insert("srv-injected", "2001:4860:4860::8888]/foo");
			await insert("srv-injected-query", "2001:4860:4860::8888]?q=x");
			// Non-global-unicast and special-purpose IPv6 ranges never become targets.
			await insert("srv-site-local", "fec0::1");
			await insert("srv-discard", "100::1");
			await insert("srv-benchmark", "2001:2::1");
			await insert("srv-outside-unicast", "4000::1");
			await insert("srv-6to4", "2002:c000:201::1");
			await insert("srv-teredo", "2001::1");
			const targets = await repo.listServerTargets([
				"srv-public",
				"srv-v6",
				"srv-private",
				"srv-none",
				"srv-retired",
				"srv-docs",
				"srv-bench",
				"srv-injected",
				"srv-injected-query",
				"srv-site-local",
				"srv-discard",
				"srv-benchmark",
				"srv-outside-unicast",
				"srv-6to4",
				"srv-teredo",
				"srv-unknown",
			]);
			expect(targets).toEqual([
				{
					server_id: "srv-public",
					name: "srv-public.example.com",
					address: "8.8.8.8",
					family: 4,
				},
				{
					server_id: "srv-v6",
					name: "srv-v6.example.com",
					address: "2001:4860:4860::8888",
					family: 6,
				},
			]);
			expect(await repo.listServerTargets([])).toEqual([]);
		});

		test("purges expired history, codes and rate windows", async () => {
			const id = await enroll();
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW - 40 * 86_400,
				publicIp: null,
			});
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(2)),
				bodyHash: "body-2",
				receivedAt: NOW,
				publicIp: null,
			});
			await repo.rate("reports:one", 2, 60, NOW - 40 * 86_400);
			await repo.purgeOlderThan(NOW - 30 * 86_400, NOW + 400);
			expect(await repo.getCode("hash:code-1")).toBeNull();
			expect((await repo.metrics(id, 0, NOW, 10, 0)).map((p) => p.received_at)).toEqual([NOW]);
		});

		test("revoking the presented credential keeps the workstation, history and re-login identity", async () => {
			const id = await enroll();
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			expect(await repo.revokeKey(id, "hash:token-1", NOW + 5)).toBe(true);
			const revoked = await repo.getById(id);
			expect(revoked).toMatchObject({ id, revoked_at: NOW + 5, version: 2 });
			expect(await repo.revokeKey(id, "hash:token-1", NOW + 6)).toBe(false);
			expect(await repo.revokeKey(id, "hash:other", NOW + 6)).toBe(false);
			expect(await repo.metrics(id, NOW - 60, NOW + 60, 10, 0)).toHaveLength(1);
			await issueCode("code-2");
			const relogin = await repo.exchange({
				codeHash: "hash:code-2",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-2",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(relogin.ok).toBe(true);
			if (!relogin.ok) return;
			expect(relogin.row.id).toBe(id);
			expect(relogin.row.revoked_at).toBeNull();
			expect(await repo.findByTokenHash("hash:token-2")).toMatchObject({ id, revoked_at: null });
		});

		test("delete and revoke expire pending codes for the installation", async () => {
			const id = await enroll();
			await issueCode("pending-code", { installationId: INSTALLATION });
			await issueCode("pending-other", { installationId: uuid(9) });
			expect(await repo.revokeKey(id, "hash:token-1", NOW + 5)).toBe(true);
			expect((await repo.getCode("hash:pending-code"))?.consumed_at).toBe(NOW + 5);
			expect((await repo.getCode("hash:pending-other"))?.consumed_at).toBeNull();
			// A new authorization after revoke is allowed and clears the marker.
			await issueCode("fresh-code");
			const relogin = await repo.exchange({
				codeHash: "hash:fresh-code",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-2",
				tokenPrefix: "hash:token",
				now: NOW + 60,
			});
			expect(relogin.ok).toBe(true);
			if (!relogin.ok) return;
			expect(relogin.row.revoked_at).toBeNull();

			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			await issueCode("after-delete");
			expect(await repo.delete(id, INSTALLATION)).toBe(true);
			expect((await repo.getCode("hash:after-delete"))?.consumed_at).not.toBeNull();
			const recreated = await repo.exchange({
				codeHash: "hash:after-delete",
				installationId: INSTALLATION,
				owner: OWNER,
				name: "Li MacBook",
				tokenHash: "hash:token-3",
				tokenPrefix: "hash:token",
				now: NOW + 120,
			});
			expect(recreated).toEqual({ ok: "code_invalid" });
		});

		test("delete removes the workstation and cascades history", async () => {
			const id = await enroll();
			await repo.insertReport({
				workstationId: id,
				report: report(uuid(1)),
				bodyHash: "body-1",
				receivedAt: NOW,
				publicIp: null,
			});
			expect(await repo.delete(id, INSTALLATION)).toBe(true);
			expect(await repo.getById(id)).toBeNull();
			expect(await repo.findByTokenHash("hash:token-1")).toBeNull();
			expect(await repo.connectivity(id, 0, NOW, 10)).toEqual([]);
			expect(await repo.delete(id, INSTALLATION)).toBe(false);
		});
	});
});
