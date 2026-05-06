// Tests for agents service — upsertAgent atomic ON CONFLICT behavior
import { describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import { createAgent, getAgent, upsertAgent } from "./agents.js";

describe("upsertAgent", () => {
	test("creates new agent when no conflict", async () => {
		const db = createMockD1();
		const result = await upsertAgent(
			db,
			{
				source_key: "src_new",
				match_key: "mk_new",
				nickname: "fresh",
				status: "running",
			},
			{
				nickname: "fresh",
				status: "running",
			},
		);
		expect(result.created).toBe(true);
		expect(result.id).toMatch(/^agt_/);

		const agent = await getAgent(db, result.id);
		expect(agent?.nickname).toBe("fresh");
		expect(agent?.status).toBe("running");
	});

	test("updates existing agent on duplicate source_key + match_key", async () => {
		const db = createMockD1();
		// First insert
		const r1 = await upsertAgent(
			db,
			{ source_key: "src_dup", match_key: "mk_dup", nickname: "first" },
			{ nickname: "first" },
		);
		expect(r1.created).toBe(true);

		// Second call with same keys — ON CONFLICT fires
		const r2 = await upsertAgent(
			db,
			{ source_key: "src_dup", match_key: "mk_dup", nickname: "second" },
			{ nickname: "second" },
		);
		expect(r2.created).toBe(false);
		expect(r2.id).toBe(r1.id);

		const agent = await getAgent(db, r2.id);
		expect(agent?.nickname).toBe("second");
	});

	test("ON CONFLICT applies only provided updateFields (field presence)", async () => {
		const db = createMockD1();
		// Create with multiple fields
		const r1 = await upsertAgent(
			db,
			{
				source_key: "src_presence",
				match_key: "mk_presence",
				nickname: "original",
				role: "worker",
				status: "running",
			},
			{
				nickname: "original",
				role: "worker",
				status: "running",
			},
		);
		expect(r1.created).toBe(true);

		// Upsert with only nickname in updateFields — role and status should be untouched
		const r2 = await upsertAgent(
			db,
			{ source_key: "src_presence", match_key: "mk_presence", nickname: "updated" },
			{ nickname: "updated" }, // role and status are undefined → not in DO UPDATE SET
		);
		expect(r2.created).toBe(false);
		expect(r2.id).toBe(r1.id);

		const agent = await getAgent(db, r2.id);
		expect(agent?.nickname).toBe("updated");
		expect(agent?.role).toBe("worker"); // preserved
		expect(agent?.status).toBe("running"); // preserved
	});

	test("ON CONFLICT clears nullable field with explicit null", async () => {
		const db = createMockD1();
		// Create with nickname
		const r1 = await upsertAgent(
			db,
			{
				source_key: "src_null",
				match_key: "mk_null",
				nickname: "has-name",
				role: "worker",
			},
			{ nickname: "has-name", role: "worker" },
		);
		expect(r1.created).toBe(true);

		// Upsert with nickname=null to clear it, role=undefined to preserve
		const r2 = await upsertAgent(
			db,
			{ source_key: "src_null", match_key: "mk_null" },
			{ nickname: null, role: undefined },
		);
		expect(r2.created).toBe(false);
		expect(r2.id).toBe(r1.id);

		const agent = await getAgent(db, r2.id);
		expect(agent?.nickname).toBeNull(); // explicitly cleared
		expect(agent?.role).toBe("worker"); // untouched
	});

	test("duplicate source_key + match_key via createAgent hits UNIQUE constraint", async () => {
		const db = createMockD1();

		await createAgent(db, {
			id: "agt_first",
			source_key: "src_uniq",
			match_key: "mk_uniq",
			nickname: "first",
		});

		// Direct createAgent with same keys must throw UNIQUE
		let caught = false;
		try {
			await createAgent(db, {
				id: "agt_second",
				source_key: "src_uniq",
				match_key: "mk_uniq",
				nickname: "second",
			});
		} catch (err: unknown) {
			caught = true;
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toContain("UNIQUE");
		}
		expect(caught).toBe(true);
	});

	test("upsertAgent handles pre-existing row (inserted externally)", async () => {
		const db = createMockD1();

		// Simulate a row that already exists (e.g. created by another process)
		await createAgent(db, {
			id: "agt_external",
			source_key: "src_ext",
			match_key: "mk_ext",
			nickname: "external",
			status: "unknown",
		});

		// upsertAgent should detect conflict atomically and apply updates
		const result = await upsertAgent(
			db,
			{ source_key: "src_ext", match_key: "mk_ext", nickname: "updated" },
			{ nickname: "updated", status: "running" },
		);
		expect(result.created).toBe(false);
		expect(result.id).toBe("agt_external");

		const agent = await getAgent(db, result.id);
		expect(agent?.nickname).toBe("updated");
		expect(agent?.status).toBe("running");
	});

	test("upsertAgent with no updateFields (empty DO UPDATE) still returns existing id", async () => {
		const db = createMockD1();

		const r1 = await upsertAgent(
			db,
			{ source_key: "src_noop", match_key: "mk_noop", nickname: "original" },
			{ nickname: "original" },
		);
		expect(r1.created).toBe(true);

		// Second call with no updateFields — row untouched but id returned
		const r2 = await upsertAgent(
			db,
			{ source_key: "src_noop", match_key: "mk_noop" },
			{}, // no fields to update
		);
		expect(r2.created).toBe(false);
		expect(r2.id).toBe(r1.id);

		const agent = await getAgent(db, r2.id);
		expect(agent?.nickname).toBe("original"); // unchanged
	});
});
