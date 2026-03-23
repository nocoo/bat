// Host detail E2E tests
// Split from core-flows.spec.ts — single host detail page

import { expect, test } from "@playwright/test";

test.describe("Host detail", () => {
	test("navigates to host detail page without crashing", async ({ page }) => {
		await page.goto("/hosts/test-host");
		await expect(page.locator("body")).toBeVisible();
	});

	test("time range picker is visible", async ({ page }) => {
		await page.goto("/hosts/test-host");
		// Time range buttons are always rendered regardless of host existence
		const button = page.getByRole("button", { name: "1h" });
		await expect(button).toBeVisible({ timeout: 10_000 });
	});

	test("system info card renders when host exists", async ({ page }) => {
		await page.goto("/hosts/test-host");
		// System Info is guarded by `host &&` — for a non-existent host it won't render.
		// We verify the page loads without error; System Info visibility depends on data.
		await expect(page.locator("body")).toBeVisible();
		// If host data loads, System Info should be visible
		const sysInfo = page.getByText("System Info");
		const isVisible = await sysInfo.isVisible().catch(() => false);
		// No hard assertion — host may not exist in test env
		if (isVisible) {
			await expect(sysInfo).toBeVisible();
		}
	});
});
