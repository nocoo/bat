// Auth bypass E2E tests
// Split from core-flows.spec.ts — auth-related flows

import { expect, test } from "@playwright/test";

test.describe("Auth bypass", () => {
	test("E2E_SKIP_AUTH allows direct access to /hosts", async ({ page }) => {
		await page.goto("/hosts");
		// With E2E_SKIP_AUTH=1, user is auto-authenticated — should stay on /hosts
		await page.waitForURL("**/hosts");
		expect(page.url()).toContain("/hosts");
	});

	test("login page renders", async ({ page }) => {
		await page.goto("/login");
		await expect(page.locator("body")).toBeVisible();
	});
});
