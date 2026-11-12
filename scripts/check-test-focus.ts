#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const roots = ["packages", "scripts", "probe"];
const blocked =
	/\b(?:describe|it|test|suite)\.(?:only|skip|todo)\s*\(|\b(?:fdescribe|fit|xit|xtest)\s*\(/;
const files: string[] = [];

const walk = (dir: string) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "target" || entry.name.startsWith(".")) {
			continue;
		}
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (/\.(?:test|spec)\.(?:ts|tsx|js|mjs|rs)$/.test(entry.name)) files.push(path);
	}
};

for (const dir of roots) walk(join(root, dir));

const violations = files.flatMap((path) =>
	readFileSync(path, "utf8")
		.split("\n")
		.flatMap((line, index) => (blocked.test(line) ? [`${relative(root, path)}:${index + 1}`] : [])),
);

if (violations.length > 0) {
	console.error(`Focused or skipped tests are not allowed:\n${violations.join("\n")}`);
	process.exit(1);
}
console.log(`No focused or skipped tests in ${files.length} test files`);
