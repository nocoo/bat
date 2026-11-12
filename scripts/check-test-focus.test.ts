import { expect, test } from "bun:test";

const blocked =
	/\b(?:describe|it|test|suite)\.(?:only|skip|todo)\s*\(|\b(?:fdescribe|fit|xit|xtest)\s*\(/;

test("detects focused and skipped TypeScript tests", () => {
	for (const line of [
		["test", ".only('x', () => {})"].join(""),
		["describe", ".skip('x', () => {})"].join(""),
		["f", "it('x', () => {})"].join(""),
	]) {
		expect(blocked.test(line)).toBe(true);
	}
});

test("allows ordinary tests and Rust iterator skips", () => {
	for (const line of ["test('x', () => {})", "lines.skip(1)", "values.iter().skip(1)"]) {
		expect(blocked.test(line)).toBe(false);
	}
});
