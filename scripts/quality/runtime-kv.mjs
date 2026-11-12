#!/usr/bin/env bun
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRuntime, isolatedEnvironment } from "../environments/runtime.mjs";

const root = resolve(import.meta.dirname, "../..");
const wrangler = join(root, "packages/worker/node_modules/.bin/wrangler");
if (!existsSync(wrangler)) throw new Error("Wrangler is not installed");

const runtime = await createRuntime({ mode: "e2e", dataset: "empty" });
try {
	const marker = await runtime.sql("SELECT value FROM _test_marker WHERE key='env';");
	assert.match(marker, /test/);
	assert.match(runtime.base, /^http:\/\/127\.0\.0\.1:/);

	const token = `bat_cli_${randomBytes(24).toString("base64url")}`;
	const hash = createHash("sha256").update(token).digest("hex");
	await runtime.sql(
		`INSERT INTO cli_tokens (token_hash,label,scope) VALUES ('${hash}','l2-runtime','assets');`,
	);

	const response = await fetch(`${runtime.base}/api/assets`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10_000),
	});
	assert.equal(response.status, 200, "CLI token request failed through real D1/KV");

	const output = execFileSync(
		wrangler,
		[
			"kv",
			"key",
			"list",
			"--binding",
			"BAT_KV",
			"--local",
			"--persist-to",
			join(runtime.path, "state"),
			"--config",
			join(runtime.path, "wrangler.json"),
		],
		{
			cwd: join(root, "packages/worker"),
			encoding: "utf8",
			env: isolatedEnvironment(),
		},
	);
	const keys = JSON.parse(output);
	assert.ok(
		keys.some((entry) => entry.name === `bat:clitoken:${hash}`),
		"the Worker did not persist the CLI token cache through the real KV binding",
	);
	console.log("PASS: real Wrangler D1 marker and KV write");
} finally {
	await runtime.close();
}
