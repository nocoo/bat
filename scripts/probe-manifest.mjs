#!/usr/bin/env bun
/**
 * Build the probe release manifest that CI uploads next to the binaries.
 *
 * Agents read `https://s.zhe.to/apps/bat/latest/manifest.json` to learn the
 * newest version, the per-architecture download URLs and their checksums,
 * instead of parsing a page or hardcoding a version. The manifest is data, so
 * it can never drift from what CD actually uploaded.
 *
 * Usage:
 *   bun scripts/probe-manifest.mjs --dir probe/out --version 3.1.1 --out probe/out/manifest.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARTIFACT_BASE = "https://s.zhe.to/apps/bat";
export const DASHBOARD_URL = "https://bat.hexly.ai";
export const INGEST_URL = "https://bat-ingest.worker.hexly.ai";
export const ARCHITECTURES = ["x86_64", "aarch64"];

/**
 * `sha256sum` writes "<64 hex>  <name>". Anything else is a broken artifact and
 * must fail the release instead of publishing an unverifiable manifest.
 */
export function parseChecksum(text, name) {
	const match = /^([0-9a-f]{64})\s+\*?(.+)$/m.exec(text.trim());
	if (!match) {
		throw new Error(`${name}: checksum file does not contain a sha256 line`);
	}
	const [, digest, file] = match;
	if (file.trim() !== name) {
		throw new Error(`${name}: checksum names ${file.trim()}, expected ${name}`);
	}
	return digest;
}

export function buildProbeManifest({ version, releasedAt, checksums, baseUrl = ARTIFACT_BASE }) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`invalid version: ${version}`);
	}
	const artifacts = {};
	for (const arch of ARCHITECTURES) {
		const name = `bat-probe-linux-${arch}`;
		const digest = checksums[arch];
		if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
			throw new Error(`missing sha256 for ${name}`);
		}
		artifacts[arch] = {
			url: `${baseUrl}/latest/${name}`,
			sha256: digest,
			sha256_url: `${baseUrl}/latest/${name}.sha256`,
			versioned_url: `${baseUrl}/${version}/${name}`,
		};
	}
	return {
		component: "bat-probe",
		version,
		released_at: releasedAt,
		manifest_url: `${baseUrl}/latest/manifest.json`,
		dashboard_url: DASHBOARD_URL,
		ingest_url: INGEST_URL,
		config_path: "/etc/bat/config.toml",
		binary_path: "/usr/local/bin/bat-probe",
		service: "bat-probe",
		unit_url: `${baseUrl}/latest/bat-probe.service`,
		artifacts,
	};
}

function parseArgs(argv) {
	const value = (name) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : argv[index + 1];
	};
	return { dir: value("--dir"), version: value("--version"), out: value("--out") };
}

if (import.meta.main) {
	const { dir, version, out } = parseArgs(process.argv.slice(2));
	if (!dir || !version || !out) {
		console.error("Usage: probe-manifest.mjs --dir <artifact dir> --version X.Y.Z --out <file>");
		process.exit(1);
	}
	const checksums = {};
	for (const arch of ARCHITECTURES) {
		const name = `bat-probe-linux-${arch}`;
		checksums[arch] = parseChecksum(readFileSync(join(dir, `${name}.sha256`), "utf8"), name);
	}
	const manifest = buildProbeManifest({
		version,
		releasedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
		checksums,
	});
	writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
	console.info(`→ ${out}: bat-probe ${version}, ${ARCHITECTURES.length} architectures`);
}
