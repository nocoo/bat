export type EnvironmentMode = "demo" | "e2e" | "prod";
export interface EnvironmentInstance {
	id: string;
	mode: EnvironmentMode;
	locked: boolean;
	visible: boolean;
	anchor?: number;
}
interface LocalCapability {
	capability: string;
	initial?: EnvironmentMode;
	locked: boolean;
	visible: boolean;
	instance: EnvironmentInstance | null;
}
declare global {
	interface Window {
		__BAT_LOCAL__?: LocalCapability;
	}
}
export const preferenceKey = "bat:environment-mode";
const instanceKey = "bat:environment-instance";
export let environment: EnvironmentInstance | null = null;
export function environmentUrl(path: string): string {
	return environment ? `/__bat/instances/${environment.id}${path}` : path;
}
function storageRead(storage: Storage, key: string) {
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}
function storageWrite(storage: Storage, key: string, value: string) {
	try {
		storage.setItem(key, value);
	} catch {}
}
function storageRemove(storage: Storage, key: string) {
	try {
		storage.removeItem(key);
	} catch {}
}
export async function initializeEnvironment() {
	const config = window.__BAT_LOCAL__;
	if (!config) return;
	if (config.locked) {
		environment = config.instance;
		return;
	}
	let previous: string | null = null,
		saved: string | null = null;
	try {
		previous = storageRead(sessionStorage, instanceKey);
		saved = storageRead(localStorage, preferenceKey);
	} catch {}
	if (previous) {
		const response = await fetch(`/__bat/environment?id=${encodeURIComponent(previous)}`, {
			headers: { "X-Bat-Local": config.capability },
		});
		if (response.ok) {
			environment = await response.json();
			return;
		}
		storageRemove(sessionStorage, instanceKey);
	}
	const mode = config.initial ?? (["demo", "e2e", "prod"].includes(saved ?? "") ? saved : "demo");
	await selectEnvironment(mode as EnvironmentMode, false);
}
export async function selectEnvironment(mode: EnvironmentMode, remember = true) {
	const config = window.__BAT_LOCAL__;
	if (!config || config.locked) throw new Error("Environment switching is unavailable");
	const request = (previous?: string) =>
		fetch("/__bat/environment", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Bat-Local": config.capability },
			body: JSON.stringify({ mode, previous }),
		});
	let response = await request(environment?.id);
	// A launcher restart or an expired instance left the stored id stale;
	// drop it and retry once instead of bricking the tab.
	if (response.status === 410) {
		environment = null;
		storageRemove(sessionStorage, instanceKey);
		response = await request();
	}
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? "Environment switch failed");
	environment = result as EnvironmentInstance;
	try {
		storageWrite(sessionStorage, instanceKey, result.id);
		if (remember) storageWrite(localStorage, preferenceKey, mode);
	} catch {}
}
