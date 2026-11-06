// System identity, CPU, memory, disk and network collection.
// Native Node APIs only: no recursive scans, no shell, no secrets.

import { promises as fsp } from "node:fs";
import {
	cpus,
	freemem,
	networkInterfaces,
	arch as osArch,
	hostname as osHostname,
	platform as osPlatform,
	type as osType,
	uptime as osUptime,
	release,
	totalmem,
} from "node:os";
import type {
	WorkstationDisk,
	WorkstationInterface,
	WorkstationIpFamily,
	WorkstationMemory,
} from "@bat/shared";
import { ipFamily, WORKSTATION_LIMITS } from "@bat/shared";
import type { CommandExecutor } from "../scheduler/exec.js";
import { runCommand } from "../scheduler/exec.js";
import { statfsInChild } from "./statfs.js";

/** CPU delta window must be long enough to be meaningful. */
export const CPU_SAMPLE_MIN_MS = 200;
const CPU_SAMPLE_MS = 250;

export interface CpuSnapshot {
	idle: number;
	total: number;
}

export function snapshotCpu(list = cpus()): CpuSnapshot {
	let idle = 0;
	let total = 0;
	for (const cpu of list) {
		const times = cpu.times;
		idle += times.idle;
		total += times.user + times.nice + times.sys + times.idle + times.irq;
	}
	return { idle, total };
}

export function cpuUsagePct(before: CpuSnapshot, after: CpuSnapshot): number | null {
	const totalDelta = after.total - before.total;
	if (totalDelta <= 0) {
		return null;
	}
	const idleDelta = after.idle - before.idle;
	const usage = (1 - idleDelta / totalDelta) * 100;
	return Math.round(Math.min(100, Math.max(0, usage)) * 100) / 100;
}

export function cpuModel(list = cpus()): string {
	const model = list[0]?.model?.trim();
	if (!model) {
		return "unknown";
	}
	return truncateText(model, WORKSTATION_LIMITS.cpuModel);
}

function truncateText(value: string, max: number): string {
	return value.length <= max ? value : value.slice(0, max);
}

/** Parse `MemAvailable` from /proc/meminfo; null when the field is absent. */
export function parseMemAvailableKb(text: string): number | null {
	const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(text);
	if (!match?.[1]) {
		return null;
	}
	return Number.parseInt(match[1], 10) * 1024;
}

export interface MemoryDeps {
	platform?: NodeJS.Platform;
	total?: number;
	free?: () => number;
	readFile?: (path: string, options?: { signal?: AbortSignal }) => Promise<string>;
	signal?: AbortSignal;
}

/**
 * Honest available semantics per platform: Linux uses MemAvailable, other
 * platforms use the OS view of free memory. Never derive available from used.
 */
export async function collectMemory(deps: MemoryDeps = {}): Promise<WorkstationMemory> {
	const total = Math.max(1, Math.floor(deps.total ?? totalmem()));
	let available = deps.free ? deps.free() : freemem();
	const platform = deps.platform ?? osPlatform();
	if (platform === "linux") {
		try {
			const readFile =
				deps.readFile ??
				((path: string, options?: { signal?: AbortSignal }) =>
					fsp.readFile(path, {
						encoding: "utf-8",
						...(options?.signal ? { signal: options.signal } : {}),
					}));
			const text = await readFile(
				"/proc/meminfo",
				deps.signal ? { signal: deps.signal } : undefined,
			);
			const parsed = parseMemAvailableKb(text);
			if (parsed !== null) {
				available = parsed;
			}
		} catch {
			// Fall back to os.freemem() when /proc/meminfo is unavailable.
		}
	}
	const bounded = Math.min(total, Math.max(0, Math.floor(available)));
	const usedPct = Math.round(((total - bounded) / total) * 10000) / 100;
	return {
		total_bytes: total,
		available_bytes: bounded,
		used_pct: Math.min(100, Math.max(0, usedPct)),
	};
}

export interface StatfsLike {
	bsize: number;
	blocks: number;
	bavail: number;
}

/** Only the primary local volume; never enumerate or walk the file system. */
export function diskMounts(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
	if (platform === "win32") {
		return [`${env.SystemDrive ?? "C:"}\\`];
	}
	return ["/"];
}

export function diskFromStats(mount: string, stats: StatfsLike): WorkstationDisk | null {
	const total = Math.floor(stats.bsize * stats.blocks);
	const available = Math.floor(stats.bsize * stats.bavail);
	if (!Number.isFinite(total) || total < 1 || !Number.isFinite(available) || available < 0) {
		return null;
	}
	const bounded = Math.min(total, available);
	const usedPct = Math.round(((total - bounded) / total) * 10000) / 100;
	return {
		mount: truncateText(mount, WORKSTATION_LIMITS.mount),
		total_bytes: total,
		available_bytes: bounded,
		used_pct: Math.min(100, Math.max(0, usedPct)),
	};
}

