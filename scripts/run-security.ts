#!/usr/bin/env bun
/**
 * G2 Security Gate — osv-scanner (dependency CVE) + gitleaks (secrets)
 *
 * Pre-push hook runs this alongside L2 E2E tests.
 * Both tools must pass (exit 0) for push to proceed.
 */

import { $ } from "bun";

const results: { tool: string; ok: boolean; output: string }[] = [];

// 1. osv-scanner — scan pnpm-lock.yaml for known CVEs
console.info("→ G2: osv-scanner (pnpm-lock.yaml)");
try {
	const osv = await $`osv-scanner --lockfile=pnpm-lock.yaml`.quiet();
	results.push({ tool: "osv-scanner", ok: true, output: osv.text() });
	console.info("  ✔ osv-scanner (JS): no vulnerabilities found");
} catch (e: unknown) {
	const err = e as { stderr?: { toString(): string }; message?: string };
	results.push({ tool: "osv-scanner", ok: false, output: err.stderr?.toString() ?? "" });
	console.error("  ✘ osv-scanner (JS): vulnerabilities detected");
	console.error(err.stderr?.toString() ?? err.message);
}

// 2. osv-scanner — scan Cargo.lock for Rust CVEs
console.info("→ G2: osv-scanner (Cargo.lock)");
try {
	const osv = await $`osv-scanner --lockfile=probe/Cargo.lock`.quiet();
	results.push({ tool: "osv-scanner-rust", ok: true, output: osv.text() });
	console.info("  ✔ osv-scanner (Rust): no vulnerabilities found");
} catch (e: unknown) {
	const err = e as { stderr?: { toString(): string }; message?: string };
	results.push({ tool: "osv-scanner-rust", ok: false, output: err.stderr?.toString() ?? "" });
	console.error("  ✘ osv-scanner (Rust): vulnerabilities detected");
	console.error(err.stderr?.toString() ?? err.message);
}

// 3. gitleaks — scan for leaked secrets in commits since upstream
console.info("→ G2: gitleaks (secrets leak detection)");
try {
	// Detect upstream branch dynamically
	const upstream = (await $`git rev-parse --abbrev-ref @{u}`.quiet()).text().trim();
	await $`gitleaks git --log-opts=${upstream}..HEAD --no-banner`.quiet();
	results.push({ tool: "gitleaks", ok: true, output: "" });
	console.info("  ✔ gitleaks: no leaks detected");
} catch (e: unknown) {
	const err = e as { stderr?: { toString(): string }; exitCode?: number; message?: string };
	// gitleaks exit 1 = leaks found, exit 2+ = error
	// If no upstream, fall back to scanning all commits
	if (err.message?.includes("rev-parse")) {
		console.info("  ⚠ gitleaks: no upstream branch, scanning recent commits");
		try {
			await $`gitleaks git --log-opts=-20 --no-banner`.quiet();
			results.push({ tool: "gitleaks", ok: true, output: "" });
			console.info("  ✔ gitleaks: no leaks detected");
		} catch (e2: unknown) {
			const err2 = e2 as { stderr?: { toString(): string }; message?: string };
			results.push({ tool: "gitleaks", ok: false, output: err2.stderr?.toString() ?? "" });
			console.error("  ✘ gitleaks: potential secrets detected");
			console.error(err2.stderr?.toString() ?? err2.message);
		}
	} else {
		results.push({ tool: "gitleaks", ok: false, output: err.stderr?.toString() ?? "" });
		console.error("  ✘ gitleaks: potential secrets detected");
		console.error(err.stderr?.toString() ?? err.message);
	}
}

// Summary
const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
	console.error(`\n✘ G2 Security gate FAILED (${failed.map((f) => f.tool).join(", ")})`);
	process.exit(1);
}

console.info("\n✔ G2 Security gate PASSED");
