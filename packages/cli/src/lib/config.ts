// CLI configuration management — wraps @nocoo/base-cli ConfigManager.
// Config stored at ~/.config/bat/ with 0600 permissions.

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { ConfigManager } from "@nocoo/base-cli";

/** CLI config shape stored on disk */
export interface BatCliConfig {
	/** Worker API base URL (e.g. "https://bat.hexly.ai") */
	worker_url: string;
	/** CLI Bearer token (plaintext, minted via OAuth login) */
	api_key: string;
	/** Stable installation ID — used as heartbeat source_key */
	source_key: string;
	/** Heartbeat interval in seconds (default: 60) */
	heartbeat_interval?: number;
	/** Allow ConfigManager to accept this as Record<string, unknown> */
	[key: string]: unknown;
}

const CONFIG_DIR_NAME = "bat";
const DEFAULT_HEARTBEAT_INTERVAL = 60;

/**
 * Get the default config directory path: ~/.config/bat
 */
export function getConfigDir(): string {
	return join(homedir(), ".config", CONFIG_DIR_NAME);
}

/**
 * Create a ConfigManager<BatCliConfig> instance.
 *
 * @param configDir - Override config directory (useful for tests)
 * @param isDev - Use dev config file (config.dev.json)
 */
export function createConfigManager(
	configDir?: string,
	isDev = false,
): ConfigManager<BatCliConfig> {
	return new ConfigManager<BatCliConfig>(configDir ?? getConfigDir(), isDev);
}

/**
 * Generate a new random source_key (installation ID).
 * Called once during first login; persisted in config.
 */
export function generateSourceKey(): string {
	return randomUUID();
}

/**
 * Get heartbeat interval from config, falling back to default.
 */
export function getHeartbeatInterval(config: BatCliConfig): number {
	return config.heartbeat_interval ?? DEFAULT_HEARTBEAT_INTERVAL;
}

/**
 * Validate that a config has the minimum required fields for API calls.
 * Returns an error message if invalid, or null if valid.
 */
export function validateConfig(config: BatCliConfig): string | null {
	if (!config.worker_url || typeof config.worker_url !== "string") {
		return "worker_url is missing — run 'bat-cli login' first";
	}
	if (!config.api_key || typeof config.api_key !== "string") {
		return "api_key is missing — run 'bat-cli login' first";
	}
	if (!config.source_key || typeof config.source_key !== "string") {
		return "source_key is missing — run 'bat-cli login' first";
	}
	return null;
}
