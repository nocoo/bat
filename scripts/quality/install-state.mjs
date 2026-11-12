#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const markerPath = join(root, ".cache/bat/install-state.json");

const declaredBun = (base) => {
	const packageManager = JSON.parse(
		readFileSync(join(base, "package.json"), "utf8"),
	).packageManager;
	if (typeof packageManager !== "string" || !packageManager.startsWith("bun@")) {
		throw new Error("package.json must declare a bun packageManager version");
	}
	return packageManager.slice("bun@".length);
};

const manifestPaths = (base) => {
	const paths = ["package.json", "bun.lock", "probe/Cargo.lock"];
	for (const entry of readdirSync(join(base, "packages"), { withFileTypes: true })) {
		if (entry.isDirectory() && existsSync(join(base, "packages", entry.name, "package.json"))) {
			paths.push(join("packages", entry.name, "package.json"));
		}
	}
	return paths.sort();
};

const stateFor = (base) => {
	const hash = createHash("sha256");
	for (const path of manifestPaths(base)) {
		hash.update(path);
		hash.update("\0");
		hash.update(readFileSync(join(base, path)));
		hash.update("\0");
	}
	const bun = declaredBun(base);
	if (Bun.version !== bun) {
		throw new Error(
			`Bun toolchain drift: package.json declares ${bun}, current is ${Bun.version}; use the declared Bun`,
		);
	}
	return {
		digest: hash.digest("hex"),
		bun,
	};
};

const write = () => {
	mkdirSync(join(root, ".cache/bat"), { recursive: true });
	writeFileSync(markerPath, `${JSON.stringify(stateFor(root), null, 2)}\n`);
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
	const expected = stateFor(snapshot);
	const actual = JSON.parse(readFileSync(markerPath, "utf8"));
	if (actual.bun !== expected.bun) {
		throw new Error(
			`Bun toolchain drift: installed with ${actual.bun}, current is ${expected.bun}; reinstall dependencies`,
		);
	}
	if (actual.digest !== expected.digest) {
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
