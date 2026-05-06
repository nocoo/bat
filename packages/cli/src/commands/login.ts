// bat-cli login — Browser-based OAuth login flow.
// Opens browser → CF Access authenticates → Worker mints CLI token → redirect back.

import { hostname } from "node:os";
import { defineCommand, openBrowser, performLogin } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../lib/config.js";
import { createConfigManager, generateSourceKey } from "../lib/config.js";
import { error, info, success, warn } from "../lib/output.js";

/** Default Dashboard URL (bat.hexly.ai serves both dashboard and API) */
const DEFAULT_URL = "https://bat.hexly.ai";

/** Login timeout in milliseconds */
const LOGIN_TIMEOUT_MS = 120_000;

/**
 * Run the login flow. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runLogin(
	manager: ConfigManager<BatCliConfig>,
	dashboardUrl: string,
): Promise<number> {
	// Warn if overwriting existing config
	if (manager.exists()) {
		warn(`Config already exists at ${manager.configPath}`);
		info("Existing credentials will be overwritten.");
	}

	info("Opening browser for authentication...");
	info(`Dashboard: ${dashboardUrl}`);

	const localHostname = hostname();
	info(`Host name: ${localHostname}`);

	let apiKey: string | undefined;

	const result = await performLogin({
		openBrowser,
		onSaveToken: (token: string) => {
			apiKey = token;
		},
		apiUrl: dashboardUrl,
		loginPath: "/api/auth/cli",
		tokenParam: "api_key",
		timeoutMs: LOGIN_TIMEOUT_MS,
		accentColor: "#3b82f6", // bat blue
		extraParams: { hostname: localHostname },
	});

	if (!(result.success && apiKey)) {
		error(`Login failed: ${result.error ?? "No API key received"}`);
		return 1;
	}

	// Get worker_url from callback params
	const workerUrl = result.params?.worker_url;
	if (!workerUrl) {
		error("Login failed: No worker_url received from server");
		return 1;
	}

	success("Authentication successful!");
	if (result.email) {
		info(`Logged in as: ${result.email}`);
	}

	// Read existing config (may have source_key) or generate new
	const existing = manager.read();
	const sourceKey = existing.source_key || generateSourceKey();

	// Write config
	manager.write({
		worker_url: workerUrl,
		api_key: apiKey,
		source_key: sourceKey,
	} as BatCliConfig);

	success(`Config saved to ${manager.configPath}`);
	info(`Source key: ${sourceKey}`);

	// Print next steps
	info("");
	info("Next steps:");
	info("  bat-cli status              — verify connection");
	info("  bat-cli agent list          — list registered agents");
	info("  bat-cli agent create ...    — register a new agent");

	return 0;
}

export default defineCommand({
	meta: {
		name: "login",
		description: "Login via browser OAuth and configure CLI",
	},
	args: {
		url: {
			type: "string",
			description: "Dashboard URL",
			default: DEFAULT_URL,
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		process.exitCode = await runLogin(manager, args.url);
	},
});
