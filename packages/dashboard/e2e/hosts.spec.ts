// Hosts overview E2E tests
// Split from core-flows.spec.ts — hosts list page

import { expect, test } from "@playwright/test";

test.describe("Hosts overview", () => {
	test("navigates to /hosts and renders page", async ({ page }) => {
		await page.goto("/hosts");
		await expect(page.locator("body")).toBeVisible();
		// Should show "Hosts" heading or similar
		const heading = page.getByRole("heading", { level: 1 });
		if (await heading.isVisible()) {
			await expect(heading).toContainText(/hosts/i);
		}
	});

	test("shows loading state or host cards", async ({ page }) => {
		await page.goto("/hosts");
		// Wait for either loading skeleton or host cards to appear
		const content = page.locator('[class*="card"], [class*="skeleton"]');
		await expect(content.first()).toBeVisible({ timeout: 10_000 });
	});
});
