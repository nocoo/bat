#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const markerPath = join(root, ".cache/bat/install-state.json");

const manifestPaths = (base) => {
	const paths = ["package.json", "bun.lock", "probe/Cargo.lock"];
	for (const entry of readdirSync(join(base, "packages"), { withFileTypes: true })) {
		if (entry.isDirectory() && existsSync(join(base, "packages", entry.name, "package.json"))) {
			paths.push(join("packages", entry.name, "package.json"));
		}
	}
	return paths.sort();
};

const digestFor = (base) => {
	const hash = createHash("sha256");
	for (const path of manifestPaths(base)) {
		hash.update(path);
		hash.update("\0");
		hash.update(readFileSync(join(base, path)));
		hash.update("\0");
	}
	return hash.digest("hex");
};

const write = () => {
	mkdirSync(join(root, ".cache/bat"), { recursive: true });
	writeFileSync(markerPath, `${JSON.stringify({ digest: digestFor(root) }, null, 2)}\n`);
	console.log(`wrote ${markerPath}`);
};

const check = (snapshot) => {
	if (!snapshot) throw new Error("usage: install-state.mjs --check <snapshot>");
	if (!existsSync(markerPath)) {
		throw new Error(`missing ${markerPath}; run bun install --frozen-lockfile to refresh it`);
	}
	if (!existsSync(join(root, "node_modules"))) {
		throw new Error("node_modules is missing; run bun install --frozen-lockfile");
	}
	const expected = digestFor(snapshot);
	const actual = JSON.parse(readFileSync(markerPath, "utf8"));
	if (actual.digest !== expected) {
		throw new Error("dependency manifest or lockfile drift; run bun install --frozen-lockfile");
	}
};

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args[0] === "--write") write();
	else if (args[0] === "--check") check(args[1]);
	else {
		console.error("usage: install-state.mjs --write | --check <snapshot>");
		process.exit(2);
	}
}
