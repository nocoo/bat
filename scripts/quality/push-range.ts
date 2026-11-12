#!/usr/bin/env bun

const zeroOid = /^0+$/;

export function pushRange(localOid: string, remoteOid: string, remoteName: string): string {
	if (zeroOid.test(remoteOid)) {
		return `${localOid} --not --remotes=${remoteName}`;
	}
	return `${remoteOid}..${localOid}`;
}

if (import.meta.main) {
	const [localOid, remoteOid, remoteName = "origin"] = process.argv.slice(2);
	if (!localOid || !remoteOid) {
		console.error("usage: push-range.ts <local-oid> <remote-oid> [remote-name]");
		process.exit(2);
	}
	process.stdout.write(pushRange(localOid, remoteOid, remoteName));
}
