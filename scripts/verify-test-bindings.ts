#!/usr/bin/env bun
/**
 * D1 Isolation Guard — validates that [env.test] bindings use -test suffixed resources.
 * Run before E2E to catch accidental production binding.
 */
import { readFileSync } from "node:fs";

const toml = readFileSync("packages/worker/wrangler.toml", "utf-8");

// Extract [env.test] section (including all env.test.* subsections like env.test.d1_databases)
const testSection = toml.match(/\[env\.test\][\s\S]*?(?=\n\[(?!\[?env\.test[\].])|$)/)?.[0];
if (!testSection) {
	console.error("✘ No [env.test] section found in wrangler.toml");
	process.exit(1);
}

// Check all database_name values contain -test
const dbNames = [...testSection.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
const bad = dbNames.filter((name) => !name.endsWith("-test"));

if (bad.length > 0) {
	console.error(`✘ Test bindings without -test suffix: ${bad.join(", ")}`);
	process.exit(1);
}

console.info(`✔ All test bindings verified: ${dbNames.join(", ")}`);
