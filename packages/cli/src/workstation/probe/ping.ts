// Connectivity probes: argv-only Unix ping and structured Windows .NET Ping.
// A missing or denied ping binary is a local "error", never a network "down".
// Every probe sends exactly three samples; a lost packet keeps its slot.

import type {
	WorkstationConnectivity,
	WorkstationConnectivityStatus,
	WorkstationIpFamily,
	WorkstationTarget,
} from "@bat/shared";
import { WORKSTATION_PING_COUNT } from "@bat/shared";
import type { CommandExecutor, ExecResult } from "../scheduler/exec.js";

const PING_TIMEOUT_MS = 1000;
const CHILD_TIMEOUT_MS = 12_000;
const BASE_ENV = { LC_ALL: "C", LANG: "C" };

export interface PingPlan {
	command: string;
	args: string[];
	env: Record<string, string>;
}

/**
 * Unix ping argv.
 * macOS `ping` documents `-W` in milliseconds; macOS `ping6` does not implement
 * it, so IPv6 on macOS relies on the child timeout instead.
 */
export function buildUnixPingPlan(
	platform: NodeJS.Platform,
	family: WorkstationIpFamily,
	address: string,
	timeoutMs = PING_TIMEOUT_MS,
): PingPlan {
	if (family === 6) {
		if (platform === "darwin") {
			return {
				command: "ping6",
				args: ["-n", "-c", "3", address],
				env: BASE_ENV,
			};
		}
		return {
			command: "ping",
			args: [
				"-n",
				"-c",
				"3",
				"-W",
				String(Math.max(1, Math.ceil(timeoutMs / 1000))),
				"-6",
				address,
			],
			env: BASE_ENV,
		};
	}
	if (platform === "darwin") {
		return {
			command: "ping",
			args: ["-n", "-c", "3", "-W", String(timeoutMs), address],
			env: BASE_ENV,
		};
	}
	return {
		command: "ping",
		args: ["-n", "-c", "3", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), address],
		env: BASE_ENV,
	};
}

/**
 * Structured .NET Ping. The address arrives through the environment so the
 * script stays constant and argv stays bounded; no shell interpolation.
 * A local failure is reported as an error, never as a network timeout.
 */
export const WINDOWS_PING_SCRIPT = [
	"$ErrorActionPreference='Stop'",
	"$address=[System.Net.IPAddress]::Parse($env:BAT_PING_ADDRESS)",
	"$ping=New-Object System.Net.NetworkInformation.Ping",
	"$rtts=@()",
	"$failure=$null",
	"foreach($i in 1..3){",
	"  try{",
	"    $reply=$ping.Send($address,1000)",
	"    if($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success){$rtts+=[double]$reply.RoundtripTime}else{$rtts+=$null}",
	"  }catch{",
	"    if($failure -eq $null){$failure=$_.Exception.Message}",
	"    $rtts+=$null",
	"  }",
	"}",
	"ConvertTo-Json -Compress -InputObject ([pscustomobject]@{rtts=$rtts; error=$failure})",
].join("\n");

export function buildWindowsPingPlan(address: string): PingPlan {
	return {
		command: "powershell.exe",
		args: ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PING_SCRIPT],
		env: { BAT_PING_ADDRESS: address },
	};
}

/** macOS counts packets from zero, Linux from one. */
export function sequenceBase(platform: NodeJS.Platform): number {
	return platform === "darwin" ? 0 : 1;
}

/**
 * Extract the three sample slots from Unix ping output.
 * A lost packet keeps its position: the first loss stays the first null.
 */
export function parseUnixPingOutput(
	output: string,
	base = sequenceBase("linux"),
): (number | null)[] {
	const slots: (number | null)[] = [null, null, null];
	const lines = output.split("\n");
	for (const line of lines) {
		const seqMatch = /icmp_seq[= ](\d+)/.exec(line);
		const timeMatch = /time([=<])\s*(\d+(?:\.\d+)?)\s*ms/.exec(line);
		const lostMatch = /Request timeout for icmp_seq|no answer yet for icmp_seq/i.test(line);
		if (!seqMatch && !timeMatch && !lostMatch) {
			continue;
		}
		let slot: number;
		if (seqMatch) {
			slot = Number.parseInt(seqMatch[1] ?? "0", 10) - base;
		} else {
			slot = slots.indexOf(null);
		}
		if (slot < 0 || slot >= WORKSTATION_PING_COUNT) {
			continue;
		}
		if (timeMatch) {
			// A coarse clock prints "time<1 ms"; that is a genuine sub-millisecond sample.
			const value = timeMatch[1] === "<" ? 0 : Number.parseFloat(timeMatch[2] ?? "");
			slots[slot] = Number.isFinite(value) && value >= 0 ? value : null;
		} else if (lostMatch) {
			slots[slot] = null;
		}
	}
	return slots;
}

export interface WindowsPingResult {
	rtts: (number | null)[];
	error: string | null;
}

