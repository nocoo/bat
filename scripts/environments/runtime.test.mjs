import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { heldStore, localConfig, workerRoot } from "./runtime.mjs";

const identity = {
	publicKey: { kid: "test", alg: "RS256" },
	privateKey: {},
	writeKey: "write",
	readKey: "read",
	connectKey: "connect",
};

describe("heldStore", () => {
	test("no lock means no holder", () => {
		const path = mkdtempSync(join(tmpdir(), "bat-held-"));
		expect(heldStore(path)).toBeNull();
		rmSync(path, { recursive: true });
	});

	test("a lock held by a dead or unrelated pid is stale", () => {
		const path = mkdtempSync(join(tmpdir(), "bat-held-"));
		writeFileSync(join(path, "running.lock"), "1"); // pid 1 is not a bat process
		expect(heldStore(path)).toBeNull();
		rmSync(path, { recursive: true });
	});

	test("the launcher's own lock is not a foreign holder", () => {
		const path = mkdtempSync(join(tmpdir(), "bat-held-"));
		writeFileSync(join(path, "running.lock"), String(process.pid));
		expect(heldStore(path)).toBeNull();
		rmSync(path, { recursive: true });
	});

	test("a lock held by another live bat process refuses reuse", async () => {
		const path = mkdtempSync(join(tmpdir(), "bat-held-"));
		const child = spawn("node", ["-e", "setTimeout(() => {}, 5000)", "launcher.mjs"], {
			stdio: "ignore",
		});
		try {
			await new Promise((resolve) => setTimeout(resolve, 300));
			writeFileSync(join(path, "running.lock"), String(child.pid));
			// Ask from another process's point of view: the child belongs to this
			// test's own tree, so a real launcher would only see it as foreign.
			const holder = heldStore(path, -1);
			expect(holder).toContain(String(child.pid));
		} finally {
			child.kill("SIGKILL");
			rmSync(path, { recursive: true });
		}
	});

	test("an orphan holding the state directory refuses reuse", () => {
		const path = mkdtempSync(join(tmpdir(), "bat-held-"));
		mkdirSync(join(path, "state"), { recursive: true });
		writeFileSync(join(path, "state", "keeper"), "held");
		writeFileSync(join(path, "running.lock"), "1"); // launcher is gone
		const handle = openSync(join(path, "state", "keeper"), "r");
		try {
			// This process holds the file; pretend the caller is a different one.
			const holder = heldStore(path, -1);
			// lsof is expected on dev machines and CI runners; without it the
			// check degrades to trusting the dead-pid lock.
			if (spawnSync("which", ["lsof"]).status === 0) expect(holder).toContain("holding");
			else expect(holder).toBeNull();
		} finally {
			closeSync(handle);
			rmSync(path, { recursive: true });
		}
	});
});

describe("localConfig instance-owned assets", () => {
	test.if(existsSync(join(workerRoot, "static", "index.html")))(
		"copies the built assets into the instance and points the config at the copy",
		() => {
			const path = mkdtempSync(join(tmpdir(), "bat-config-"));
			const config = localConfig(path, identity, "e2e-11111111-1111-4111-8111-111111111111");
			const stored = JSON.parse(readFileSync(join(path, "wrangler.json"), "utf8"));
			expect(stored.assets.directory).toBe(join(path, "static"));
			expect(config.assets.directory).toBe(join(path, "static"));
			// A rebuild rewrites packages/worker/static, never this copy.
			expect(stored.assets.directory).not.toContain(join(workerRoot, "static"));
			expect(existsSync(join(path, "static", "index.html"))).toBe(true);
			expect(readFileSync(join(path, "static", "index.html"), "utf8")).toBe(
				readFileSync(join(workerRoot, "static", "index.html"), "utf8"),
			);
			rmSync(path, { recursive: true });
		},
	);
});
