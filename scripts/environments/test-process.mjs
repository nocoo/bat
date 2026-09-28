import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function startTestEnvironment(dataset = "focused") {
	const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
	const directory = mkdtempSync(join(tmpdir(), "bat-e2e-"));
	const ready = join(directory, "ready.json");
	const fd = openSync(join(directory, "launcher.log"), "w");
	const child = spawn(
		"bun",
		[
			join(root, "scripts/environments/launcher.mjs"),
			"--automated",
			"--built",
			"--port",
			"0",
			"--dataset",
			dataset,
			"--ready-file",
			ready,
		],
		{ cwd: root, env: process.env, stdio: ["ignore", fd, fd] },
	);
	closeSync(fd);
	const close = async () => {
		child.kill();
		await Promise.race([
			new Promise((r) => child.once("exit", r)),
			new Promise((r) => setTimeout(r, 10000)),
		]);
		if (child.exitCode === null && child.signalCode === null)
			throw new Error(`E2E cleanup timeout; evidence: ${directory}`);
		rmSync(directory, { recursive: true });
	};
	for (let attempt = 0; attempt < 240; attempt++) {
		if (existsSync(ready)) return { ...JSON.parse(readFileSync(ready, "utf8")), close };
		if (child.exitCode !== null)
			throw new Error(
				`E2E startup failed: ${readFileSync(join(directory, "launcher.log"), "utf8")}`,
			);
		await new Promise((r) => setTimeout(r, 250));
	}
	child.kill();
	throw new Error(`E2E startup timed out; evidence: ${directory}`);
}
