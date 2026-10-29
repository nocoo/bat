import type { FullConfig } from "@playwright/test";
import { startTestEnvironment } from "../../../scripts/environments/test-process.mjs";
export default async function setup(config: FullConfig) {
	const runtime = await startTestEnvironment("focused");
	for (const project of config.projects) project.use.baseURL = runtime.base;
	process.env.BAT_E2E_BASE = runtime.base;
	process.env.BAT_E2E_WORKER = runtime.worker;
	process.env.BAT_E2E_WRITE_KEY = runtime.writeKey;
	return runtime.close;
}