export interface DiskDeps {
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	/** Injectable statfs; the default runs in a killable child process. */
	statfs?: (path: string, options?: { signal?: AbortSignal }) => Promise<StatfsLike>;
	/** Cancels the default child implementation. */
	signal?: AbortSignal;
	exec?: CommandExecutor;
	nodePath?: string;
	timeoutMs?: number;
}

export interface DiskCollection {
	disk: WorkstationDisk[];
	errors: string[];
}

export async function collectDisks(deps: DiskDeps = {}): Promise<DiskCollection> {
	const platform = deps.platform ?? osPlatform();
	const statfs =
		deps.statfs ??
		((path: string) =>
			statfsInChild(path, {
				exec: deps.exec ?? runCommand,
				...(deps.nodePath ? { nodePath: deps.nodePath } : {}),
				...(deps.signal ? { signal: deps.signal } : {}),
				...(deps.timeoutMs ? { timeoutMs: deps.timeoutMs } : {}),
			}));
	const disk: WorkstationDisk[] = [];
	const errors: string[] = [];
	for (const mount of diskMounts(platform, deps.env ?? process.env)) {
		try {
			const stats = await statfs(mount, deps.signal ? { signal: deps.signal } : undefined);
			const entry = diskFromStats(mount, stats);
			if (entry) {
				disk.push(entry);
			} else {
				errors.push(`disk ${mount}: unusable statfs result`);
			}
		} catch (err) {
			errors.push(`disk ${mount}: ${(err as Error).message}`);
		}
	}
	return { disk, errors: errors.map((line) => truncateText(line, WORKSTATION_LIMITS.errorText)) };
}

function familyOf(info: { family: string | number }): WorkstationIpFamily | null {
	if (info.family === "IPv4" || info.family === 4) {
		return 4;
	}
	if (info.family === "IPv6" || info.family === 6) {
		return 6;
	}
	return null;
}

/** Interfaces and addresses only; never MAC addresses. */
export function collectNetwork(
	interfaces: NodeJS.Dict<import("node:os").NetworkInterfaceInfo[]> = networkInterfaces(),
): WorkstationInterface[] {
	const result: WorkstationInterface[] = [];
	for (const name of Object.keys(interfaces).sort()) {
		const entries = interfaces[name] ?? [];
		const addresses: WorkstationInterface["addresses"] = [];
		const seen = new Set<string>();
		for (const info of entries) {
			const family = familyOf(info);
			if (!family) {
				continue;
			}
			const address = info.address.split("%")[0] ?? "";
			if (ipFamily(address) !== family || seen.has(address)) {
				continue;
			}
			seen.add(address);
			addresses.push({ address, family, internal: info.internal });
			if (addresses.length >= WORKSTATION_LIMITS.addressesPerInterface) {
				break;
			}
		}
		if (addresses.length === 0) {
			continue;
		}
		result.push({ name: truncateText(name, WORKSTATION_LIMITS.interfaceName), addresses });
		if (result.length >= WORKSTATION_LIMITS.interfaces) {
			break;
		}
	}
	return result;
}

export interface Identity {
	hostname: string;
	os: string;
	arch: string;
	uptime_seconds: number;
}

export interface IdentityDeps {
	hostname?: string;
	platform?: NodeJS.Platform;
	type?: string;
	release?: string;
	arch?: string;
	uptime?: number;
}

export function collectIdentity(deps: IdentityDeps = {}): Identity {
	const rawHostname = (deps.hostname ?? osHostname()).trim();
	const osName = `${deps.type ?? osType()} ${deps.release ?? release()}`.trim();
	const rawArch = (deps.arch ?? osArch()).trim();
	const uptime = Math.floor(deps.uptime ?? osUptime());
	return {
		hostname: truncateText(rawHostname || "unknown", WORKSTATION_LIMITS.hostname),
		os: truncateText(osName || (deps.platform ?? osPlatform()), WORKSTATION_LIMITS.os),
		arch: truncateText(rawArch || "unknown", WORKSTATION_LIMITS.arch),
		uptime_seconds: Math.min(
			WORKSTATION_LIMITS.uptimeSeconds,
			Math.max(0, Number.isFinite(uptime) ? uptime : 0),
		),
	};
}

export function cpuSampleDelay(signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) {
			resolve();
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, CPU_SAMPLE_MS);
		function onAbort(): void {
			clearTimeout(timer);
			resolve();
		}
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
