import { describe, expect, test } from "bun:test";
import { SLOTS, verifyQualityGate } from "./z1-gate.mjs";

const sha = "a".repeat(40);
const ready = () =>
	Object.fromEntries(
		SLOTS.filter((slot) => slot.id !== "Z1").map((slot) => [
			slot.job,
			{ result: "success", outputs: { "tested-sha": sha } },
		]),
	);

describe("Z1 quality gate", () => {
	test("accepts every implemented slot at one SHA", () => {
		const result = verifyQualityGate(ready());
		expect(result.ok).toBe(true);
		expect(result.testedSha).toBe(sha);
	});

	test("rejects a failed implemented slot", () => {
		const needs = ready();
		needs["s2-lint"].result = "failure";
		expect(verifyQualityGate(needs).errors).toContain("S2 is impl but finished with 'failure'");
	});

	test("rejects an implemented slot that was skipped", () => {
		const needs = ready();
		needs["l4-e2e"].result = "skipped";
		expect(verifyQualityGate(needs).ok).toBe(false);
	});

	test("rejects a missing slot", () => {
		const needs = ready();
		delete needs["p1-package"];
		expect(verifyQualityGate(needs).errors).toContain("P1 is missing from Z1 needs");
	});

	test("rejects SHA mismatch", () => {
		const needs = ready();
		needs["g2-dependencies"].outputs["tested-sha"] = "b".repeat(40);
		expect(verifyQualityGate(needs).ok).toBe(false);
	});

	test("accepts an explicitly na slot only when skipped", () => {
		const slots = SLOTS.map((slot) => (slot.id === "L4" ? { ...slot, status: "na" } : slot));
		const needs = ready();
		needs["l4-e2e"] = { result: "skipped", outputs: {} };
		expect(verifyQualityGate(needs, { slots }).ok).toBe(true);
		needs["l4-e2e"] = { result: "success", outputs: { "tested-sha": sha } };
		expect(verifyQualityGate(needs, { slots }).ok).toBe(false);
	});

	test("rejects an undeclared blocking job", () => {
		const needs = ready();
		needs["extra-job"] = { result: "success", outputs: {} };
		expect(verifyQualityGate(needs).ok).toBe(false);
	});

	test("checks declared extra required jobs", () => {
		const needs = ready();
		needs["extra-job"] = { result: "failure", outputs: {} };
		expect(verifyQualityGate(needs, { extraRequired: ["extra-job"] }).ok).toBe(false);
	});
});