/** Parse the structured Windows result. Malformed output yields no RTTs. */
export function parseWindowsPingOutput(output: string): WindowsPingResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output.trim());
	} catch {
		return { rtts: [], error: null };
	}
	if (typeof parsed !== "object" || parsed === null) {
		return { rtts: [], error: null };
	}
	const record = parsed as Record<string, unknown>;
	const rawError = record.error;
	const error = typeof rawError === "string" && rawError.length > 0 ? rawError : null;
	const rtts = record.rtts;
	if (!Array.isArray(rtts) || rtts.length !== WORKSTATION_PING_COUNT) {
		return { rtts: [], error };
	}
	return {
		rtts: rtts.map((entry) => {
			if (entry === null) {
				return null;
			}
			return typeof entry === "number" && Number.isFinite(entry) && entry >= 0 ? entry : null;
		}),
		error,
	};
}

export function classifyConnectivity(
	received: number,
	output: string,
	localFailure: boolean,
): WorkstationConnectivityStatus {
	if (localFailure) {
		return "error";
	}
	if (received >= WORKSTATION_PING_COUNT) {
		return "reachable";
	}
	if (received > 0) {
		return "partial";
	}
	if (/unreachable|no route to host|network is down|cannot assign requested/i.test(output)) {
		return "unreachable";
	}
	return "timeout";
}

export interface PingDeps {
	exec: CommandExecutor;
	platform?: NodeJS.Platform;
	/** Per-packet timeout handed to the ping tool. */
	timeoutMs?: number;
	/** Hard limit for the child process, normally the remaining run budget. */
	childTimeoutMs?: number;
	signal?: AbortSignal;
}

export interface PingOutcome {
	connectivity: WorkstationConnectivity;
	/** Present when the probe itself failed locally (missing command, permission). */
	localError?: string;
}

function countAnswered(rtts: readonly (number | null)[]): number {
	return rtts.filter((rtt) => rtt !== null).length;
}

function firstLineMatching(output: string, pattern: RegExp): string {
	const line = output
		.split("\n")
		.map((entry) => entry.trim())
		.find((entry) => pattern.test(entry));
	return line ?? output.trim();
}

/**
 * Probe one target with exactly three samples and build the shared entry.
 * The child is bounded by the caller's timeout and cancelled by its signal.
 */
export async function pingTarget(target: WorkstationTarget, deps: PingDeps): Promise<PingOutcome> {
	const platform = deps.platform ?? process.platform;
	const timeoutMs = deps.timeoutMs ?? PING_TIMEOUT_MS;
	const plan =
		platform === "win32"
			? buildWindowsPingPlan(target.address)
			: buildUnixPingPlan(platform, target.family, target.address, timeoutMs);

	const childTimeout =
		deps.childTimeoutMs ??
		Math.min(CHILD_TIMEOUT_MS, Math.max(2000, timeoutMs * WORKSTATION_PING_COUNT + 2000));
	const result: ExecResult = await deps.exec(plan.command, plan.args, {
		timeoutMs: childTimeout,
		env: plan.env,
		...(deps.signal ? { signal: deps.signal } : {}),
	});

	let rtts: (number | null)[];
	let localFailure = false;
	let failureDetail: string | undefined;

	if (platform === "win32") {
		const parsed = parseWindowsPingOutput(result.stdout);
		rtts = parsed.rtts;
		if (parsed.error) {
			localFailure = true;
			failureDetail = parsed.error;
		} else if (parsed.rtts.length !== WORKSTATION_PING_COUNT && !result.timedOut) {
			localFailure = true;
			failureDetail = "unreadable ping result";
		}
	} else {
		rtts = parseUnixPingOutput(result.stdout, sequenceBase(platform));
	}

	const combined = `${result.stdout}${result.stderr}`;
	const permissionFailure =
		/operation not permitted|permission denied|not permitted|must be root|socket:/i.test(combined);

	if (result.spawnError) {
		localFailure = true;
		failureDetail = result.spawnError;
	} else if (result.aborted) {
		// The caller cancelled the run (deadline or lock compromise): a local
		// error, never a network loss.
		localFailure = true;
		failureDetail = "probe was cancelled";
	} else if (!localFailure && permissionFailure) {
		localFailure = true;
		failureDetail = firstLineMatching(
			combined,
			/operation not permitted|permission denied|not permitted|must be root|socket:/i,
		);
	} else if (!localFailure && rtts.length === WORKSTATION_PING_COUNT) {
		const answered = countAnswered(rtts);
		const unreachable = /unreachable|no route to host/i.test(combined);
		if (answered === 0 && !unreachable && !result.timedOut) {
			// macOS reports "sent but no replies" as exit code 2, which is a normal
			// 100% loss. Any other non-zero code there is a local failure. A child
			// killed by our own timeout still means "no reply" (timeout).
			localFailure =
				platform === "darwin"
					? !(result.code === 2 && /packet loss/i.test(combined))
					: result.code !== null && result.code >= 2;
		}
	}

	const received = countAnswered(rtts);
	const status = classifyConnectivity(received, `${result.stdout}${result.stderr}`, localFailure);
	const outcome: PingOutcome = {
		connectivity: {
			server_id: target.server_id,
			address: target.address,
			family: target.family,
			sent: WORKSTATION_PING_COUNT,
			received,
			rtts_ms: [rtts[0] ?? null, rtts[1] ?? null, rtts[2] ?? null],
			status,
		},
	};
	if (localFailure) {
		const detail = failureDetail ?? (result.stderr.trim() || `exit ${result.code ?? "null"}`);
		outcome.localError = `ping ${target.address}: ${detail}`;
	}
	return outcome;
}
