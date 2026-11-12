import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pushRange } from "./push-range";

const zero = "0".repeat(40);
const oid = (digit: string) => digit.repeat(40);

describe("pushRange", () => {
	test("new tag scans commits not reachable from the target remote", () => {
		expect(pushRange(oid("a"), zero, "origin")).toBe(`${oid("a")} --not --remotes=origin`);
	});

	test("new branch uses the actual remote name", () => {
		expect(pushRange(oid("b"), zero, "upstream")).toBe(`${oid("b")} --not --remotes=upstream`);
	});

	test("moved tag scans from the previous remote OID", () => {
		expect(pushRange(oid("c"), oid("d"), "origin")).toBe(`${oid("d")}..${oid("c")}`);
	});

	test("existing branch scans the pushed range", () => {
		expect(pushRange(oid("e"), oid("f"), "origin")).toBe(`${oid("f")}..${oid("e")}`);
	});

	test("new tag range includes earlier commits that are not on the remote", () => {
		const root = mkdtempSync(join(tmpdir(), "bat-push-range-"));
		try {
			const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
			git("init", "--quiet");
			git("config", "user.email", "probe@example.invalid");
			git("config", "user.name", "Probe");
			git("init", "--bare", "--quiet", "remote.git");
			git("remote", "add", "origin", "./remote.git");

			writeFileSync(join(root, "file.txt"), "clean\n");
			git("add", "file.txt");
			git("commit", "--quiet", "-m", "clean base");
			const base = git("rev-parse", "HEAD").trim();
			git("push", "--quiet", "origin", "HEAD:main");

			writeFileSync(join(root, "file.txt"), "secret\n");
			git("commit", "--quiet", "-am", "add secret");
			const secret = git("rev-parse", "HEAD").trim();

			writeFileSync(join(root, "file.txt"), "clean\n");
			git("commit", "--quiet", "-am", "remove secret");
			const tip = git("rev-parse", "HEAD").trim();
			git("tag", "v1.0.0");

			const range = pushRange(tip, zero, "origin");
			const commits = git("rev-list", ...range.split(" "))
				.trim()
				.split("\n");
			expect(commits).toContain(tip);
			expect(commits).toContain(secret);
			expect(commits).not.toContain(base);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
