// bat workstation logout — revoke the workstation key, then forget the credential.
// The installation UUID is kept; the schedule is never removed silently.

import { defineCommand } from "@nocoo/base-cli";
import { ApiError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";
import { revokeWorkstationKey } from "../../workstation/api.js";
import {
	deleteCredential,
	getWorkstationPaths,
	readCredential,
	readScheduleRecord,
	type WorkstationPaths,
} from "../../workstation/store.js";

export interface LogoutDeps {
	paths?: WorkstationPaths;
	/** Injectable revoke call. */
	revoke?: typeof revokeWorkstationKey;
}

export async function runLogoutCommand(deps: LogoutDeps = {}): Promise<number> {
	const paths = deps.paths ?? getWorkstationPaths();
	try {
		const credential = readCredential(paths);
		if (!credential) {
			warn("No workstation credential stored on this machine.");
			info("The installation UUID is kept for this machine.");
			return 0;
		}

		let alreadyInvalid = false;
		try {
			await (deps.revoke ?? revokeWorkstationKey)(credential.worker_url, credential.token);
		} catch (err) {
			// A trusted 401 means the key is already gone (revoked, rotated or the
			// workstation was deleted): the local credential is safe to clear.
			if (err instanceof ApiError && err.status === 401) {
				alreadyInvalid = true;
			} else {
				error(`Revoke failed: ${(err as Error).message}`);
				error("The credential was kept — the workstation key may still be active.");
				return 1;
			}
		}

		deleteCredential(paths);
		success(
			alreadyInvalid
				? "The server reports the key is already invalid; local credential removed."
				: "Workstation key revoked and credential removed.",
		);
		info("The installation UUID is kept for this machine.");

		const schedule = readScheduleRecord(paths);
		if (schedule) {
			warn("A probe schedule is still installed; remove it with 'bat workstation setup --remove'.");
		}
		return 0;
	} catch (err) {
		warn((err as Error).message);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "logout",
		description: "Revoke the workstation key and remove the stored credential",
	},
	async run() {
		process.exitCode = await runLogoutCommand();
	},
});
