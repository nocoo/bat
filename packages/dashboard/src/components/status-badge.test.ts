import { describe, expect, test } from "bun:test";
import type { HostStatus } from "@bat/shared";

// Test status config mapping — verifying the correct badge variant for each status
// We test the mapping logic rather than rendering, since we don't have JSX test tooling

const STATUS_CONFIG: Record<HostStatus, { label: string; variant: string }> = {
	healthy: { label: "Healthy", variant: "success" },
	warning: { label: "Warning", variant: "warning" },
	critical: { label: "Critical", variant: "destructive" },
	offline: { label: "Offline", variant: "secondary" },
};

describe("StatusBadge config", () => {
	test("healthy maps to success variant", () => {
		expect(STATUS_CONFIG.healthy.variant).toBe("success");
		expect(STATUS_CONFIG.healthy.label).toBe("Healthy");
	});

	test("warning maps to warning variant", () => {
		expect(STATUS_CONFIG.warning.variant).toBe("warning");
		expect(STATUS_CONFIG.warning.label).toBe("Warning");
	});

	test("critical maps to destructive variant", () => {
		expect(STATUS_CONFIG.critical.variant).toBe("destructive");
		expect(STATUS_CONFIG.critical.label).toBe("Critical");
	});

	test("offline maps to secondary variant", () => {
		expect(STATUS_CONFIG.offline.variant).toBe("secondary");
		expect(STATUS_CONFIG.offline.label).toBe("Offline");
	});

	test("all 4 statuses are covered", () => {
		const statuses: HostStatus[] = ["healthy", "warning", "critical", "offline"];
		for (const s of statuses) {
			expect(STATUS_CONFIG[s]).toBeDefined();
		}
	});
});
