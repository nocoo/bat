// `bat workstation detail` — the newest reports this machine uploaded, with the
// per-target probe results, read back from the ingest host with its own key.

import {
	WORKSTATION_REPORTS_DEFAULT_LIMIT,
	WORKSTATION_REPORTS_MAX_LIMIT,
	type WorkstationConnectivity,
	type WorkstationReportsResponse,
} from "@bat/shared";
import { error, info, success, table } from "../lib/output.js";
import { fetchReports } from "./api.js";
import type { WorkstationCredential, WorkstationPaths } from "./store.js";
import { readCredential } from "./store.js";

export interface DetailDeps {
	paths: WorkstationPaths;
	limit?: number;
	json?: boolean;
	credential?: WorkstationCredential | null;
	fetch?: typeof fetchReports;
}

export function describeLimit(limit: number | undefined): number {
	if (limit === undefined) {
		return WORKSTATION_REPORTS_DEFAULT_LIMIT;
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > WORKSTATION_REPORTS_MAX_LIMIT) {
		throw new Error(`--limit must be an integer between 1 and ${WORKSTATION_REPORTS_MAX_LIMIT}`);
	}
	return limit;
}

function answering(connectivity: readonly WorkstationConnectivity[]): number {
	return connectivity.filter((entry) => entry.status === "reachable" || entry.status === "partial")
		.length;
}

function averageRtt(entry: WorkstationConnectivity): string {
	const values = entry.rtts_ms.filter((value): value is number => value !== null);
	if (values.length === 0) {
		return "—";
	}
	const mean = values.reduce((total, value) => total + value, 0) / values.length;
	return `${Math.round(mean * 10) / 10} ms`;
}

function loss(entry: WorkstationConnectivity): string {
	if (entry.status === "error" || entry.status === "unsupported") {
		return "—";
	}
	if (entry.sent <= 0) {
		return "—";
	}
	return `${Math.round(((entry.sent - entry.received) / entry.sent) * 1000) / 10}%`;
}

function clock(seconds: number): string {
	return new Date(seconds * 1000).toLocaleString();
}

export async function runWorkstationDetail(deps: DetailDeps): Promise<number> {
	const credential = deps.credential ?? readCredential(deps.paths);
	if (!credential) {
		error("Not logged in — run 'bat workstation login' first.");
		return 1;
	}
	let limit: number;
	try {
		limit = describeLimit(deps.limit);
	} catch (err) {
		error((err as Error).message);
		return 1;
	}
	let response: WorkstationReportsResponse;
	try {
		response = await (deps.fetch ?? fetchReports)(credential.worker_url, credential.token, limit);
	} catch (err) {
		const message = (err as Error).message;
		error(`Could not read reports: ${message}`);
		if (/Route not allowed|404|not support/i.test(message)) {
			info("This deployment does not expose report readback yet; upgrade the server first.");
		}
		return 1;
	}

	if (deps.json === true) {
		console.log(
			JSON.stringify(
				{
					workstation_id: credential.workstation_id,
					worker_url: credential.worker_url,
					limit: response.limit,
					reports: response.data,
				},
				null,
				2,
			),
		);
		return 0;
	}

	info(`Workstation ${credential.workstation_id} · ${credential.worker_url}`);
	const latest = response.data[0];
	if (!latest) {
		error("No reports stored yet — run 'bat workstation probe' once.");
		return 1;
	}
	success(
		`Newest report ${clock(latest.finished_at)} · CPU ${latest.cpu_usage_pct ?? "—"}% · memory ${latest.mem_used_pct}% · ${answering(latest.connectivity)}/${latest.connectivity.length} answering`,
	);
	table(
		["Target", "Address", "ICMP", "Average", "Loss", "RTTs"],
		latest.connectivity.map((entry) => [
			entry.server_id,
			`${entry.address} v${entry.family}`,
			entry.status,
			averageRtt(entry),
			loss(entry),
			entry.rtts_ms
				.map((value) => (value === null ? "—" : `${Math.round(value * 10) / 10}`))
				.join(" / "),
		]),
	);
	if (response.data.length > 1) {
		info("");
		info(`Earlier reports (${response.data.length - 1})`);
		table(
			["Finished", "CPU", "Memory", "Answering"],
			response.data
				.slice(1)
				.map((entry) => [
					clock(entry.finished_at),
					entry.cpu_usage_pct === null ? "—" : `${entry.cpu_usage_pct}%`,
					`${entry.mem_used_pct}%`,
					`${answering(entry.connectivity)}/${entry.connectivity.length}`,
				]),
		);
	}
	return 0;
}
