import type { HostTag, TagItem } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { createTagAffordance, suggestTags } from "./host-tags";

const tag = (id: number, name: string, color = 0): TagItem => ({
	id,
	name,
	color,
	host_count: 0,
});
const ht = (id: number, name: string, color = 0): HostTag => ({ id, name, color });

describe("suggestTags", () => {
	test("empty query → all unattached, alpha-sorted, limited", () => {
		const all = [tag(1, "zeta"), tag(2, "alpha"), tag(3, "mike")];
		const out = suggestTags(all, [], "");
		expect(out.map((s) => s.tag.name)).toEqual(["alpha", "mike", "zeta"]);
	});

	test("excludes tags already on host", () => {
		const all = [tag(1, "prod"), tag(2, "dev")];
		const out = suggestTags(all, [ht(1, "prod")], "");
		expect(out.map((s) => s.tag.id)).toEqual([2]);
	});

	test("substring match — prefix beats mid-string", () => {
		const all = [tag(1, "production"), tag(2, "reproduce"), tag(3, "prober")];
		const out = suggestTags(all, [], "pro");
		expect(out.map((s) => s.tag.name)).toEqual(["prober", "production", "reproduce"]);
	});

	test("case-insensitive", () => {
		const out = suggestTags([tag(1, "PROD")], [], "pro");
		expect(out).toHaveLength(1);
	});

	test("non-matching query → empty", () => {
		expect(suggestTags([tag(1, "alpha")], [], "zzz")).toEqual([]);
	});

	test("respects limit", () => {
		const all = Array.from({ length: 20 }, (_, i) => tag(i, `t${i.toString().padStart(2, "0")}`));
		expect(suggestTags(all, [], "", 5)).toHaveLength(5);
	});
});

describe("createTagAffordance", () => {
	test("empty query → none", () => {
		expect(createTagAffordance([], "")).toEqual({ kind: "none" });
		expect(createTagAffordance([], "   ")).toEqual({ kind: "none" });
	});

	test("new name → create", () => {
		expect(createTagAffordance([tag(1, "prod")], "staging")).toEqual({
			kind: "create",
			name: "staging",
		});
	});

	test("trims whitespace before comparing/creating", () => {
		expect(createTagAffordance([], "  new  ")).toEqual({ kind: "create", name: "new" });
	});

	test("name already exists (case-insensitive) → exists", () => {
		expect(createTagAffordance([tag(7, "Prod")], "prod")).toEqual({ kind: "exists", tagId: 7 });
	});

	test("over 32 chars → tooLong", () => {
		expect(createTagAffordance([], "x".repeat(33))).toEqual({ kind: "tooLong" });
	});
});
