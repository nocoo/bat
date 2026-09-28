import { startTestEnvironment } from "../../../../scripts/environments/test-process.mjs";

let runtime: Awaited<ReturnType<typeof startTestEnvironment>>;
export async function setup() {
	runtime = await startTestEnvironment("empty");
	process.env.BAT_E2E_BASE = runtime.base;
	process.env.BAT_E2E_WORKER = runtime.worker;
	process.env.BAT_E2E_WRITE_KEY = runtime.writeKey;
	process.env.BAT_E2E_READ_KEY = runtime.readKey;
}
export async function teardown() {
	await runtime?.close();
}
