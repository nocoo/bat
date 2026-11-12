#!/usr/bin/env node
/**
 * P1 release acceptance for the public CLI package.
 *
 * Packs `packages/cli` for real, inspects the tarball, installs it into a
 * throwaway prefix and runs the installed binary. Nothing is published, no
 * production system is contacted and the repository is never written to.
 *
 * Usage: node scripts/quality/verify-package.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const cliDir = join(repoRoot, "packages", "cli");
const sharedVersionFile = join(repoRoot, "packages", "shared", "src", "version.ts");

const PACK_LIFECYCLE_SCRIPTS = ["prepack", "prepare", "prepackOnly"];
const FORBIDDEN_PATH_SEGMENTS = ["src", "test", "tests", "__tests__", "coverage", "node_modules"];
const FORBIDDEN_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]s$/;

let failures = 0;

function check(name, ok, detail = "") {
	const text = String(detail).replace(/\s+/g, " ").trim().slice(0, 400);
	console.log(`${ok ? "ok  " : "FAIL"} ${name}${text ? `: ${text}` : ""}`);
	if (!ok) failures += 1;
	return ok;
}

function fail(name, detail) {
	return check(name, false, detail);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		timeout: 180_000,
		...options,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error,
	};
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function withoutBatEnv(env) {
	const cleaned = { ...env };
	for (const key of Object.keys(cleaned)) {
		if (key.startsWith("BAT_")) delete cleaned[key];
	}
	return cleaned;
}

const temps = [];
function makeTemp(prefix) {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	temps.push(dir);
	return dir;
}

try {
	const rootPkg = readJson(join(repoRoot, "package.json"));
	const cliPkg = readJson(join(cliDir, "package.json"));
	const expectedVersion = rootPkg.version;

	console.log(`— package acceptance @ ${expectedVersion} —`);

	// --- source of truth -----------------------------------------------------
	check("root version is a semver string", /^\d+\.\d+\.\d+/.test(expectedVersion), expectedVersion);
	check(
		"cli package version matches root version",
		cliPkg.version === expectedVersion,
		`cli=${cliPkg.version} root=${expectedVersion}`,
	);

	const sharedSource = existsSync(sharedVersionFile) ? readFileSync(sharedVersionFile, "utf8") : "";
	const sharedMatch = sharedSource.match(/BAT_VERSION\s*=\s*"([^"]+)"/);
	check(
		"shared BAT_VERSION constant matches root version",
		sharedMatch?.[1] === expectedVersion,
		`shared=${sharedMatch?.[1] ?? "missing"} root=${expectedVersion}`,
	);

	const lifecycle = PACK_LIFECYCLE_SCRIPTS.filter((name) => cliPkg.scripts?.[name]);
	check(
		"cli package has no pack lifecycle scripts",
		lifecycle.length === 0,
		lifecycle.length ? `found: ${lifecycle.join(", ")}` : "prepack/prepare/prepackOnly absent",
	);

	const declaredFiles = Array.isArray(cliPkg.files) ? cliPkg.files : [];
	check(
		"cli package declares the expected files",
		declaredFiles.includes("dist") &&
			declaredFiles.includes("LICENSE") &&
			declaredFiles.includes("README.md"),
		declaredFiles.join(", ") || "none",
	);

	const binRelative = cliPkg.bin?.bat;
	check(
		"cli package declares the bat bin",
		typeof binRelative === "string",
		binRelative ?? "missing",
	);

	// --- build presence ------------------------------------------------------
	const distDir = join(cliDir, "dist");
	const binEntry = binRelative ? join(cliDir, binRelative.replace(/^\.\//, "")) : "";
	if (!check("build output exists (packages/cli/dist)", existsSync(distDir), distDir)) {
		throw new Error("build output missing: run `bun run build` before this check");
	}
	if (!check("built bin entry exists", Boolean(binEntry) && existsSync(binEntry), binEntry)) {
		throw new Error("built bin entry missing: run `bun run build` before this check");
	}
	check(
		"built bin entry is non-empty",
		statSync(binEntry).size > 0,
		`${statSync(binEntry).size} bytes`,
	);

	// --- npm pack ------------------------------------------------------------
	const packDir = makeTemp("bat-pack-");
	const pack = run("npm", ["pack", "--ignore-scripts", "--pack-destination", packDir, "--json"], {
		cwd: cliDir,
	});
	if (!check("npm pack succeeded", pack.status === 0, (pack.stderr || pack.stdout).trim())) {
		throw new Error("npm pack failed");
	}

	let packMeta = null;
	try {
		const parsed = JSON.parse(pack.stdout.trim());
		packMeta = Array.isArray(parsed) ? parsed[0] : parsed;
	} catch {
		packMeta = null;
	}
	const tarballName =
		packMeta?.filename ??
		pack.stdout
			.trim()
			.split("\n")
			.reverse()
			.find((line) => line.trim().endsWith(".tgz"));
	if (
		!check("npm pack reported a tarball", Boolean(tarballName), tarballName ?? pack.stdout.trim())
	) {
		throw new Error("npm pack produced no tarball");
	}
	const tarball = join(packDir, tarballName);
	check("tarball exists on disk", existsSync(tarball), tarball);
	check(
		"tarball version matches root version",
		packMeta?.version === expectedVersion,
		`tarball=${packMeta?.version ?? "unknown"} root=${expectedVersion}`,
	);

	// --- tarball contents ----------------------------------------------------
	const listing = run("tar", ["-tzf", tarball]);
	if (!check("tarball could be listed", listing.status === 0, listing.stderr.trim())) {
		throw new Error("unable to inspect the packed tarball");
	}
	const entries = listing.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.endsWith("/"))
		.map((line) => (line.startsWith("package/") ? line.slice("package/".length) : line));

	check("tarball is not empty", entries.length > 0, `${entries.length} entries`);

	const allowed = new Set(["package.json", ...declaredFiles]);
	const allowedDirectories = declaredFiles.filter((entry) => !entry.includes("."));
	const isAllowed = (entry) => {
		if (allowed.has(entry)) return true;
		return allowedDirectories.some((dir) => entry.startsWith(`${dir}/`));
	};

	const offenders = entries.filter((entry) => !isAllowed(entry));
	check(
		"tarball only contains declared files",
		offenders.length === 0,
		offenders.length ? offenders.join(", ") : `entries: ${entries.join(", ")}`,
	);

	const leaked = entries.filter(
		(entry) =>
			FORBIDDEN_PATH_SEGMENTS.some(
				(segment) => entry === segment || entry.startsWith(`${segment}/`),
			) || FORBIDDEN_FILE_PATTERN.test(entry),
	);
	check(
		"tarball contains no src/test content",
		leaked.length === 0,
		leaked.length ? leaked.join(", ") : "none",
	);

	for (const required of ["LICENSE", "README.md", "package.json"]) {
		check(`tarball contains ${required}`, entries.includes(required));
	}
	const distEntries = entries.filter((entry) => entry.startsWith("dist/"));
	check(
		"tarball contains the built dist files",
		distEntries.length > 0,
		distEntries.join(", ") || "none",
	);
	if (binRelative) {
		const normalizedBin = binRelative.replace(/^\.\//, "");
		check(
			"tarball contains the packaged bin entry",
			entries.includes(normalizedBin),
			normalizedBin,
		);
	}

	if (packMeta?.files) {
		const metaPaths = packMeta.files.map((file) => file.path).sort();
		const tarPaths = [...entries].sort();
		const same =
			metaPaths.length === tarPaths.length &&
			metaPaths.every((value, index) => value === tarPaths[index]);
		check(
			"npm pack file list matches the tarball archive",
			same,
			`npm=${metaPaths.length} tar=${tarPaths.length}`,
		);
	}

	// --- install into a throwaway prefix -------------------------------------
	const prefix = makeTemp("bat-prefix-");
	const fakeHome = makeTemp("bat-home-");
	const install = run(
		"npm",
		[
			"install",
			"--prefix",
			prefix,
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--prefer-offline",
			tarball,
		],
		{ cwd: prefix },
	);
	if (
		!check(
			"tarball installed into the temporary prefix",
			install.status === 0,
			install.stderr.trim(),
		)
	) {
		throw new Error("npm install of the packed tarball failed");
	}

	const installedPkgDir = join(prefix, "node_modules", "@nocoo", "bat");
	check("installed package directory exists", existsSync(installedPkgDir), installedPkgDir);
	const installedBin = join(prefix, "node_modules", ".bin", "bat");
	check("installed bin link exists", existsSync(installedBin), installedBin);

	const installedPkg = existsSync(join(installedPkgDir, "package.json"))
		? readJson(join(installedPkgDir, "package.json"))
		: null;
	check(
		"installed package version matches root version",
		installedPkg?.version === expectedVersion,
		`installed=${installedPkg?.version ?? "unknown"} root=${expectedVersion}`,
	);

	// --- run the installed binary -------------------------------------------
	const nodeDir = dirname(process.execPath);
	const runEnv = withoutBatEnv({
		...process.env,
		HOME: fakeHome,
		XDG_CONFIG_HOME: join(fakeHome, ".config"),
		PATH:
			basename(process.execPath) === "node" && !process.env.PATH?.split(delimiter).includes(nodeDir)
				? `${nodeDir}${delimiter}${process.env.PATH ?? ""}`
				: process.env.PATH,
	});

	const versionRun = run(installedBin, ["--version"], { env: runEnv, timeout: 60_000 });
	check(
		"installed bin --version exits 0",
		versionRun.status === 0,
		(versionRun.stderr || versionRun.stdout).trim(),
	);
	const printedVersion = versionRun.stdout.trim().replace(/^v/, "");
	check(
		"installed bin --version matches root version",
		printedVersion === expectedVersion,
		`printed=${printedVersion || "none"} expected=${expectedVersion}`,
	);

	const helpRun = run(installedBin, ["--help"], { env: runEnv, timeout: 60_000 });
	check(
		"installed bin --help exits 0",
		helpRun.status === 0,
		(helpRun.stderr || helpRun.stdout).trim(),
	);
	check(
		"installed bin --help prints usage",
		/USAGE/.test(helpRun.stdout) && helpRun.stdout.trim().length > 0,
		helpRun.stdout.split("\n")[0]?.trim() ?? "",
	);
} catch (error) {
	if (error instanceof Error) fail("package acceptance aborted", error.message);
	else fail("package acceptance aborted", String(error));
} finally {
	for (const dir of temps) {
		rmSync(dir, { recursive: true, force: true });
	}
}

if (failures > 0) {
	console.error(`\npackage acceptance failed: ${failures} check(s) failed`);
	process.exit(1);
}
console.log("\npackage acceptance passed");
