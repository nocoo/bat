// Target discovery for workstations: the owner's currently authorized servers
// only. Targets are always server-observed public addresses, so a key can never
// widen its own reach or point a probe at a private address.

import { configuredManager } from "../domain/connect.js";
import type { Repositories } from "../repos/types.js";
import type { WorkstationServerTarget } from "../repos/workstations.js";

export async function discoverWorkstationTargets(
	repos: Repositories,
	managers: string | undefined,
	owner: string,
): Promise<WorkstationServerTarget[]> {
	const servers = await repos.connect.servers(owner, configuredManager(managers, owner));
	return repos.workstations.listServerTargets(servers.map((server) => server.id));
}

/** Every reported connectivity entry must match a current authorized target. */
export function reportTargetsAllowed(
	entries: ReadonlyArray<{ server_id: string; address: string; family: number }>,
	targets: ReadonlyArray<WorkstationServerTarget>,
): boolean {
	const byId = new Map(targets.map((target) => [target.server_id, target]));
	return entries.every((entry) => {
		const target = byId.get(entry.server_id);
		return (
			target !== undefined && target.address === entry.address && target.family === entry.family
		);
	});
}
