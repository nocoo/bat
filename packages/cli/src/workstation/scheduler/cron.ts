// Explicit crontab backend. Only the marked block is ever rewritten.

import type { CommandExecutor } from "./exec.js";
import { assertSingleLine, type ScheduleContext } from "./plan.js";

export const CRON_BEGIN = "# BEGIN bat workstation (managed by @nocoo/bat)";
export const CRON_END = "# END bat workstation (managed by @nocoo/bat)";

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * One crontab line with an absolute node, an absolute entry and a log redirect.
 * crontab treats `%` as a newline/stdin separator even inside shell quotes, so
 * every percent is escaped for cron after the shell quoting is applied.
 */
export function cronLine(context: ScheduleContext): string {
	assertSingleLine(context.nodePath, "node path");
	assertSingleLine(context.entryPath, "entry path");
	assertSingleLine(context.logPath, "log path");
	const minutes = Math.max(1, Math.round(context.intervalSeconds / 60));
	const command = [
		shellQuote(context.nodePath),
		shellQuote(context.entryPath),
		"workstation",
		"probe",
		">>",
		shellQuote(context.logPath),
		"2>&1",
	].join(" ");
	return `*/${minutes} * * * * ${command}`.replace(/%/g, () => "\\%");
}

export function stripCronBlock(current: string): { text: string; removed: boolean } {
	const lines = current.split("\n");
	const start = lines.indexOf(CRON_BEGIN);
	const end = lines.indexOf(CRON_END);
	if (start === -1 || end === -1 || end < start) {
		return { text: current, removed: false };
	}
	const kept = [...lines.slice(0, start), ...lines.slice(end + 1)];
	return { text: kept.join("\n").replace(/\n+$/, ""), removed: true };
}

/** Replace our block in place, keep every foreign line untouched. */
export function mergeCronBlock(current: string, block: string): string {
	const { text } = stripCronBlock(current);
	const base = text.trimEnd();
	const blockText = `${CRON_BEGIN}\n${block}\n${CRON_END}`;
	return base.length === 0 ? `${blockText}\n` : `${base}\n${blockText}\n`;
}

export function hasCronBlock(current: string): boolean {
	const start = current.indexOf(CRON_BEGIN);
	const end = current.indexOf(CRON_END);
	return start !== -1 && end > start;
}

export async function readCrontab(exec: CommandExecutor): Promise<string> {
	const result = await exec("crontab", ["-l"], { timeoutMs: 5000 });
	if (result.spawnError) {
		throw new Error(`crontab is unavailable: ${result.spawnError}`);
	}
	if (result.code === 0) {
		return result.stdout;
	}
	if (/no crontab/i.test(`${result.stdout}${result.stderr}`)) {
		return "";
	}
	throw new Error(`crontab -l failed: ${result.stderr.trim() || `exit ${result.code ?? "null"}`}`);
}

export async function writeCrontab(exec: CommandExecutor, content: string): Promise<void> {
	const result = await exec("crontab", ["-"], { input: content, timeoutMs: 5000 });
	if (result.code !== 0) {
		throw new Error(
			`crontab update failed: ${result.stderr.trim() || `exit ${result.code ?? "null"}`}`,
		);
	}
}

export async function installCron(exec: CommandExecutor, context: ScheduleContext): Promise<void> {
	const current = await readCrontab(exec);
	await writeCrontab(exec, mergeCronBlock(current, cronLine(context)));
}

export async function removeCron(exec: CommandExecutor): Promise<boolean> {
	const current = await readCrontab(exec);
	const { text, removed } = stripCronBlock(current);
	if (!removed) {
		return false;
	}
	if (text.trim().length === 0) {
		const result = await exec("crontab", ["-r"], { timeoutMs: 5000 });
		if (result.code !== 0 && !/no crontab/i.test(result.stderr)) {
			throw new Error(
				`crontab removal failed: ${result.stderr.trim() || `exit ${result.code ?? "null"}`}`,
			);
		}
		return true;
	}
	await writeCrontab(exec, `${text.trimEnd()}\n`);
	return true;
}

export async function hasManagedCron(exec: CommandExecutor): Promise<boolean> {
	return hasCronBlock(await readCrontab(exec));
}
